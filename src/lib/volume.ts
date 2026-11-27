// Weekly volume in hard sets per muscle group, and the spacing rule between sessions.
//
// A set counts 1 for each group its exercise mainly trains and 0.5 for each group that
// assists: a bench press set is 1 for chest and 0.5 each for triceps and shoulders.
// Counting assisting sets as half fitted the data best in Pelland et al., Sports
// Medicine 2026. Calves and abs get no half credit: squats and presses list them as
// helpers, but nobody trains them there.

import type { Exercise, Muscle } from '../db'

export type Group = 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'quads' | 'hamstrings' | 'glutes' | 'calves' | 'abs'

/** Bigger groups first; also the order of the volume bars. */
export const GROUPS: readonly Group[] = ['chest', 'back', 'shoulders', 'quads', 'hamstrings', 'glutes', 'biceps', 'triceps', 'calves', 'abs']

export const GROUP_LABEL: Record<Group, string> = {
  chest: 'Brust',
  back: 'Rücken',
  shoulders: 'Schultern',
  biceps: 'Bizeps',
  triceps: 'Trizeps',
  quads: 'Quadrizeps',
  hamstrings: 'Beinbeuger',
  glutes: 'Gesäß',
  calves: 'Waden',
  abs: 'Bauch',
}

/** The weekly band: 10 hard sets is where the benefit is clear (ACSM 2026), 20 the ceiling. */
export const VOLUME_FLOOR = 10
export const VOLUME_CEILING = 20

const MUSCLE_GROUP: Partial<Record<Muscle, Group>> = {
  chest: 'chest',
  lats: 'back',
  midBack: 'back',
  shoulders: 'shoulders',
  biceps: 'biceps',
  triceps: 'triceps',
  quads: 'quads',
  hamstrings: 'hamstrings',
  glutes: 'glutes',
  calves: 'calves',
  abs: 'abs',
}

const NO_HALF_CREDIT: ReadonlySet<Group> = new Set(['calves', 'abs'])

export type Credits = Partial<Record<Group, number>>
export type Volume = Record<Group, number>

/** Credit per set for each group the exercise trains: 1 for primary, 0.5 for assisting. */
export function groupCredits(ex: Pick<Exercise, 'primary' | 'secondary'>): Credits {
  const out: Credits = {}
  for (const m of ex.primary) {
    const g = MUSCLE_GROUP[m]
    if (g) out[g] = 1
  }
  for (const m of ex.secondary) {
    const g = MUSCLE_GROUP[m]
    if (g && !NO_HALF_CREDIT.has(g) && out[g] == null) out[g] = 0.5
  }
  return out
}

/** Groups the exercise trains directly; these decide spacing. */
export function primaryGroups(ex: Pick<Exercise, 'primary'>): Group[] {
  const out: Group[] = []
  for (const m of ex.primary) {
    const g = MUSCLE_GROUP[m]
    if (g && !out.includes(g)) out.push(g)
  }
  return out
}

export function emptyVolume(): Volume {
  return { chest: 0, back: 0, shoulders: 0, biceps: 0, triceps: 0, quads: 0, hamstrings: 0, glutes: 0, calves: 0, abs: 0 }
}

export function addCredits(v: Volume, credits: Credits, sets: number): Volume {
  for (const g of GROUPS) {
    const c = credits[g]
    if (c) v[g] += c * sets
  }
  return v
}

/** Weekly sets per group for a list of (exercise, sets) pairs. */
export function volumeOf(items: Iterable<{ exercise: Pick<Exercise, 'primary' | 'secondary'> | undefined; sets: number }>): Volume {
  const v = emptyVolume()
  for (const it of items) if (it.exercise) addCredits(v, groupCredits(it.exercise), it.sets)
  return v
}

export type VolumeStatus = 'low' | 'ok' | 'high'

export function volumeStatus(sets: number): VolumeStatus {
  if (sets < VOLUME_FLOOR) return 'low'
  if (sets > VOLUME_CEILING) return 'high'
  return 'ok'
}

/** Groups that make sensible superset partners: antagonists, or muscles that do not compete. */
export const OPPOSING: Record<Group, readonly Group[]> = {
  chest: ['back'],
  back: ['chest', 'shoulders'],
  shoulders: ['back', 'abs'],
  biceps: ['triceps'],
  triceps: ['biceps'],
  quads: ['hamstrings'],
  hamstrings: ['quads'],
  glutes: ['abs'],
  calves: ['abs'],
  abs: ['calves', 'glutes', 'shoulders'],
}

/** Days between two weekdays (0 = Monday) going round the week: 0 to 3. */
export function weekdayGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 7
  return Math.min(d, 7 - d)
}

export const WEEKDAY_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
export const WEEKDAY_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

export interface SpacingIssue {
  group: Group
  /** Indices of the two plan days. */
  days: [number, number]
}

/**
 * Sessions that train the same group directly less than 48 hours apart, i.e. on
 * neighbouring weekdays or the same one. Days without a weekday are left out.
 */
export function spacingIssues(days: readonly { weekday?: number | null; groups: ReadonlySet<Group> }[]): SpacingIssue[] {
  const out: SpacingIssue[] = []
  for (let i = 0; i < days.length; i++) {
    for (let j = i + 1; j < days.length; j++) {
      const a = days[i]
      const b = days[j]
      if (a.weekday == null || b.weekday == null || weekdayGap(a.weekday, b.weekday) >= 2) continue
      for (const g of GROUPS) if (a.groups.has(g) && b.groups.has(g)) out.push({ group: g, days: [i, j] })
    }
  }
  return out
}

// ---- Time ---------------------------------------------------------------------------
//
// The plan's time model: 3 minutes per compound set and 2 per isolation set, rests
// included, plus 5 minutes of warm-up. A superset round costs the longer of its two
// sets plus one minute, because the rest between them overlaps the other exercise.

export const WARM_UP_MIN = 5
export const COMPOUND_SET_MIN = 3
export const ISOLATION_SET_MIN = 2

export function countsAsCompound(ex: Pick<Exercise, 'compound' | 'pattern'>): boolean {
  return ex.compound && ex.pattern !== 'isolation'
}

export interface TimedItem {
  id: string
  compound: boolean
  sets: number
  pairWith?: string | null
}

export function sessionMinutes(items: readonly TimedItem[]): number {
  if (items.length === 0) return 0
  const byId = new Map(items.map((i) => [i.id, i]))
  const done = new Set<string>()
  let total = WARM_UP_MIN
  for (const it of items) {
    if (done.has(it.id)) continue
    done.add(it.id)
    const per = it.compound ? COMPOUND_SET_MIN : ISOLATION_SET_MIN
    const partner = it.pairWith ? byId.get(it.pairWith) : undefined
    if (partner && !done.has(partner.id) && partner.pairWith === it.id) {
      done.add(partner.id)
      const perB = partner.compound ? COMPOUND_SET_MIN : ISOLATION_SET_MIN
      const rounds = Math.min(it.sets, partner.sets)
      total += rounds * (Math.max(per, perB) + 1) + (it.sets - rounds) * per + (partner.sets - rounds) * perB
    } else {
      total += it.sets * per
    }
  }
  return total
}
