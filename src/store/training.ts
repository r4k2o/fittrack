import Dexie from 'dexie'
import { db, newRow, type Exercise, type Plan, type PlanDay, type PlanExercise, type Session, type SetKind, type SetLog } from '../db'
import { localDay } from '../lib/dates'
import { bestE1rm, defaultRepRange, defaultRestSec } from '../lib/training'

export interface LastTime {
  sessionId: string
  date: string
  sets: SetLog[]
}

/**
 * The work sets of the most recent earlier session with this exercise, ordered by
 * set. `excludeSessionId` keeps the workout in progress out of its own "last time".
 */
export async function lastTime(exerciseId: string, excludeSessionId?: string): Promise<LastTime | null> {
  const latest = await db.setLogs
    .where('[exerciseId+date]')
    .between([exerciseId, Dexie.minKey], [exerciseId, Dexie.maxKey])
    .reverse()
    .filter((s) => s.kind === 'work' && s.sessionId !== excludeSessionId)
    .first()
  if (!latest) return null
  const sets = await db.setLogs
    .where('sessionId')
    .equals(latest.sessionId)
    .filter((s) => s.exerciseId === exerciseId && s.kind === 'work')
    .toArray()
  sets.sort((a, b) => a.setIndex - b.setIndex)
  return { sessionId: latest.sessionId, date: latest.date, sets }
}

/** Best estimated 1RM per exercise over all sessions other than `excludeSessionId`. */
export async function previousBests(exerciseIds: readonly string[], excludeSessionId: string): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>()
  for (const id of exerciseIds) {
    const sets = await db.setLogs
      .where('[exerciseId+date]')
      .between([id, Dexie.minKey], [id, Dexie.maxKey])
      .filter((s) => s.sessionId !== excludeSessionId)
      .toArray()
    out.set(id, bestE1rm(sets))
  }
  return out
}

export async function activeSession(): Promise<Session | undefined> {
  const open = await db.sessions.filter((s) => !s.endedAt).toArray()
  return open.sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]
}

export async function startSession(
  name: string,
  exerciseIds: string[] = [],
  planDayId: string | null = null,
  extra: Pick<Session, 'swaps' | 'home'> = {},
): Promise<Session> {
  const now = new Date()
  const session = newRow<Session>({
    date: localDay(now),
    startedAt: now.toISOString(),
    endedAt: null,
    planDayId,
    name,
    exerciseIds,
    ...(extra.swaps && Object.keys(extra.swaps).length ? { swaps: extra.swaps } : {}),
    ...(extra.home ? { home: true } : {}),
  })
  await db.sessions.add(session)
  return session
}

export async function setSessionExercises(sessionId: string, exerciseIds: string[]): Promise<void> {
  await db.sessions.update(sessionId, { exerciseIds, updatedAt: new Date().toISOString() })
}

/** Swaps one exercise in a running workout; the new one keeps the planned prescription. */
export async function swapSessionExercise(session: Session, index: number, newId: string): Promise<void> {
  const oldId = session.exerciseIds[index]
  const exerciseIds = [...session.exerciseIds]
  exerciseIds[index] = newId
  const swaps = { ...(session.swaps ?? {}) }
  const planned = swaps[oldId] ?? oldId
  delete swaps[oldId]
  if (planned !== newId) swaps[newId] = planned
  await db.sessions.update(session.id, { exerciseIds, swaps, updatedAt: new Date().toISOString() })
}

export async function renameSession(sessionId: string, name: string): Promise<void> {
  await db.sessions.update(sessionId, { name, updatedAt: new Date().toISOString() })
}

