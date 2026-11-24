// Cardio: calories from the watch when known, otherwise MET × body weight in kg × hours.
// MET values follow the Compendium of Physical Activities (Ainsworth et al. 2011);
// runs, rides and walks with a distance use the speed, the rest the effort rating.

import type { CardioType } from '../db'

export type Intensity = 'light' | 'moderate' | 'vigorous'

export const CARDIO_TYPES: readonly { value: CardioType; label: string; met: [number, number, number] }[] = [
  { value: 'run', label: 'Run', met: [7.0, 9.8, 11.8] },
  { value: 'cycle', label: 'Cycle', met: [4.0, 6.8, 10.0] },
  { value: 'row', label: 'Row', met: [4.8, 7.0, 8.5] },
  { value: 'swim', label: 'Swim', met: [5.8, 7.0, 9.8] },
  { value: 'walk', label: 'Walk or hike', met: [3.0, 4.3, 6.0] },
  { value: 'elliptical', label: 'Elliptical', met: [4.0, 5.0, 6.5] },
  { value: 'stairs', label: 'Stairs', met: [6.8, 9.0, 11.0] },
  { value: 'sport', label: 'Team sport', met: [5.0, 7.0, 10.0] },
  { value: 'other', label: 'Other', met: [3.5, 5.0, 8.0] },
]

export const CARDIO_LABEL = Object.fromEntries(CARDIO_TYPES.map((t) => [t.value, t.label])) as Record<CardioType, string>

/** Effort 1–10: up to 4 light, 5–6 moderate, 7 and above vigorous; unknown counts as moderate. */
export function intensityOf(rpe: number | null | undefined): Intensity {
  if (rpe == null) return 'moderate'
  if (rpe <= 4) return 'light'
  if (rpe <= 6) return 'moderate'
  return 'vigorous'
}

// [km/h, MET] points from the Compendium's running, cycling and walking codes.
const SPEED_MET: Partial<Record<CardioType, [number, number][]>> = {
  run: [
    [6.4, 6.0],
    [8.0, 8.3],
    [9.7, 9.8],
    [11.3, 11.0],
    [12.9, 11.8],
    [14.5, 12.8],
    [16.1, 14.5],
    [17.7, 16.0],
    [19.3, 19.0],
  ],
  cycle: [
    [12, 3.5],
    [16, 4.0],
    [17.5, 6.8],
    [20.5, 8.0],
    [24, 10.0],
    [28, 12.0],
    [32, 15.8],
  ],
  walk: [
    [3.2, 2.8],
    [4.0, 3.0],
    [4.8, 3.5],
    [5.6, 4.3],
    [6.4, 5.0],
    [7.2, 7.0],
  ],
}

function interpolate(points: [number, number][], x: number): number {
  if (x <= points[0][0]) return points[0][1]
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i]
    const [x0, y0] = points[i - 1]
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)
  }
  return points[points.length - 1][1]
}

export function speedKmh(durationMin: number, distanceKm: number | null | undefined): number | null {
  if (!distanceKm || distanceKm <= 0 || durationMin <= 0) return null
  return distanceKm / (durationMin / 60)
}

export function metFor(type: CardioType, durationMin: number, distanceKm?: number | null, rpe?: number | null): number {
  const v = speedKmh(durationMin, distanceKm)
  const table = SPEED_MET[type]
  if (v != null && table && v > 1 && v < 60) return interpolate(table, v)
  const t = CARDIO_TYPES.find((x) => x.value === type) ?? CARDIO_TYPES[CARDIO_TYPES.length - 1]
  const i = intensityOf(rpe)
  return t.met[i === 'light' ? 0 : i === 'moderate' ? 1 : 2]
}

/** kcal = MET × kg × hours, rounded to 5. */
export function estimateCardioKcal(type: CardioType, durationMin: number, weightKg: number, distanceKm?: number | null, rpe?: number | null): number {
  const kcal = metFor(type, durationMin, distanceKm, rpe) * weightKg * (durationMin / 60)
  return Math.round(kcal / 5) * 5
}

/** Pace or speed in the form each sport uses. */
export function paceText(type: CardioType, durationMin: number, distanceKm: number | null | undefined): string | null {
  const v = speedKmh(durationMin, distanceKm)
  if (v == null || !distanceKm) return null
  const mmss = (min: number) => {
    const total = Math.round(min * 60)
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
  }
  if (type === 'run' || type === 'walk') return `${mmss(durationMin / distanceKm)} /km`
  if (type === 'row') return `${mmss(durationMin / (distanceKm * 2))} /500 m`
  if (type === 'swim') return `${mmss(durationMin / (distanceKm * 10))} /100 m`
  return `${v.toFixed(1)} km/h`
}

export interface WeekMinutes {
  light: number
  moderate: number
  vigorous: number
  total: number
  /** WHO counts a vigorous minute as two moderate ones. */
  moderateEquivalent: number
}

export const WHO_WEEKLY_MIN = 150

export function weekMinutes(sessions: readonly { durationMin: number; rpe?: number | null }[]): WeekMinutes {
  const out: WeekMinutes = { light: 0, moderate: 0, vigorous: 0, total: 0, moderateEquivalent: 0 }
  for (const s of sessions) {
    const i = intensityOf(s.rpe)
    out[i] += s.durationMin
    out.total += s.durationMin
  }
  out.moderateEquivalent = out.moderate + 2 * out.vigorous
  return out
}
