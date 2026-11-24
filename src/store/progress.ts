// Queries behind the Progress tabs, the weekly review and the target correction.

import Dexie from 'dexie'
import { db, newRow, type Exercise, type NutritionTarget } from '../db'
import { weekMinutes } from '../lib/cardio'
import { addDays, localDay, weekStart } from '../lib/dates'
import { adherenceByWeek, targetLookup, weeklyBestE1rm, weeklySets, type DayIntake } from '../lib/progress'
import { adaptiveProposal, weeklyReview, type AdaptiveProposal, type WeeklyReview } from '../lib/review'
import { ema, estimateExpenditure, type DayValue } from '../lib/trends'
import type { Volume } from '../lib/volume'
import { cardioBetween } from './cardio'
import { metricSeries } from './metrics'
import { getSetting, setSetting } from './settings'

export async function exerciseMap(): Promise<Map<string, Exercise>> {
  return new Map((await db.exercises.toArray()).map((e) => [e.id, e]))
}

/** Hard sets per group for each week between two dates. */
export async function setsByWeek(from: string, to: string): Promise<Map<string, Volume>> {
  const sets = await db.setLogs.filter((s) => s.date >= from && s.date <= to).toArray()
  return weeklySets(sets, await exerciseMap())
}

/** Lifts with the most sessions that give an estimated 1RM, most frequent first. */
export async function topLifts(since: string, limit = 6): Promise<Exercise[]> {
  const sets = await db.setLogs.filter((s) => s.date >= since && s.kind === 'work' && s.reps <= 10 && s.weightKg > 0).toArray()
  const sessions = new Map<string, Set<string>>()
  for (const s of sets) sessions.set(s.exerciseId, (sessions.get(s.exerciseId) ?? new Set()).add(s.sessionId))
  const ids = [...sessions.entries()].sort((a, b) => b[1].size - a[1].size).slice(0, limit).map(([id]) => id)
  const rows = await db.exercises.bulkGet(ids)
  return rows.filter((e): e is Exercise => !!e)
}

export async function liftHistory(exerciseId: string): Promise<DayValue[]> {
  const sets = await db.setLogs.where('[exerciseId+date]').between([exerciseId, Dexie.minKey], [exerciseId, Dexie.maxKey]).toArray()
  return weeklyBestE1rm(sets)
}

