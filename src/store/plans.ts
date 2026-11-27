// Training plans are ordinary data: a plan row, its days and one prescription row per
// exercise. The generator's output is saved as such rows, and the editor changes them
// directly, so an edited plan behaves exactly like a generated one.

import Dexie from 'dexie'
import { db, newId, newRow, type Exercise, type Plan, type PlanDay, type PlanExercise, type Session, type SetLog } from '../db'
import { addDays, localDay, weekStart } from '../lib/dates'
import { homeVersion } from '../lib/home'
import { prescriptionFor, type GeneratedPlan, type PlanAnswers } from '../lib/planner'
import { performanceScore } from '../lib/training'
import { getSetting, setSetting } from './settings'
import { startSession } from './training'

export interface PlanDayFull extends PlanDay {
  exercises: PlanExercise[]
}

export interface PlanBundle {
  plan: Plan
  days: PlanDayFull[]
}

const now = () => new Date().toISOString()

export async function loadPlan(planId: string): Promise<PlanBundle | null> {
  const plan = await db.plans.get(planId)
  if (!plan) return null
  const days = await db.planDays.where('planId').equals(planId).sortBy('order')
  const out: PlanDayFull[] = []
  for (const d of days) out.push({ ...d, exercises: await db.planExercises.where('planDayId').equals(d.id).sortBy('order') })
  return { plan, days: out }
}

/** The plan in use: the active generated plan, or null. */
export async function activePlan(): Promise<PlanBundle | null> {
  const plan = await db.plans
    .where('active')
    .equals(1)
    .filter((p) => p.kind === 'generated')
    .first()
  return plan ? loadPlan(plan.id) : null
}

export function planAnswers(plan: Plan): PlanAnswers | null {
  const a = plan.answers as PlanAnswers | undefined
  return a && typeof a === 'object' && typeof a.daysPerWeek === 'number' ? a : null
}

/** Saves a generated plan and makes it the active one; returns the new plan's id. */
export async function saveGeneratedPlan(gen: GeneratedPlan): Promise<string> {
  return db.transaction('rw', db.plans, db.planDays, db.planExercises, async () => {
    const t = now()
    const current = await db.plans
      .where('active')
      .equals(1)
      .filter((p) => p.kind === 'generated')
      .toArray()
    for (const p of current) await db.plans.update(p.id, { active: 0, updatedAt: t })
    const plan = newRow<Plan>({
      name: gen.name,
      split: gen.split,
      daysPerWeek: gen.daysPerWeek,
      answers: gen.answers,
      generatorVersion: gen.generatorVersion,
      active: 1,
      kind: 'generated',
    })
    await db.plans.add(plan)
    for (const [order, d] of gen.days.entries()) {
      const day = newRow<PlanDay>({ planId: plan.id, name: d.name, order, weekday: d.weekday })
      await db.planDays.add(day)
      const ids = new Map(d.exercises.map((x) => [x.key, newId()]))
      await db.planExercises.bulkAdd(
        d.exercises.map((x, i) =>
          newRow<PlanExercise>({
            id: ids.get(x.key),
            planDayId: day.id,
            exerciseId: x.exerciseId,
            order: i,
            sets: x.sets,
            repMin: x.repMin,
            repMax: x.repMax,
            targetRir: x.targetRir,
            restSec: x.restSec,
            supersetWith: x.pairWith ? (ids.get(x.pairWith) ?? null) : null,
          }),
        ),
      )
    }
    return plan.id
  })
}

export interface PlanSnapshot {
  plan: Plan
  days: PlanDay[]
  exercises: PlanExercise[]
}

async function snapshot(planId: string): Promise<PlanSnapshot | null> {
  const plan = await db.plans.get(planId)
  if (!plan) return null
  const days = await db.planDays.where('planId').equals(planId).toArray()
  const exercises = await db.planExercises.where('planDayId').anyOf(days.map((d) => d.id)).toArray()
  return { plan, days, exercises }
}

