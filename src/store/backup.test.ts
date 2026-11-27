import { strToU8, unzipSync, zipSync, strFromU8 } from 'fflate'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, newRow, SCHEMA_VERSION, type Exercise, type Photo } from '../db'
import { decodeBackup } from '../lib/backup'
import { applyRestore, exportBackup, previewRestore, readBackup } from './backup'
import { logQuickAdd } from './diary'
import { upsertMetric } from './metrics'
import { getSetting, setSetting } from './settings'

const libraryExercise = (): Exercise =>
  ({
    id: 'fedb:Barbell_Squat',
    name: 'Barbell Back Squat',
    primary: ['quads'],
    secondary: ['glutes'],
    equipment: 'barbell',
    pattern: 'squat',
    jointStress: ['knee'],
    compound: true,
    custom: 0,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  }) as Exercise

async function seedSample() {
  await db.exercises.add(libraryExercise())
  await db.exercises.add(newRow<Exercise>({ name: 'Cable Y-Raise', primary: ['shoulders'], secondary: [], equipment: 'cable', pattern: 'isolation', jointStress: [], compound: false, custom: 1 }))
  await logQuickAdd({ name: 'Oats', kcal: 380, protein: 13, carbs: 60, fat: 7 }, 'breakfast', '2026-11-15')
  await upsertMetric('weight', '2026-11-15', 80.4)
  await setSetting('onboardingDone', true)
  await setSetting('deviceCheck', { ranAt: 'x', results: {} })
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('backup', () => {
  it('writes a manifest, one JSON file per store, and leaves out the bundled library and local settings', async () => {
    await seedSample()
    const file = await exportBackup(false)
    expect(file.name).toMatch(/^fittrack-backup-\d{4}-\d{2}-\d{2}\.zip$/)
    const entries = unzipSync(new Uint8Array(await file.arrayBuffer()))
    const manifest = JSON.parse(strFromU8(entries['manifest.json']))
    expect(manifest).toMatchObject({ app: 'fittrack', format: 1, schemaVersion: SCHEMA_VERSION, includesPhotos: false })
    expect(Object.keys(entries).filter((k) => k.startsWith('data/'))).toHaveLength(18)
    expect(manifest.counts).toMatchObject({ diaryEntries: 1, metrics: 1, exercises: 1 })
    const exercises = JSON.parse(strFromU8(entries['data/exercises.json']))
    expect(exercises.map((e: Exercise) => e.name)).toEqual(['Cable Y-Raise'])
    const settings = JSON.parse(strFromU8(entries['data/settings.json']))
    expect(settings.map((s: { key: string }) => s.key)).toEqual(['onboardingDone'])
  })

  it('restores into an empty app with Replace and matches the backup exactly', async () => {
    await seedSample()
    const file = await exportBackup(false)
    await db.delete()
    await db.open()
    await db.exercises.add(libraryExercise())
    await logQuickAdd({ name: 'Stray', kcal: 100 }, 'snacks', '2026-11-20')

    const decoded = await readBackup(file)
    if (!decoded.ok) throw new Error(decoded.errors.join())
    const plan = await previewRestore(decoded.content, 'replace')
    expect(plan.find((p) => p.store === 'diaryEntries')).toMatchObject({ add: 1, remove: 1 })

    await applyRestore(decoded.content, 'replace')
    expect((await db.diaryEntries.toArray()).map((e) => e.name)).toEqual(['Oats'])
    expect(await db.exercises.count()).toBe(2) // library row kept, custom row restored
    expect(await getSetting('onboardingDone')).toBe(true)
    expect(await db.metrics.count()).toBe(1)
  })

  it('merges row by row and keeps the newer updatedAt', async () => {
    await seedSample()
    const file = await exportBackup(false)
    // after the backup: one entry edited (newer than the file), one added
    const [oats] = await db.diaryEntries.toArray()
    await db.diaryEntries.put({ ...oats, name: 'Oats, edited', updatedAt: new Date(Date.now() + 60_000).toISOString() })
    await logQuickAdd({ name: 'Apple', kcal: 80 }, 'snacks', '2026-11-16')

    const decoded = await readBackup(file)
    if (!decoded.ok) throw new Error(decoded.errors.join())
    const plan = await previewRestore(decoded.content, 'merge')
    expect(plan.find((p) => p.store === 'diaryEntries')).toMatchObject({ add: 0, update: 0, unchanged: 1, remove: 0 })
    await applyRestore(decoded.content, 'merge')
    expect((await db.diaryEntries.toArray()).map((e) => e.name).sort()).toEqual(['Apple', 'Oats, edited'])
  })

  it('carries photos as files inside the zip when asked', async () => {
    const photo = newRow<Photo>({
      takenAt: '2026-11-16T07:00:00.000Z',
      isoWeek: '2026-W47',
      pose: 'front',
      image: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }),
      thumbnail: new Blob([new Uint8Array([4])], { type: 'image/jpeg' }),
      weightKg: 80,
    })
    await db.photos.add(photo)
    const without = unzipSync(new Uint8Array(await (await exportBackup(false)).arrayBuffer()))
    expect(JSON.parse(strFromU8(without['data/photos.json']))).toEqual([])

    const file = await exportBackup(true)
    await db.photos.clear()
    const decoded = await readBackup(file)
    if (!decoded.ok) throw new Error(decoded.errors.join())
    await applyRestore(decoded.content, 'merge')
    const back = await db.photos.get(photo.id)
    expect(new Uint8Array(await (back as Photo).image.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('rejects files that are not valid backups, before writing anything', () => {
    expect(decodeBackup(strToU8('hello'), 1)).toMatchObject({ ok: false })
    const manifest = { app: 'fittrack', format: 1, schemaVersion: 1, exportedAt: 'x', counts: {}, includesPhotos: false }
    const bad = zipSync({
      'manifest.json': strToU8(JSON.stringify(manifest)),
      'data/diaryEntries.json': strToU8(JSON.stringify([{ id: 'a', createdAt: 'x', updatedAt: 'x', date: '16.11.2026', meal: 'lunch', name: 'x', macros: { kcal: 1, protein: 0, carbs: 0, fat: 0 }, source: 'quick' }])),
    })
    const r = decodeBackup(bad, 1)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]).toContain('diaryEntries Zeile 1: date')
    const newer = zipSync({ 'manifest.json': strToU8(JSON.stringify({ ...manifest, schemaVersion: 99 })) })
    const n = decodeBackup(newer, 1)
    expect(n.ok).toBe(false)
    if (!n.ok) expect(n.errors[0]).toContain('newer version')
  })
})
