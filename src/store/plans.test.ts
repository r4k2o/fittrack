import { beforeEach, describe, expect, it } from 'vitest'
import library from '../data/exercises.json'
import { db, newRow, type Exercise, type Session, type SetLog } from '../db'
import { generatePlan, type PlannerExercise } from '../lib/planner'
import {
  activePlan,
  deletePlan,
  detectStall,
  loadPlan,
  planWeek,
  removePlanExercise,
  restorePlan,
  restorePlanExercises,
  saveGeneratedPlan,
  toggleSuperset,
} from './plans'

const EXERCISES = library.exercises.map((x) => ({ ...x, jointStress: x.joints })) as unknown as PlannerExercise[]

beforeEach(async () => {
  await db.delete()
  await db.open()
})

const answers = { daysPerWeek: 4, minutes: 60, experience: 'intermediate' as const, equipment: 'full' as const, injuries: [], goal: 'muscle' as const, priority: [] }

describe('plans store', () => {
  it('saves a generated plan as rows, keeps supersets paired and makes it the only active plan', async () => {
    const gen = generatePlan(answers, EXERCISES)
    const first = await saveGeneratedPlan(gen)
    const second = await saveGeneratedPlan(generatePlan({ ...answers, minutes: 30 }, EXERCISES))
    expect((await db.plans.get(first))?.active).toBe(0)
    const bundle = await activePlan()
    expect(bundle?.plan.id).toBe(second)
    expect(bundle?.days.map((d) => d.weekday)).toEqual([0, 1, 3, 4])
    const rows = bundle!.days.flatMap((d) => d.exercises)
    const paired = rows.filter((r) => r.supersetWith)
    expect(paired.length).toBeGreaterThan(0)
    for (const r of paired) expect(rows.find((o) => o.id === r.supersetWith)?.supersetWith).toBe(r.id)
    expect(bundle!.days[0].exercises.map((r) => r.order)).toEqual(bundle!.days[0].exercises.map((_, i) => i))
  })

  it('removes an exercise with its superset link and restores both on undo', async () => {
    const id = await saveGeneratedPlan(generatePlan({ ...answers, minutes: 30 }, EXERCISES))
    const before = (await loadPlan(id))!
    const row = before.days.flatMap((d) => d.exercises).find((r) => r.supersetWith)!
    const saved = await removePlanExercise(row.id)
    const mid = (await loadPlan(id))!
    expect(mid.days.flatMap((d) => d.exercises).some((r) => r.supersetWith === row.id)).toBe(false)
    await restorePlanExercises(saved)
    const after = (await loadPlan(id))!
    const day = after.days.find((d) => d.id === row.planDayId)!
    expect(day.exercises.map((r) => r.id)).toEqual(before.days.find((d) => d.id === row.planDayId)!.exercises.map((r) => r.id))
    expect(day.exercises.find((r) => r.id === row.supersetWith)?.supersetWith).toBe(row.id)
  })

  it('pairs with the next exercise and splits again', async () => {
    const id = await saveGeneratedPlan(generatePlan({ ...answers, minutes: 90 }, EXERCISES))
    const day = (await loadPlan(id))!.days[0]
    const unpaired = day.exercises.findIndex((r, i) => !r.supersetWith && day.exercises[i + 1] && !day.exercises[i + 1].supersetWith)
    expect(unpaired).toBeGreaterThanOrEqual(0)
    const a = day.exercises[unpaired]
    const b = day.exercises[unpaired + 1]
    expect(await toggleSuperset(a.id)).toBe('paired')
    expect((await db.planExercises.get(b.id))?.supersetWith).toBe(a.id)
    expect(await toggleSuperset(b.id)).toBe('split')
    expect((await db.planExercises.get(a.id))?.supersetWith).toBeNull()
  })

  it('deletes a plan and brings it back on undo', async () => {
    const id = await saveGeneratedPlan(generatePlan(answers, EXERCISES))
    const count = await db.planExercises.count()
    const snap = await deletePlan(id)
    expect(await db.planExercises.count()).toBe(0)
    await restorePlan(snap!)
    expect(await db.planExercises.count()).toBe(count)
    expect((await activePlan())?.plan.id).toBe(id)
  })

  it('marks done, today, missed and the next session of the week', async () => {
    const id = await saveGeneratedPlan(generatePlan(answers, EXERCISES))
    const bundle = (await loadPlan(id))!
    // Week of Monday 2026-11-23; today is Thursday the 26th. Monday was trained, Tuesday skipped.
    const done = newRow<Session>({ date: '2026-11-23', startedAt: '2026-11-23T17:00:00Z', endedAt: '2026-11-23T18:00:00Z', planDayId: bundle.days[0].id, name: 'Upper A', exerciseIds: [] })
    const week = planWeek(bundle, [done], '2026-11-26')
    expect(week.map((w) => w.status)).toEqual(['done', 'missed', 'today', 'upcoming'])
    const friday = planWeek(bundle, [done], '2026-11-28')
    expect(friday.map((w) => w.status)).toEqual(['done', 'next', 'missed', 'missed'])
  })
})

describe('stalls', () => {
  const ex = { id: 'fedb:Barbell_Squat' } as Exercise
  async function sessionWith(date: string, sets: [number, number][]) {
    const s = newRow<Session>({ date, startedAt: `${date}T17:00:00Z`, endedAt: `${date}T18:00:00Z`, name: 'W', exerciseIds: [ex.id] })
    await db.sessions.add(s)
    await db.setLogs.bulkAdd(sets.map(([w, r], i) => newRow<SetLog>({ sessionId: s.id, exerciseId: ex.id, date, kind: 'work', weightKg: w, reps: r, setIndex: i })))
    return s
  }

  it('flags a lift after three sessions without beating the best before them', async () => {
    await sessionWith('2026-11-02', [[100, 8], [100, 8]])
    await sessionWith('2026-11-05', [[100, 7]])
    await sessionWith('2026-11-09', [[100, 8]])
    expect(await detectStall(ex.id)).toBeNull()
    await sessionWith('2026-11-12', [[100, 6], [97.5, 7]])
    const stall = await detectStall(ex.id)
    expect(stall).toEqual({ sessions: 3, topKg: 100 })
  })

  it('does not flag a lift that is still improving', async () => {
    await sessionWith('2026-11-02', [[100, 8]])
    await sessionWith('2026-11-05', [[100, 8]])
    await sessionWith('2026-11-09', [[100, 8]])
    await sessionWith('2026-11-12', [[100, 9]])
    expect(await detectStall(ex.id)).toBeNull()
  })
})