/** Deletes a plan with its days; returns what is needed to undo it. */
export async function deletePlan(planId: string): Promise<PlanSnapshot | null> {
  return db.transaction('rw', db.plans, db.planDays, db.planExercises, async () => {
    const snap = await snapshot(planId)
    if (!snap) return null
    await db.planExercises.bulkDelete(snap.exercises.map((e) => e.id))
    await db.planDays.bulkDelete(snap.days.map((d) => d.id))
    await db.plans.delete(planId)
    return snap
  })
}

export async function restorePlan(snap: PlanSnapshot): Promise<void> {
  await db.transaction('rw', db.plans, db.planDays, db.planExercises, async () => {
    await db.plans.put(snap.plan)
    await db.planDays.bulkPut(snap.days)
    await db.planExercises.bulkPut(snap.exercises)
  })
}

export async function renamePlan(planId: string, name: string): Promise<void> {
  await db.plans.update(planId, { name, updatedAt: now() })
}

// ---- days -------------------------------------------------------------------------------

export async function updatePlanDay(dayId: string, patch: Partial<Pick<PlanDay, 'name' | 'weekday'>>): Promise<void> {
  await db.planDays.update(dayId, { ...patch, updatedAt: now() })
}

/** Rewrites `order` as 0, 1, 2… in the given sequence, touching only rows that moved. */
function renumbered<T extends { order: number; updatedAt: string }>(rows: T[]): T[] {
  const t = now()
  return rows.flatMap((r, i) => (r.order === i ? [] : [{ ...r, order: i, updatedAt: t }]))
}

async function renumberDays(rows: PlanDay[]): Promise<void> {
  const moved = renumbered(rows)
  if (moved.length) await db.planDays.bulkPut(moved)
}

async function renumberExercises(rows: PlanExercise[]): Promise<void> {
  const moved = renumbered(rows)
  if (moved.length) await db.planExercises.bulkPut(moved)
}

export async function movePlanDay(planId: string, dayId: string, dir: -1 | 1): Promise<void> {
  await db.transaction('rw', db.planDays, async () => {
    const days = await db.planDays.where('planId').equals(planId).sortBy('order')
    const i = days.findIndex((d) => d.id === dayId)
    const j = i + dir
    if (i < 0 || j < 0 || j >= days.length) return
    ;[days[i], days[j]] = [days[j], days[i]]
    await renumberDays(days)
  })
}

export async function addPlanDay(planId: string, name: string, weekday: number | null): Promise<PlanDay> {
  return db.transaction('rw', db.planDays, db.plans, async () => {
    const count = await db.planDays.where('planId').equals(planId).count()
    const day = newRow<PlanDay>({ planId, name, order: count, weekday })
    await db.planDays.add(day)
    await db.plans.update(planId, { daysPerWeek: count + 1, updatedAt: now() })
    return day
  })
}

export async function removePlanDay(dayId: string): Promise<{ day: PlanDay; exercises: PlanExercise[] } | null> {
  return db.transaction('rw', db.planDays, db.planExercises, db.plans, async () => {
    const day = await db.planDays.get(dayId)
    if (!day) return null
    const exercises = await db.planExercises.where('planDayId').equals(dayId).toArray()
    await db.planExercises.bulkDelete(exercises.map((e) => e.id))
    await db.planDays.delete(dayId)
    const rest = await db.planDays.where('planId').equals(day.planId).sortBy('order')
    await renumberDays(rest)
    await db.plans.update(day.planId, { daysPerWeek: rest.length, updatedAt: now() })
    return { day, exercises }
  })
}

export async function restorePlanDay(saved: { day: PlanDay; exercises: PlanExercise[] }): Promise<void> {
  await db.transaction('rw', db.planDays, db.planExercises, db.plans, async () => {
    await db.planDays.put(saved.day)
    await db.planExercises.bulkPut(saved.exercises)
    const days = (await db.planDays.where('planId').equals(saved.day.planId).sortBy('order')).filter((d) => d.id !== saved.day.id)
    days.splice(Math.min(saved.day.order, days.length), 0, saved.day)
    await renumberDays(days)
    await db.plans.update(saved.day.planId, { daysPerWeek: days.length, updatedAt: now() })
  })
}

