// Home workouts: a session (or the whole plan) done without a gym. Each exercise is
// swapped for the best bodyweight or band exercise of the same movement that trains the
// same main muscle, avoiding flagged joints. Sets and rest stay; the rep range rises,
// since there is no load to add.

import { exercisePool, RANKING, type PlanAnswers, type PlannerExercise } from './planner'
import { countsAsCompound, primaryGroups } from './volume'

const HOME_EQUIPMENT = new Set(['bodyweight', 'band'])

export function isHomeExercise(e: Pick<PlannerExercise, 'equipment'>): boolean {
  return HOME_EQUIPMENT.has(e.equipment)
}

export interface Prescribed {
  exerciseId: string
  sets: number
  repMin: number
  repMax: number
  targetRir: number
  restSec: number
}

/** Without added load, progress comes from reps: compounds 8–15, isolation 12–20. */
export function homeReps(p: Pick<Prescribed, 'repMin' | 'repMax'>, ex: PlannerExercise): { repMin: number; repMax: number } {
  if (ex.unit === 'seconds') return { repMin: p.repMin, repMax: p.repMax }
  if (countsAsCompound(ex)) return { repMin: Math.max(8, p.repMin), repMax: Math.max(15, p.repMax) }
  return { repMin: Math.max(12, p.repMin), repMax: Math.max(20, p.repMax) }
}

const rank = (id: string) => {
  const i = RANKING.indexOf(id)
  return i < 0 ? RANKING.length : i
}

/** The best home replacement for one exercise, or null when nothing at home trains that muscle. */
export function homeReplacement<T extends PlannerExercise>(
  ex: PlannerExercise,
  library: readonly T[],
  answers?: Pick<PlanAnswers, 'injuries' | 'experience'>,
  taken: ReadonlySet<string> = new Set(),
): T | null {
  const pool = exercisePool({ equipment: 'bodyweight', injuries: answers?.injuries ?? [], experience: answers?.experience ?? 'intermediate' }, library).filter(
    (e) => !taken.has(e.id),
  )
  const groups = primaryGroups(ex)
  const shares = (e: PlannerExercise) => primaryGroups(e).some((g) => groups.includes(g))
  const byRank = (a: T, b: T) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name)
  const same = pool.filter((e) => e.pattern === ex.pattern && shares(e)).sort(byRank)
  if (same.length) return same[0]
  // Another movement for the same muscle, preferring the same kind (compound or isolation).
  const other = pool.filter(shares).sort((a, b) => Number(countsAsCompound(b) === countsAsCompound(ex)) - Number(countsAsCompound(a) === countsAsCompound(ex)) || byRank(a, b))
  return other[0] ?? null
}

export interface HomeSession<P extends Prescribed> {
  rows: (P & { from: string })[]
  /** Exercises with no home replacement, left out. */
  dropped: string[]
}

/** The home version of a session: exercises swapped, duplicates avoided, reps raised. */
export function homeVersion<P extends Prescribed, T extends PlannerExercise>(rows: readonly P[], library: readonly T[], answers?: Pick<PlanAnswers, 'injuries' | 'experience'>): HomeSession<P> {
  const byId = new Map(library.map((e) => [e.id, e]))
  const taken = new Set<string>()
  const out: (P & { from: string })[] = []
  const dropped: string[] = []
  for (const r of rows) {
    const ex = byId.get(r.exerciseId)
    if (!ex) continue
    const next = isHomeExercise(ex) && !taken.has(ex.id) ? ex : homeReplacement(ex, library, answers, taken)
    if (!next) {
      dropped.push(ex.name)
      continue
    }
    taken.add(next.id)
    out.push({ ...r, exerciseId: next.id, from: r.exerciseId, ...(next.id === ex.id ? {} : homeReps(r, next)) })
  }
  return { rows: out, dropped }
}