export async function finishSession(sessionId: string): Promise<void> {
  await db.sessions.update(sessionId, { endedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
}

/** Removes a workout and its sets (used when a workout is discarded). */
export async function deleteSession(sessionId: string): Promise<void> {
  await db.transaction('rw', db.sessions, db.setLogs, async () => {
    await db.setLogs.where('sessionId').equals(sessionId).delete()
    await db.sessions.delete(sessionId)
  })
}

export interface SetInput {
  weightKg: number
  reps: number
  kind?: SetKind
  rir?: number | null
}

export async function logSet(session: Session, exerciseId: string, setIndex: number, input: SetInput): Promise<SetLog> {
  const row = newRow<SetLog>({
    sessionId: session.id,
    exerciseId,
    date: session.date,
    kind: input.kind ?? 'work',
    weightKg: input.weightKg,
    reps: input.reps,
    rir: input.rir ?? null,
    setIndex,
  })
  await db.setLogs.add(row)
  return row
}

export async function updateSet(set: SetLog, input: SetInput): Promise<void> {
  await db.setLogs.put({ ...set, weightKg: input.weightKg, reps: input.reps, kind: input.kind ?? set.kind, rir: input.rir ?? set.rir ?? null, updatedAt: new Date().toISOString() })
}

export async function deleteSet(id: string): Promise<void> {
  await db.setLogs.delete(id)
}

export async function sessionSets(sessionId: string): Promise<SetLog[]> {
  const rows = await db.setLogs.where('sessionId').equals(sessionId).toArray()
  return rows.sort((a, b) => a.setIndex - b.setIndex)
}

// Routines: workouts saved by hand live in one plan of kind 'routines'.

async function routinesPlan(): Promise<Plan> {
  const existing = await db.plans.filter((p) => p.kind === 'routines').first()
  if (existing) return existing
  const plan = newRow<Plan>({ name: 'My routines', split: 'custom', daysPerWeek: 0, generatorVersion: null, active: 0, kind: 'routines' })
  await db.plans.add(plan)
  return plan
}

export interface Routine {
  day: PlanDay
  exercises: PlanExercise[]
}

export async function listRoutines(): Promise<Routine[]> {
  const plan = await db.plans.filter((p) => p.kind === 'routines').first()
  if (!plan) return []
  const days = await db.planDays.where('planId').equals(plan.id).sortBy('order')
  const out: Routine[] = []
  for (const day of days) {
    const exercises = await db.planExercises.where('planDayId').equals(day.id).sortBy('order')
    out.push({ day, exercises })
  }
  return out
}

/** Saves a finished workout as a routine: same exercises, same number of work sets. */
export async function saveRoutineFromSession(sessionId: string, name: string, restCompoundSec = 150, restIsolationSec = 90): Promise<PlanDay> {
  return db.transaction('rw', [db.plans, db.planDays, db.planExercises, db.sessions, db.setLogs, db.exercises], async () => {
    const session = await db.sessions.get(sessionId)
    if (!session) throw new Error('Training nicht gefunden')
    const plan = await routinesPlan()
    const count = await db.planDays.where('planId').equals(plan.id).count()
    const day = newRow<PlanDay>({ planId: plan.id, name, order: count, weekday: null })
    await db.planDays.add(day)
    const sets = await db.setLogs.where('sessionId').equals(sessionId).toArray()
    const rows: PlanExercise[] = []
    for (const [order, exerciseId] of session.exerciseIds.entries()) {
      const ex = await db.exercises.get(exerciseId)
      if (!ex) continue
      const work = sets.filter((s) => s.exerciseId === exerciseId && s.kind === 'work').length
      const [repMin, repMax] = defaultRepRange(ex)
      rows.push(
        newRow<PlanExercise>({
          planDayId: day.id,
          exerciseId,
          order,
          sets: Math.max(1, work || 3),
          repMin,
          repMax,
          targetRir: 2,
          restSec: defaultRestSec(ex, restCompoundSec, restIsolationSec),
          supersetWith: null,
        }),
      )
    }
    await db.planExercises.bulkAdd(rows)
    await db.sessions.update(sessionId, { planDayId: day.id })
    return day
  })
}

export async function deleteRoutine(dayId: string): Promise<void> {
  await db.transaction('rw', db.planDays, db.planExercises, async () => {
    await db.planExercises.where('planDayId').equals(dayId).delete()
    await db.planDays.delete(dayId)
  })
}

export async function recentSessions(limit = 20): Promise<Session[]> {
  const rows = await db.sessions.orderBy('date').reverse().limit(limit * 2).toArray()
  return rows
    .filter((s) => s.endedAt)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, limit)
}

export async function createCustomExercise(fields: Omit<Exercise, 'id' | 'createdAt' | 'updatedAt' | 'custom'>): Promise<Exercise> {
  const ex = newRow<Exercise>({ ...fields, custom: 1 })
  await db.exercises.add(ex)
  return ex
}
