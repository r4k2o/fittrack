// The weekly review: one card each Monday that sums up the week before and ends with
// at most one suggestion. And the target correction from real data: after 14 days with
// at least 80% of them logged, measured expenditure replaces the formula's maintenance
// when the two differ by more than 5%.

import type { GoalType } from '../db'
import { calculateTargets, GOALS, type TargetInputs, type TargetResult } from './nutrition'
import { KCAL_PER_KG, ratePctPerWeek, valueOn, type DayValue } from './trends'
import { addDays } from './dates'
import { GROUP_LABEL, GROUPS, VOLUME_FLOOR, type Group, type Volume } from './volume'

export interface ReviewInput {
  /** Monday of the week under review. */
  week: string
  trend: readonly DayValue[]
  goal: GoalType | null
  adherence: { logged: number; onTarget: number } | null
  /** Hard sets per group that week, when any training was logged. */
  sets: Volume | null
  sleepMin: readonly DayValue[]
  steps: readonly DayValue[]
  cardioMin: number
}

export type RateStatus = 'on' | 'below' | 'above' | 'fast'

export interface Suggestion {
  text: string
  /** A calorie change the user can apply with one tap. */
  kcalDelta?: number
}

export interface WeeklyReview {
  week: string
  /** Trend change over the week in kg, and the 14-day rate in % per week at its end. */
  weightChangeKg: number | null
  rate: number | null
  band: readonly [number, number] | null
  status: RateStatus | null
  adherence: { logged: number; onTarget: number } | null
  /** Whether any training was logged that week; lowGroups is only meaningful then. */
  trained: boolean
  lowGroups: { group: Group; sets: number }[]
  avgSleepMin: number | null
  avgSteps: number | null
  cardioMin: number
  suggestion: Suggestion | null
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null)

export function rateStatus(rate: number | null, band: readonly [number, number] | null): RateStatus | null {
  if (rate == null || !band) return null
  if (rate < -1 || rate > 0.5) return 'fast'
  if (rate < band[0] - 0.05) return 'below'
  if (rate > band[1] + 0.05) return 'above'
  return 'on'
}

/**
 * Calories a day that would move the weekly rate back to the nearest edge of the
 * goal's band: rate gap × weight × 7,700 kcal per kg ÷ 7, rounded toward zero to 50.
 */
export function kcalCorrection(rate: number, band: readonly [number, number], weightKg: number): number {
  const edge = rate > band[1] ? band[1] : rate < band[0] ? band[0] : rate
  const perDay = (((edge - rate) / 100) * weightKg * KCAL_PER_KG) / 7
  return Math.sign(perDay) * Math.floor(Math.abs(perDay) / 50) * 50
}

const pct = (n: number) => `${Math.abs(n).toFixed(2).replace(/0$/, '').replace('.', ',')} %`

export function weeklyReview(input: ReviewInput): WeeklyReview {
  const end = addDays(input.week, 6)
  const band = input.goal ? GOALS[input.goal].rateBand : null
  const rate = ratePctPerWeek(input.trend, end)
  const tEnd = valueOn(input.trend, end)
  const tStart = valueOn(input.trend, addDays(input.week, -1))
  const weightChangeKg = tEnd != null && tStart != null ? tEnd - tStart : null
  const status = rateStatus(rate, band)
  const inWeek = (p: DayValue) => p.date >= input.week && p.date <= end
  const lowGroups = input.sets ? GROUPS.filter((g) => input.sets![g] < VOLUME_FLOOR).map((g) => ({ group: g, sets: input.sets![g] })) : []

  let suggestion: Suggestion | null = null
  if (rate != null && band && tEnd != null && status && status !== 'on') {
    const delta = kcalCorrection(rate, band, tEnd)
    const dir = rate >= 0 ? 'Zunahme' : 'Abnahme'
    const bandText = `${band[0] > 0 ? '' : '−'}${pct(band[0])} bis ${band[1] > 0 ? '' : '−'}${pct(band[1])}`
    const where = rate > band[1] ? 'über' : 'unter'
    if (delta !== 0)
      suggestion = {
        text: `${dir} im Trend: ${pct(rate)} pro Woche, ${where} dem Ziel von ${bandText}. ${Math.abs(delta)} kcal am Tag ${delta < 0 ? 'weniger' : 'mehr'}?`,
        kcalDelta: delta,
      }
  }
  if (!suggestion && input.sets && lowGroups.length && lowGroups.length < GROUPS.length) {
    const worst = [...lowGroups].sort((a, b) => a.sets - b.sets)[0]
    suggestion = { text: `${GROUP_LABEL[worst.group]}: nur ${worst.sets.toFixed(1).replace('.', ',').replace(/,0$/, '')} harte Sätze, unter 10. Im Plan-Editor siehst du, wo ein, zwei mehr passen.` }
  }

  return {
    week: input.week,
    weightChangeKg,
    rate,
    band,
    status,
    adherence: input.adherence,
    trained: !!input.sets,
    lowGroups,
    avgSleepMin: mean(input.sleepMin.filter(inWeek).map((p) => p.value)),
    avgSteps: mean(input.steps.filter(inWeek).map((p) => p.value)),
    cardioMin: input.cardioMin,
    suggestion,
  }
}

export interface AdaptiveProposal {
  /** Expenditure measured from intake and trend. */
  measuredKcal: number
  /** The maintenance the current target uses. */
  currentKcal: number
  diffPct: number
  result: TargetResult
  inputs: TargetInputs
}

/** A new target from measured expenditure, when it differs from the current maintenance by over 5%. */
export function adaptiveProposal(measuredKcal: number | null, inputs: TargetInputs, weightKg?: number | null): AdaptiveProposal | null {
  if (measuredKcal == null || measuredKcal <= 0) return null
  const current = calculateTargets(inputs).maintenanceKcal
  const diffPct = ((measuredKcal - current) / current) * 100
  if (Math.abs(diffPct) <= 5) return null
  const next: TargetInputs = { ...inputs, maintenanceOverride: Math.round(measuredKcal / 10) * 10, kcalOverride: undefined }
  if (weightKg && weightKg > 0) next.weightKg = Math.round(weightKg * 10) / 10
  return { measuredKcal: Math.round(measuredKcal), currentKcal: current, diffPct, result: calculateTargets(next), inputs: next }
}
