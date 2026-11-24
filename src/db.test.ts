import { beforeEach, describe, expect, it } from 'vitest'
import { db, newRow, STORE_NAMES, type Metric, type Session } from './db'
import { copyEntries, logQuickAdd, mealEntries, recentMeals } from './store/diary'
import { metricSeries, upsertMetric } from './store/metrics'
import { lastTime, logSet } from './store/training'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

async function addSession(date: string): Promise<Session> {
  const s = newRow<Session>({ date, startedAt: `${date}T17:00:00.000Z`, endedAt: `${date}T18:00:00.000Z`, name: 'Upper', exerciseIds: ['bench'] })
  await db.sessions.add(s)
  return s
}

describe('schema', () => {
  it('holds the 18 stores of the data model', () => {
    expect(db.tables).toHaveLength(18)
    expect(db.tables.map((t) => t.name).sort()).toEqual([...STORE_NAMES].sort())
  })

  it('keeps metrics unique on type, date and source', async () => {
    await db.metrics.add(newRow<Metric>({ type: 'weight', date: '2026-11-16', value: 80.4, source: 'manual' }))
    await expect(db.metrics.add(newRow<Metric>({ type: 'weight', date: '2026-11-16', value: 81, source: 'manual' }))).rejects.toThrow()
    // the same day from another source is a separate value
    await db.metrics.add(newRow<Metric>({ type: 'weight', date: '2026-11-16', value: 80.6, source: 'health' }))
    expect(await db.metrics.count()).toBe(2)
  })

  it('updates instead of duplicating when the same metric is written twice', async () => {
    await upsertMetric('weight', '2026-11-16', 80.4)
    await upsertMetric('weight', '2026-11-16', 80.1)
    await upsertMetric('weight', '2026-11-17', 80.0)
    expect(await db.metrics.count()).toBe(2)
    expect(await metricSeries('weight')).toEqual([
      { date: '2026-11-16', value: 80.1 },
      { date: '2026-11-17', value: 80.0 },
    ])
  })

  it('prefers a manual value over an imported one for the same day', async () => {
    await upsertMetric('weight', '2026-11-16', 80.9, 'health')
    await upsertMetric('weight', '2026-11-16', 80.4, 'manual')
    expect(await metricSeries('weight')).toEqual([{ date: '2026-11-16', value: 80.4 }])
  })

  it('finds last time for an exercise, skipping warm-ups and the workout in progress', async () => {
    const older = await addSession('2026-11-10')
    for (const [i, reps] of [8, 8, 7].entries()) await logSet(older, 'bench', i, { weightKg: 70, reps })
    const last = await addSession('2026-11-13')
    await logSet(last, 'bench', 0, { weightKg: 40, reps: 10, kind: 'warmup' })
    // logged out of order on purpose: the lookup must sort by set
    await logSet(last, 'bench', 3, { weightKg: 72.5, reps: 7 })
    await logSet(last, 'bench', 1, { weightKg: 72.5, reps: 8 })
    await logSet(last, 'bench', 2, { weightKg: 72.5, reps: 8 })
    const current = await addSession('2026-11-16')
    await logSet(current, 'bench', 0, { weightKg: 75, reps: 6 })

    const found = await lastTime('bench', current.id)
    expect(found?.date).toBe('2026-11-13')
    expect(found?.sets.map((s) => [s.weightKg, s.reps])).toEqual([
      [72.5, 8],
      [72.5, 8],
      [72.5, 7],
    ])
    expect(await lastTime('squat', current.id)).toBeNull()
  })

  it('queries the diary by date and meal through the compound index', async () => {
    await logQuickAdd({ kcal: 400, protein: 30 }, 'breakfast', '2026-11-15')
    await logQuickAdd({ kcal: 650, protein: 45 }, 'lunch', '2026-11-15')
    await logQuickAdd({ kcal: 300 }, 'lunch', '2026-11-16')
    await logQuickAdd({ kcal: 500 }, 'lunch', '2026-11-16')

    expect((await mealEntries('2026-11-16', 'lunch')).map((e) => e.macros.kcal)).toEqual([300, 500])
    expect(await mealEntries('2026-11-16', 'breakfast')).toEqual([])
    expect(await db.diaryEntries.where('date').equals('2026-11-15').count()).toBe(2)
  })

  it('offers earlier meals once each and copies them as new rows', async () => {
    await logQuickAdd({ name: 'Oats', kcal: 400 }, 'breakfast', '2026-11-14')
    await logQuickAdd({ name: 'Oats', kcal: 400 }, 'breakfast', '2026-11-15')
    await logQuickAdd({ name: 'Eggs', kcal: 300 }, 'breakfast', '2026-11-13')

    const meals = await recentMeals('breakfast', '2026-11-16')
    expect(meals.map((m) => m.date)).toEqual(['2026-11-15', '2026-11-13'])

    const copies = await copyEntries(meals[0].entries, '2026-11-16')
    expect(copies[0].id).not.toBe(meals[0].entries[0].id)
    expect((await mealEntries('2026-11-16', 'breakfast')).map((e) => [e.name, e.source])).toEqual([['Oats', 'copy']])
  })
})
