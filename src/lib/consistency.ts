// Training consistency: a calendar of the last weeks with one cell per day, shaded by
// how much was trained, plus a few plain numbers about how regular the training was.

import { addDays, daysBetween, parseDay, weekStart } from './dates'

export interface DayLoad {
  date: string
  /** Finished strength workouts that day. */
  sessions: number
  /** Hard (work) sets across them. */
  sets: number
  /** Cardio minutes. */
  cardioMin: number
  /** Workout names, for the day's detail line. */
  names: string[]
}

export type HeatLevel = 0 | 1 | 2 | 3 | 4

/** Any training is level 1; 10, 16 and 22 hard sets step it up. Cardio alone is level 1. */
export function heatLevel(d: Pick<DayLoad, 'sets' | 'sessions' | 'cardioMin'> | undefined): HeatLevel {
  if (!d) return 0
  if (d.sets >= 22) return 4
  if (d.sets >= 16) return 3
  if (d.sets >= 10) return 2
  return d.sets > 0 || d.sessions > 0 || d.cardioMin > 0 ? 1 : 0
}

export const trained = (d: DayLoad | undefined) => heatLevel(d) > 0

export interface HeatCell {
  date: string
  level: HeatLevel
  future: boolean
}

export interface HeatGrid {
  /** Oldest week first; each holds Monday to Sunday. */
  weeks: { monday: string; days: HeatCell[] }[]
  /** Column index and short month name where a month starts. */
  months: { col: number; label: string }[]
}

const MONTH = new Intl.DateTimeFormat('de-DE', { month: 'short' })

export function heatGrid(loads: ReadonlyMap<string, DayLoad>, today: string, weeks = 16): HeatGrid {
  const first = addDays(weekStart(today), -7 * (weeks - 1))
  const out: HeatGrid = { weeks: [], months: [] }
  let lastMonth = -1
  for (let w = 0; w < weeks; w++) {
    const monday = addDays(first, 7 * w)
    const days = Array.from({ length: 7 }, (_, i) => {
      const date = addDays(monday, i)
      return { date, level: date > today ? 0 : heatLevel(loads.get(date)), future: date > today } as HeatCell
    })
    out.weeks.push({ monday, days })
    // a month label sits over the first column whose Monday falls in that month
    const month = parseDay(monday).getMonth()
    if (month !== lastMonth) {
      if (w > 0 || parseDay(monday).getDate() <= 7) out.months.push({ col: w, label: MONTH.format(parseDay(monday)).replace('.', '') })
      lastMonth = month
    }
  }
  return out
}

export interface Consistency {
  /** Days with any training in the window. */
  trainingDays: number
  /** Weeks with at least one training day, of the weeks since training began (window-capped). */
  activeWeeks: number
  weeksCounted: number
  /** Training days per week over the last complete weeks (up to 8), or null before the first complete week. */
  perWeek: number | null
  /** Training days so far this week. */
  thisWeek: number
  /** Consecutive weeks with training, ending this week (or last week, while this one is still empty). */
  streakWeeks: number
}

export function consistency(loads: ReadonlyMap<string, DayLoad>, today: string, weeks = 16): Consistency {
  const monday = weekStart(today)
  const start = addDays(monday, -7 * (weeks - 1))
  const days = [...loads.values()].filter((d) => trained(d) && d.date <= today).map((d) => d.date)
  const firstEver = days.length ? days.reduce((a, b) => (a < b ? a : b)) : null
  const countWeek = (m: string) => {
    let n = 0
    for (let i = 0; i < 7; i++) if (trained(loads.get(addDays(m, i)))) n++
    return n
  }
  const inWindow = days.filter((d) => d >= start)
  const from = firstEver ? (weekStart(firstEver) > start ? weekStart(firstEver) : start) : monday
  const weeksCounted = firstEver ? Math.floor(daysBetween(from, monday) / 7) + 1 : 0
  let activeWeeks = 0
  for (let i = 0; i < weeksCounted; i++) if (countWeek(addDays(from, 7 * i)) > 0) activeWeeks++

  const complete = Math.min(8, weeksCounted - 1)
  let perWeek: number | null = null
  if (complete > 0) {
    let n = 0
    for (let i = 1; i <= complete; i++) n += countWeek(addDays(monday, -7 * i))
    perWeek = n / complete
  }

  let streakWeeks = 0
  let m = countWeek(monday) > 0 ? monday : addDays(monday, -7)
  while (firstEver && m >= weekStart(firstEver) && countWeek(m) > 0) {
    streakWeeks++
    m = addDays(m, -7)
  }

  return { trainingDays: inWindow.length, activeWeeks, weeksCounted, perWeek, thisWeek: countWeek(monday), streakWeeks }
}
