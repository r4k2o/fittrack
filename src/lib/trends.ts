// Every metric is reduced to one value per day, then shown as a weekly average and
// a smoothed trend, so no chart presents a single noisy day as progress.

import { addDays, daysBetween, weekStart } from './dates'

export interface DayValue {
  date: string
  value: number
}

/** Exponential smoothing: each reading moves the trend 10% of the way toward it. */
export function ema(values: readonly DayValue[], alpha = 0.1): DayValue[] {
  const sorted = [...values].sort((a, b) => a.date.localeCompare(b.date))
  const out: DayValue[] = []
  let trend: number | null = null
  for (const v of sorted) {
    trend = trend == null ? v.value : trend + alpha * (v.value - trend)
    out.push({ date: v.date, value: trend })
  }
  return out
}

/** The trend value on `date`, carried forward from the last reading on or before it. */
export function valueOn(series: readonly DayValue[], date: string): number | null {
  let found: number | null = null
  for (const p of series) {
    if (p.date <= date) found = p.value
    else break
  }
  return found
}

export interface WeekAverage {
  /** Monday of the week. */
  week: string
  avg: number | null
  days: number
}

/** Mean of the days present per ISO week; null unless at least `minDays` of 7 have a value. */
export function weeklyAverages(values: readonly DayValue[], minDays = 4): WeekAverage[] {
  const byWeek = new Map<string, number[]>()
  for (const v of values) {
    const w = weekStart(v.date)
    const list = byWeek.get(w) ?? []
    list.push(v.value)
    byWeek.set(w, list)
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, list]) => ({
      week,
      days: list.length,
      avg: list.length >= minDays ? list.reduce((s, x) => s + x, 0) / list.length : null,
    }))
}

/**
 * Rate of change: trend today minus trend `spanDays` ago, per week, as a share of
 * body weight (in %). Null when the trend does not reach back far enough.
 */
export function ratePctPerWeek(trend: readonly DayValue[], today: string, spanDays = 14): number | null {
  if (trend.length === 0) return null
  const past = addDays(today, -spanDays)
  if (trend[0].date > past) return null
  const now = valueOn(trend, today)
  const then = valueOn(trend, past)
  if (now == null || then == null || then === 0) return null
  return ((now - then) / then) * 100 * (7 / spanDays)
}

/** Estimated one-rep max (Epley): weight × (1 + reps ÷ 30), from sets of 10 reps or fewer. */
export function e1rm(weightKg: number, reps: number): number | null {
  if (reps < 1 || reps > 10 || weightKg <= 0) return null
  return weightKg * (1 + reps / 30)
}

export const KCAL_PER_KG = 7700

/**
 * True expenditure from real data: average intake minus trend weight change × 7,700 kcal
 * per kg ÷ days. Needs `days` days with at least 80% of them logged. A steering signal,
 * not a measurement: 7,700 kcal per kg is a convention.
 */
export function estimateExpenditure(
  intakeByDay: ReadonlyMap<string, number>,
  trend: readonly DayValue[],
  endDate: string,
  days = 14,
): { kcal: number; loggedDays: number; avgIntake: number; trendChangeKg: number } | null {
  const start = addDays(endDate, -(days - 1))
  let logged = 0
  let total = 0
  for (let i = 0; i < days; i++) {
    const v = intakeByDay.get(addDays(start, i))
    if (v != null && v > 0) {
      logged += 1
      total += v
    }
  }
  if (logged < Math.ceil(days * 0.8)) return null
  const tEnd = valueOn(trend, endDate)
  const tStart = valueOn(trend, addDays(start, -1))
  if (tEnd == null || tStart == null) return null
  const span = daysBetween(addDays(start, -1), endDate)
  const avgIntake = total / logged
  const trendChangeKg = tEnd - tStart
  return { kcal: avgIntake - (trendChangeKg * KCAL_PER_KG) / span, loggedDays: logged, avgIntake, trendChangeKg }
}
