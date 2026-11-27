// Training rules as plain functions: rep ranges, rest, load steps, the progression
// target and the summary at the end of a workout.

import type { Equipment, Exercise, Muscle, SetLog } from '../db'
import { e1rm } from './trends'

/** Smallest load step by equipment, in kg. 0 means progress by reps. */
export const DEFAULT_LOAD_STEP: Record<Equipment, number> = {
  barbell: 2.5,
  ezbar: 2.5,
  trapbar: 2.5,
  smith: 2.5,
  dumbbell: 2,
  kettlebell: 4,
  cable: 2.5,
  machine: 5,
  bodyweight: 0,
  band: 0,
  other: 2.5,
}

export function loadStep(ex: Pick<Exercise, 'equipment' | 'loadStepKg'>): number {
  return ex.loadStepKg ?? DEFAULT_LOAD_STEP[ex.equipment]
}

const FREE_WEIGHT_MAIN: ReadonlySet<Equipment> = new Set(['barbell', 'trapbar', 'smith'])

/**
 * Rep range: main compounds 6–10, secondary compounds 8–12, isolation 10–15.
 * Without a plan, barbell compounds count as main lifts.
 */
export function defaultRepRange(ex: Pick<Exercise, 'compound' | 'equipment' | 'pattern' | 'unit'>): [number, number] {
  if (ex.unit === 'seconds') return [30, 60]
  if (!ex.compound || ex.pattern === 'isolation') return [10, 15]
  return FREE_WEIGHT_MAIN.has(ex.equipment) ? [6, 10] : [8, 12]
}

/** Rest: 2–3 minutes on compounds, 1–2 on isolation; the defaults sit in the middle. */
export function defaultRestSec(ex: Pick<Exercise, 'compound' | 'pattern'>, compoundSec = 150, isolationSec = 90): number {
  return ex.compound && ex.pattern !== 'isolation' ? compoundSec : isolationSec
}

export interface SetTarget {
  weightKg: number
  reps: number
}

export interface Progression {
  sets: SetTarget[]
  /** True when every work set reached the top of the range last time and the load goes up. */
  increased: boolean
}

/**
 * Today's prefill from last time's work sets. When every work set reached the top of
 * its rep range, the load rises by the smallest step and reps restart at the bottom of
 * the range; otherwise the numbers repeat and the aim is to beat them.
 */
export function nextTarget(last: readonly SetTarget[], range: [number, number], step: number): Progression | null {
  if (last.length === 0) return null
  const allTop = last.every((s) => s.reps >= range[1])
  if (allTop && step > 0) {
    const top = Math.max(...last.map((s) => s.weightKg))
    return { sets: last.map(() => ({ weightKg: roundToStep(top + step, step), reps: range[0] })), increased: true }
  }
  return { sets: last.map((s) => ({ weightKg: s.weightKg, reps: s.reps })), increased: false }
}

export function roundToStep(kg: number, step: number): number {
  if (step <= 0) return kg
  return Math.round(kg / step) * step
}

export interface SessionStats {
  workSets: number
  volumeKg: number
  exercises: number
}

/** Volume is the sum of weight × reps over work sets. */
export function sessionStats(sets: readonly SetLog[]): SessionStats {
  const work = sets.filter((s) => s.kind === 'work')
  return {
    workSets: work.length,
    volumeKg: work.reduce((sum, s) => sum + s.weightKg * s.reps, 0),
    exercises: new Set(work.map((s) => s.exerciseId)).size,
  }
}

/**
 * One number per set for spotting progress: the estimated 1RM by Epley at any rep
 * count, or the reps alone when there is no external load.
 */
export function performanceScore(weightKg: number, reps: number): number {
  return weightKg > 0 ? weightKg * (1 + reps / 30) : reps
}

export function bestE1rm(sets: readonly Pick<SetLog, 'kind' | 'weightKg' | 'reps'>[]): number | null {
  let best: number | null = null
  for (const s of sets) {
    if (s.kind !== 'work') continue
    const v = e1rm(s.weightKg, s.reps)
    if (v != null && (best == null || v > best)) best = v
  }
  return best
}

export interface RecordHit {
  exerciseId: string
  e1rm: number
  previous: number | null
}

/** Exercises whose best estimated 1RM today beats every earlier session. */
export function findRecords(today: readonly SetLog[], previousBest: ReadonlyMap<string, number | null>): RecordHit[] {
  const byExercise = new Map<string, SetLog[]>()
  for (const s of today) {
    const list = byExercise.get(s.exerciseId) ?? []
    list.push(s)
    byExercise.set(s.exerciseId, list)
  }
  const hits: RecordHit[] = []
  for (const [exerciseId, sets] of byExercise) {
    const best = bestE1rm(sets)
    if (best == null) continue
    const prev = previousBest.get(exerciseId) ?? null
    if (prev == null || best > prev + 1e-9) hits.push({ exerciseId, e1rm: best, previous: prev })
  }
  return hits
}

export const PATTERN_LABEL: Record<Exercise['pattern'], string> = {
  squat: 'Kniebeuge',
  hinge: 'Hüftbeuge',
  hpush: 'Drücken horizontal',
  hpull: 'Ziehen horizontal',
  vpush: 'Drücken vertikal',
  vpull: 'Ziehen vertikal',
  isolation: 'Isolation',
}

export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  barbell: 'Langhantel',
  ezbar: 'SZ-Stange',
  trapbar: 'Trap Bar',
  dumbbell: 'Kurzhantel',
  kettlebell: 'Kettlebell',
  cable: 'Kabelzug',
  machine: 'Maschine',
  smith: 'Multipresse',
  bodyweight: 'Körpergewicht',
  band: 'Band',
  other: 'Sonstiges',
}

export const MUSCLE_LABEL: Record<Exercise['primary'][number], string> = {
  chest: 'Brust',
  lats: 'Latissimus',
  midBack: 'Oberer Rücken',
  lowerBack: 'Unterer Rücken',
  traps: 'Trapez',
  shoulders: 'Schultern',
  biceps: 'Bizeps',
  triceps: 'Trizeps',
  forearms: 'Unterarme',
  quads: 'Quadrizeps',
  hamstrings: 'Beinbeuger',
  glutes: 'Gesäß',
  calves: 'Waden',
  adductors: 'Adduktoren',
  abductors: 'Abduktoren',
  abs: 'Bauch',
  neck: 'Nacken',
}

export const MUSCLE_GROUPS: { label: string; muscles: Muscle[] }[] = [
  { label: 'Brust', muscles: ['chest'] },
  { label: 'Rücken', muscles: ['lats', 'midBack', 'lowerBack', 'traps'] },
  { label: 'Schultern', muscles: ['shoulders'] },
  { label: 'Arme', muscles: ['biceps', 'triceps', 'forearms'] },
  { label: 'Beine', muscles: ['quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors'] },
  { label: 'Bauch', muscles: ['abs'] },
]

export function exerciseSubtitle(e: Exercise): string {
  return [EQUIPMENT_LABEL[e.equipment], e.primary.map((m) => MUSCLE_LABEL[m]).join(', ')].filter(Boolean).join(' · ')
}