export async function dayIntakes(from: string, to: string): Promise<DayIntake[]> {
  const rows = await db.diaryEntries.where('date').between(from, to, true, true).toArray()
  const by = new Map<string, DayIntake>()
  for (const r of rows) {
    const d = by.get(r.date) ?? { date: r.date, kcal: 0, protein: 0 }
    d.kcal += r.macros.kcal
    d.protein += r.macros.protein
    by.set(r.date, d)
  }
  return [...by.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export async function allTargets(): Promise<NutritionTarget[]> {
  return db.nutritionTargets.orderBy('effectiveFrom').toArray()
}

export async function weightTrend(from = '0000-00-00', to = '9999-99-99'): Promise<DayValue[]> {
  return ema(await metricSeries('weight', from, to))
}

/** The review of the week that starts on `monday`. */
export async function reviewForWeek(monday: string): Promise<WeeklyReview> {
  const end = addDays(monday, 6)
  const [trend, goal, intakes, targets, sets, sleepMin, steps, cardio] = await Promise.all([
    weightTrend(addDays(monday, -60), end),
    db.goals.where('active').equals(1).first(),
    dayIntakes(monday, end),
    allTargets(),
    setsByWeek(monday, end),
    metricSeries('sleepMin', monday, end),
    metricSeries('steps', monday, end),
    cardioBetween(monday, end),
  ])
  const adherence = adherenceByWeek(intakes, targetLookup(targets))[0] ?? null
  return weeklyReview({
    week: monday,
    trend,
    goal: goal?.type ?? null,
    adherence: adherence ? { logged: adherence.logged, onTarget: adherence.onTarget } : null,
    sets: sets.get(monday) ?? null,
    sleepMin,
    steps,
    cardioMin: weekMinutes(cardio).moderateEquivalent,
  })
}

/** Last week's review, shown on Today on Mondays until dismissed. */
export async function mondayReview(today = localDay()): Promise<WeeklyReview | null> {
  const monday = weekStart(today)
  if (today !== monday) return null
  if ((await getSetting('reviewDismissedWeek')) === monday) return null
  const r = await reviewForWeek(addDays(monday, -7))
  const anything = r.weightChangeKg != null || r.adherence || r.avgSleepMin != null || r.avgSteps != null || r.cardioMin > 0 || r.trained
  return anything ? r : null
}

export async function dismissReview(today = localDay()): Promise<void> {
  await setSetting('reviewDismissedWeek', weekStart(today))
}

/** A new target row from today, carrying the inputs and new numbers. */
async function addTargetRow(fields: Pick<NutritionTarget, 'kcal' | 'proteinG' | 'carbsG' | 'fatG' | 'method' | 'inputs'>, today: string): Promise<void> {
  const current = await db.nutritionTargets.where('effectiveFrom').belowOrEqual(today).last()
  const row = { goalId: current?.goalId ?? '', effectiveFrom: today, ...fields }
  const sameDay = await db.nutritionTargets.where('effectiveFrom').equals(today).first()
  if (sameDay) await db.nutritionTargets.put({ ...sameDay, ...row, updatedAt: new Date().toISOString() })
  else await db.nutritionTargets.add(newRow<NutritionTarget>(row))
}

/** Applies the review's calorie change: protein and fat stay, carbohydrate takes the difference. */
export async function applyKcalChange(delta: number, today = localDay()): Promise<void> {
  const current = await db.nutritionTargets.where('effectiveFrom').belowOrEqual(today).last()
  if (!current) return
  const kcal = current.kcal + delta
  const carbsG = Math.max(0, Math.round((kcal - 4 * current.proteinG - 9 * current.fatG) / 4))
  await addTargetRow({ kcal, proteinG: current.proteinG, fatG: current.fatG, carbsG, method: current.method, inputs: { ...current.inputs, kcalOverride: kcal } }, today)
}

export interface ExpenditureState {
  estimate: { kcal: number; loggedDays: number; avgIntake: number; trendChangeKg: number } | null
  proposal: AdaptiveProposal | null
  /** Days with food logged in the last 14 complete days. */
  loggedDays: number
}

/** Measured expenditure over the last 14 complete days and, if it differs enough, new targets. */
export async function expenditureState(today = localDay()): Promise<ExpenditureState> {
  const end = addDays(today, -1)
  const start = addDays(end, -13)
  const [intakes, trend, current] = await Promise.all([dayIntakes(start, end), weightTrend(addDays(start, -60), end), db.nutritionTargets.where('effectiveFrom').belowOrEqual(today).last()])
  const byDay = new Map(intakes.map((d) => [d.date, d.kcal]))
  const estimate = estimateExpenditure(byDay, trend, end, 14)
  const loggedDays = intakes.filter((d) => d.kcal > 0).length
  const proposal = estimate && current ? adaptiveProposal(estimate.kcal, current.inputs, trend.at(-1)?.value) : null
  return { estimate, proposal, loggedDays }
}

export async function acceptProposal(p: AdaptiveProposal, today = localDay()): Promise<void> {
  await addTargetRow({ kcal: p.result.kcal, proteinG: p.result.proteinG, carbsG: p.result.carbsG, fatG: p.result.fatG, method: 'adaptive', inputs: p.inputs }, today)
  await setSetting('adaptiveSnoozedUntil', null)
}

export async function snoozeProposal(today = localDay()): Promise<void> {
  await setSetting('adaptiveSnoozedUntil', addDays(today, 7))
}