// ---- exercises within a day ------------------------------------------------------------------

export type PrescriptionPatch = Partial<Pick<PlanExercise, 'sets' | 'repMin' | 'repMax' | 'targetRir' | 'restSec' | 'exerciseId'>>

export async function updatePlanExercise(id: string, patch: PrescriptionPatch): Promise<void> {
  await db.planExercises.update(id, { ...patch, updatedAt: now() })
}

/** Adds an exercise at the end of a day with the generator's prescription for its kind. */
export async function addPlanExercise(dayId: string, ex: Exercise): Promise<PlanExercise> {
  return db.transaction('rw', db.planExercises, async () => {
    const count = await db.planExercises.where('planDayId').equals(dayId).count()
    const row = newRow<PlanExercise>({
      planDayId: dayId,
      exerciseId: ex.id,
      order: count,
      sets: 3,
      ...prescriptionFor(ex, ex.compound && ex.pattern !== 'isolation' ? 'compound' : 'accessory', false),
      supersetWith: null,
    })
    await db.planExercises.add(row)
    return row
  })
}

export async function removePlanExercise(id: string): Promise<PlanExercise[]> {
  return db.transaction('rw', db.planExercises, async () => {
    const row = await db.planExercises.get(id)
    if (!row) return []
    const changed: PlanExercise[] = [row]
    if (row.supersetWith) {
      const partner = await db.planExercises.get(row.supersetWith)
      if (partner) {
        changed.push(partner)
        await db.planExercises.update(partner.id, { supersetWith: null, updatedAt: now() })
      }
    }
    await db.planExercises.delete(id)
    const rest = await db.planExercises.where('planDayId').equals(row.planDayId).sortBy('order')
    await renumberExercises(rest)
    return changed
  })
}

/** Undo for removePlanExercise: the row returns to its place and its partner's link comes back. */
export async function restorePlanExercises(rows: PlanExercise[]): Promise<void> {
  if (!rows.length) return
  const [main, ...linked] = rows
  await db.transaction('rw', db.planExercises, async () => {
    for (const o of linked) await db.planExercises.update(o.id, { supersetWith: o.supersetWith ?? null, updatedAt: now() })
    await db.planExercises.put(main)
    const list = (await db.planExercises.where('planDayId').equals(main.planDayId).sortBy('order')).filter((r) => r.id !== main.id)
    list.splice(Math.min(main.order, list.length), 0, main)
    await renumberExercises(list)
  })
}

