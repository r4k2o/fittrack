import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db'
import { applyHealthImport, listImports, previewHealthImport, undoLatestImport } from './health'
import { upsertMetric } from './metrics'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

const FILE = [
  'steps;2026-11-15;9000',
  'steps;2026-11-16;8000',
  'weight;2026-11-16;80.4',
  'sleep;2026-11-15 23:30;2026-11-16 06:30;Core',
  'workout;2026-11-16 18:00;2026-11-16 18:45;Running;450;8',
].join('\n')

describe('health import', () => {
  it('previews, imports, and adds nothing when the same file comes again', async () => {
    const preview = await previewHealthImport(FILE)
    expect(preview.changes).toEqual([
      { kind: 'weight', added: 1, changed: 0, unchanged: 0 },
      { kind: 'steps', added: 2, changed: 0, unchanged: 0 },
      { kind: 'sleepMin', added: 1, changed: 0, unchanged: 0 },
      { kind: 'cardio', added: 1, changed: 0, unchanged: 0 },
    ])
    const log = await applyHealthImport(preview)
    expect(log.counts).toMatchObject({ added: 6, changed: 0 }) // 4 metrics, 1 computed score, 1 workout
    expect(await db.metrics.where('[type+date+source]').equals(['sleepScore', '2026-11-16', 'computed']).count()).toBe(1)

    const again = await previewHealthImport(FILE)
    expect(again.previousImport?.id).toBe(log.id)
    expect(again.changes.every((c) => c.added === 0 && c.changed === 0)).toBe(true)
    const second = await applyHealthImport(again)
    expect(second.counts).toMatchObject({ added: 0, changed: 0, unchanged: 6 })
    expect(await db.metrics.count()).toBe(5)
    expect(await db.cardioSessions.count()).toBe(1)
  })

  it('keeps manual readings apart from imported ones', async () => {
    await upsertMetric('weight', '2026-11-16', 80.9, 'manual')
    await applyHealthImport(await previewHealthImport(FILE))
    const rows = await db.metrics.where('[type+date]').equals(['weight', '2026-11-16']).toArray()
    expect(rows.map((r) => `${r.source}:${r.value}`).sort()).toEqual(['health:80.4', 'manual:80.9'])
  })

  it('undoes the latest import, restoring values it overwrote', async () => {
    await applyHealthImport(await previewHealthImport(FILE))
    const changed = FILE.replace('steps;2026-11-16;8000', 'steps;2026-11-16;8500') + '\nsteps;2026-11-17;7000'
    const preview = await previewHealthImport(changed)
    expect(preview.changes.find((c) => c.kind === 'steps')).toEqual({ kind: 'steps', added: 1, changed: 1, unchanged: 1 })
    await applyHealthImport(preview)
    expect((await db.metrics.where('[type+date+source]').equals(['steps', '2026-11-16', 'health']).first())?.value).toBe(8500)

    await undoLatestImport()
    expect((await db.metrics.where('[type+date+source]').equals(['steps', '2026-11-16', 'health']).first())?.value).toBe(8000)
    expect(await db.metrics.where('[type+date+source]').equals(['steps', '2026-11-17', 'health']).count()).toBe(0)
    expect(await listImports()).toHaveLength(1)
    await undoLatestImport()
    expect(await db.metrics.count()).toBe(0)
    expect(await db.cardioSessions.count()).toBe(0)
  })
})
