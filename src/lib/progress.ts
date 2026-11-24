// Trend maths for the Progress tabs and the weekly review, as plain functions.

import type { Exercise, NutritionTarget, SetLog } from '../db'
import { addDays, weekStart } from './dates'
import { e1rm, type DayValue } from './trends'
import { addCredits, emptyVolume, groupCredits, type Volume } from './volume'

/** Mean of the values in the 7 days ending on each date, when at least `minDays` have one. */
export function movingAverage(points: readonly DayValue[], window = 7, minDays = 4): DayValue[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date))
  if (!sorted.length) return []
  const byDate = new Map(sorted.map((p) => [p.date, p.value]))
  const out: DayValue[] = []
  for (let d = sorted[0].date; d <= sorted[sorted.length - 1].date; d = addDays(d, 1)) {
    let sum = 0
    let n = 0
    for (let i = 0; i < window; i++) {
      const v = byDate.get(addDays(d, -i))
      if (v != null) {
        sum += v
        n++
      }
    }
    if (n >= minDays) out.push({ date: d, value: sum / n })
  }
  return out
}

/** Weekly mean of daily values (Monday weeks), with the number of days behind each. */
export function weeklyMeans(points: readonly DayValue[]): { week: string; mean: number; days: number }[] {
  const byWeek = new Map<string, number[]>()
  for (const p of points) {
    const w = weekStart(p.date)
    byWeek.set(w, [...(byWeek.get(w) ?? []), p.value])
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, list]) => ({ week, mean: list.reduce((s, x) => s + x, 0) / list.length, days: list.length }))
}

/** Hard sets per muscle group for each week, from logged work sets. */
export function weeklySets(sets: readonly Pick<SetLog, 'exerciseId' | 'date' | 'kind'>[], exercises: ReadonlyMap<string, Pick<Exercise, 'primary' | 'secondary'>>): Map<string, Volume> {
  const out = new Map<string, Volume>()
  for (const s of sets) {
    if (s.kind !== 'work') continue
    const ex = exercises.get(s.exerciseId)
    if (!ex) continue
    const w = weekStart(s.date)
    const v = out.get(w) ?? emptyVolume()
    addCredits(v, groupCredits(ex), 1)
    out.set(w, v)
  }
  return out
}

/** The best estimated 1RM per week for one lift (sets of 10 reps or fewer). */
export function weeklyBestE1rm(sets: readonly Pick<SetLog, 'date' | 'kind' | 'weightKg' | 'reps'>[]): DayValue[] {
  const best = new Map<string, number>()
  for (const s of sets) {
    if (s.kind !== 'work') continue
    const v = e1rm(s.weightKg, s.reps)
    if (v == null) continue
    const w = weekStart(s.date)
    if (v > (best.get(w) ?? 0)) best.set(w, v)
  }
  return [...best.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }))
}

export interface DayIntake {
  date: string
  kcal: number
  protein: number
}

/** The target valid on each day: the newest row whose effectiveFrom is on or before it. */
export function targetLookup(targets: readonly Pick<NutritionTarget, 'effectiveFrom' | 'kcal' | 'proteinG'>[]) {
  const sorted = [...targets].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
  return (date: string) => {
    let found: (typeof sorted)[number] | null = null
    for (const t of sorted) {
      if (t.effectiveFrom <= date) found = t
      else break
    }
    return found
  }
}

export interface WeekAdherence {
  week: string
  logged: number
  onTarget: number
}

/** On target: calories within 10% of the target and protein at least 90% of it. */
export function isOnTarget(day: DayIntake, target: { kcal: number; proteinG: number }): boolean {
  return Math.abs(day.kcal - target.kcal) <= target.kcal * 0.1 && day.protein >= target.proteinG * 0.9
}

/** Per week: days logged (any calories) and how many of them were on target. */
export function adherenceByWeek(days: readonly DayIntake[], targetOn: (date: string) => { kcal: number; proteinG: number } | null): WeekAdherence[] {
  const byWeek = new Map<string, WeekAdherence>()
  for (const d of days) {
    if (d.kcal <= 0) continue
    const w = weekStart(d.date)
    const a = byWeek.get(w) ?? { week: w, logged: 0, onTarget: 0 }
    a.logged++
    const t = targetOn(d.date)
    if (t && isOnTarget(d, t)) a.onTarget++
    byWeek.set(w, a)
  }
  return [...byWeek.values()].sort((a, b) => a.week.localeCompare(b.week))
}