export async function movePlanExercise(id: string, dir: -1 | 1): Promise<void> {
  await db.transaction('rw', db.planExercises, async () => {
    const row = await db.planExercises.get(id)
    if (!row) return
    const list = await db.planExercises.where('planDayId').equals(row.planDayId).sortBy('order')
    const i = list.findIndex((r) => r.id === id)
    const j = i + dir
    if (j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
    await renumberExercises(list)
  })
}

/** Pairs an exercise with the next one in its day as a superset, or splits an existing pair. */
export async function toggleSuperset(id: string): Promise<'paired' | 'split' | 'none'> {
  return db.transaction('rw', db.planExercises, async () => {
    const row = await db.planExercises.get(id)
    if (!row) return 'none'
    const t = now()
    if (row.supersetWith) {
      await db.planExercises.update(row.supersetWith, { supersetWith: null, updatedAt: t })
      await db.planExercises.update(id, { supersetWith: null, updatedAt: t })
      return 'split'
    }
    const list = await db.planExercises.where('planDayId').equals(row.planDayId).sortBy('order')
    const i = list.findIndex((r) => r.id === id)
    const next = list[i + 1]
    if (!next || next.supersetWith) return 'none'
    await db.planExercises.update(id, { supersetWith: next.id, updatedAt: t })
    await db.planExercises.update(next.id, { supersetWith: id, updatedAt: t })
    return 'paired'
  })
}

// ---- the week -------------------------------------------------------------------------------

export type DayStatus = 'done' | 'today' | 'next' | 'upcoming' | 'missed'

export interface WeekDay {
  day: PlanDayFull
  status: DayStatus
  /** The date this day falls on in the current week, when it has a weekday. */
  date: string | null
  session: Session | null
}

/**
 * This week's plan days with their status. A day is done when a finished workout this
 * week was started from it. "next" marks the one to do now: today's, or else the
 * earliest one not yet done.
 */
export function planWeek(bundle: PlanBundle, sessionsThisWeek: readonly Session[], today: string): WeekDay[] {
  const monday = weekStart(today)
  const doneBy = new Map<string, Session>()
  for (const s of sessionsThisWeek) if (s.planDayId && s.endedAt && !doneBy.has(s.planDayId)) doneBy.set(s.planDayId, s)
  const out: WeekDay[] = bundle.days.map((day) => {
    const date = day.weekday != null ? addDays(monday, day.weekday) : null
    const session = doneBy.get(day.id) ?? null
    let status: DayStatus = 'upcoming'
    if (session) status = 'done'
    else if (date === today) status = 'today'
    else if (date && date < today) status = 'missed'
    return { day, status, date, session }
  })
  if (!out.some((d) => d.status === 'today')) {
    const next = out.find((d) => d.status === 'upcoming') ?? out.find((d) => d.status === 'missed')
    if (next) next.status = 'next'
  }
  return out
}

/**
 * Starts a plan day. At home every exercise is swapped for a bodyweight or band one;
 * the session remembers which planned exercise each stands for, to keep its prescription.
 */
export async function startPlanDay(day: PlanDayFull, opts: { home?: boolean } = {}): Promise<Session> {
  if (!opts.home) return startSession(day.name, day.exercises.map((e) => e.exerciseId), day.id)
  const plan = await db.plans.get(day.planId)
  const answers = plan ? planAnswers(plan) : null
  const library = await db.exercises.toArray()
  const { rows } = homeVersion(day.exercises, library, answers ?? undefined)
  const swaps = Object.fromEntries(rows.filter((r) => r.exerciseId !== r.from).map((r) => [r.exerciseId, r.from]))
  return startSession(`${day.name} · Zuhause`, rows.map((r) => r.exerciseId), day.id, { swaps, home: true })
}

/** Home mode on: starting any plan day gives its home version. */
export async function homeModeOn(): Promise<boolean> {
  return getSetting('homeMode')
}

// ---- lighter week --------------------------------------------------------------------------

/** The lighter week in force today, if any: half the sets, same loads. */
export async function deloadActive(today = localDay()): Promise<boolean> {
  const until = await getSetting('deloadUntil')
  const from = await getSetting('deloadFrom')
  return !!until && !!from && from <= today && today <= until
}

export async function startDeload(today = localDay()): Promise<void> {
  await setSetting('deloadFrom', today)
  await setSetting('deloadUntil', addDays(weekStart(today), 6))
}

export async function endDeload(): Promise<void> {
  await setSetting('deloadUntil', addDays(localDay(), -1))
}

export async function snoozeDeloadOffer(today = localDay()): Promise<void> {
  await setSetting('deloadSnoozedUntil', addDays(today, 7))
}

/**
 * After 6 to 8 weeks of training on a plan, a lighter week is offered (never forced).
 * Counts the weeks with at least one finished workout from the plan since the plan
 * started or the last lighter week ended.
 */
export async function deloadOffer(bundle: PlanBundle, today = localDay()): Promise<{ weeks: number } | null> {
  if (await deloadActive(today)) return null
  const snoozed = await getSetting('deloadSnoozedUntil')
  if (snoozed && today < snoozed) return null
  const lastEnd = await getSetting('deloadUntil')
  const since = [localDay(new Date(bundle.plan.createdAt)), lastEnd ? addDays(lastEnd, 1) : ''].sort().at(-1)!
  const dayIds = new Set(bundle.days.map((d) => d.id))
  const sessions = await db.sessions.where('date').between(since, today, true, true).toArray()
  const weeks = new Set(sessions.filter((s) => s.endedAt && s.planDayId && dayIds.has(s.planDayId)).map((s) => weekStart(s.date)))
  return weeks.size >= 6 ? { weeks: weeks.size } : null
}

// ---- stalls --------------------------------------------------------------------------------

export interface Stall {
  sessions: number
  /** The heaviest working weight of the last session, for the 10% suggestion. */
  topKg: number
}

/**
 * Three sessions in a row without beating the best earlier performance on a lift.
 * Performance is the best set by estimated 1RM (reps for bodyweight work).
 */
export async function detectStall(exerciseId: string, excludeSessionId?: string): Promise<Stall | null> {
  const sets = await db.setLogs
    .where('[exerciseId+date]')
    .between([exerciseId, Dexie.minKey], [exerciseId, Dexie.maxKey])
    .filter((s) => s.kind === 'work' && s.sessionId !== excludeSessionId)
    .toArray()
  const bySession = new Map<string, SetLog[]>()
  for (const s of sets) bySession.set(s.sessionId, [...(bySession.get(s.sessionId) ?? []), s])
  const sessions = [...bySession.values()].sort((a, b) => a[0].date.localeCompare(b[0].date) || a[0].createdAt.localeCompare(b[0].createdAt))
  if (sessions.length < 4) return null
  const scores = sessions.map((list) => Math.max(...list.map((s) => performanceScore(s.weightKg, s.reps))))
  const recent = scores.slice(-3)
  const best = Math.max(...scores.slice(0, -3))
  if (recent.some((s) => s > best + 1e-9)) return null
  const last = sessions.at(-1)!
  return { sessions: 3, topKg: Math.max(...last.map((s) => s.weightKg)) }
}

// ---- questionnaire --------------------------------------------------------------------------

/** The last plan's answers, or a start built from the profile and the nutrition goal. */
export async function defaultAnswers(): Promise<PlanAnswers> {
  const active = await activePlan()
  const prev = active ? planAnswers(active.plan) : null
  if (prev) return { ...prev, weekdays: undefined }
  const profile = await db.profile.get('me')
  const goal = await db.goals.where('active').equals(1).first()
  return {
    daysPerWeek: 3,
    minutes: 60,
    experience: profile?.experience ?? 'beginner',
    equipment: 'full',
    injuries: [],
    goal: goal?.type === 'cut' ? 'cut' : 'muscle',
    priority: [],
  }
}

/** The bundled library the generator chooses from (custom exercises carry no slot ranking). */
export function libraryExercises(): Promise<Exercise[]> {
  return db.exercises.where('custom').equals(0).toArray()
}

/** Saves the plan, makes it active and remembers the experience answer on the profile. */
export async function adoptPlan(gen: GeneratedPlan): Promise<string> {
  const id = await saveGeneratedPlan(gen)
  const profile = await db.profile.get('me')
  if (profile && profile.experience !== gen.answers.experience) await db.profile.update('me', { experience: gen.answers.experience, updatedAt: now() })
  return id
}

/** Makes an earlier plan the active one again (undo after adopting a new plan). */
export async function reactivatePlan(planId: string): Promise<void> {
  await db.transaction('rw', db.plans, async () => {
    const t = now()
    const active = await db.plans
      .where('active')
      .equals(1)
      .filter((p) => p.kind === 'generated')
      .toArray()
    for (const p of active) if (p.id !== planId) await db.plans.update(p.id, { active: 0, updatedAt: t })
    await db.plans.update(planId, { active: 1, updatedAt: t })
  })
}
