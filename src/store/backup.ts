import type { Table } from 'dexie'
import { db, SCHEMA_VERSION, STORE_NAMES, type Photo, type StoreName } from '../db'
import {
  backupFileName,
  decodeBackup,
  encodeBackup,
  keyOf,
  planRestore,
  rowsToMerge,
  type BackupContent,
  type BackupRow,
  type DecodeResult,
  type RestoreMode,
  type Snapshot,
  type StorePlan,
} from '../lib/backup'
import { toCsv } from '../lib/csv'
import { localDay } from '../lib/dates'
import { LOCAL_ONLY_SETTINGS, setSetting } from './settings'

const table = (store: StoreName) => db.table(store) as Table<BackupRow, string>

/**
 * Rows a backup carries and a restore may touch: everything except the bundled
 * exercise library (the app loads it again) and per-device settings such as an API
 * key, so the file never holds a secret.
 */
async function backupRows(store: StoreName): Promise<BackupRow[]> {
  if (store === 'exercises') return (await db.exercises.where('custom').equals(1).toArray()) as unknown as BackupRow[]
  const rows = await table(store).toArray()
  if (store === 'settings') return rows.filter((r) => !LOCAL_ONLY_SETTINGS.has(String(r.key)))
  return rows
}

export async function collectSnapshot(includePhotos: boolean): Promise<{ data: Snapshot; files: Record<string, Uint8Array> }> {
  const data: Snapshot = {}
  const files: Record<string, Uint8Array> = {}
  await db.transaction('r', db.tables, async () => {
    for (const store of STORE_NAMES) {
      if (store === 'photos') continue
      data[store] = await backupRows(store)
    }
  })
  data.photos = []
  if (includePhotos) {
    for (const p of await db.photos.toArray()) {
      const image = `photos/${p.id}.jpg`
      const thumb = `photos/${p.id}-thumb.jpg`
      files[image] = new Uint8Array(await p.image.arrayBuffer())
      files[thumb] = new Uint8Array(await p.thumbnail.arrayBuffer())
      data.photos.push({ ...p, image: { $file: image, type: p.image.type || 'image/jpeg' }, thumbnail: { $file: thumb, type: p.thumbnail.type || 'image/jpeg' } })
    }
  }
  return { data, files }
}

export async function exportBackup(includePhotos: boolean): Promise<File> {
  const { data, files } = await collectSnapshot(includePhotos)
  const now = new Date()
  const bytes = encodeBackup(data, files, { exportedAt: now.toISOString(), schemaVersion: SCHEMA_VERSION, appVersion: __APP_VERSION__ })
  return new File([bytes as BlobPart], backupFileName(localDay(now)), { type: 'application/zip' })
}

export async function markBackedUp(): Promise<void> {
  await setSetting('lastBackupAt', new Date().toISOString())
}

export async function readBackup(file: Blob): Promise<DecodeResult> {
  return decodeBackup(new Uint8Array(await file.arrayBuffer()), SCHEMA_VERSION)
}

export async function previewRestore(content: BackupContent, mode: RestoreMode): Promise<StorePlan[]> {
  const existing: Snapshot = {}
  await db.transaction('r', db.tables, async () => {
    for (const store of STORE_NAMES) existing[store] = await backupRows(store)
  })
  // photo rows hold Blobs on the phone and file references in the backup; compare ids only
  if (existing.photos) existing.photos = existing.photos.map((p) => ({ ...p, image: null, thumbnail: null }))
  const incoming: Snapshot = { ...content.data, photos: (content.data.photos ?? []).map((p) => ({ ...p, image: null, thumbnail: null })) }
  return planRestore(incoming, existing, mode)
}

function hydratePhoto(row: BackupRow, files: Record<string, Uint8Array>): Photo {
  const blob = (ref: unknown) => {
    const r = ref as { $file: string; type: string }
    return new Blob([files[r.$file] as BlobPart], { type: r.type })
  }
  return { ...(row as unknown as Photo), image: blob(row.image), thumbnail: blob(row.thumbnail) }
}

/** Writes a validated backup in one transaction, so a failed restore changes nothing. */
export async function applyRestore(content: BackupContent, mode: RestoreMode): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const store of STORE_NAMES) {
      const key = keyOf(store)
      let rows = content.data[store] ?? []
      if (store === 'photos') rows = rows.map((r) => hydratePhoto(r, content.files) as unknown as BackupRow)
      const t = table(store)
      if (mode === 'replace') {
        if (store === 'exercises') await db.exercises.where('custom').equals(1).delete()
        else if (store === 'settings') {
          const keys = (await t.toArray()).map((r) => String(r.key)).filter((k) => !LOCAL_ONLY_SETTINGS.has(k))
          await t.bulkDelete(keys)
        } else await t.clear()
        await t.bulkPut(rows)
      } else {
        const existing = await t.bulkGet(rows.map((r) => String(r[key])))
        const map = new Map<string, BackupRow>()
        existing.forEach((r) => {
          if (r) map.set(String(r[key]), r)
        })
        await t.bulkPut(rowsToMerge(rows, map, key))
      }
    }
  })
}

/** Diary, sets, cardio and metrics as CSV files that open in Numbers or Excel. */
export async function exportCsv(): Promise<File[]> {
  const day = localDay()
  const [entries, sets, sessions, exercises, cardio, metrics] = await Promise.all([
    db.diaryEntries.orderBy('date').toArray(),
    db.setLogs.toArray(),
    db.sessions.toArray(),
    db.exercises.toArray(),
    db.cardioSessions.orderBy('date').toArray(),
    db.metrics.orderBy('[type+date]').toArray(),
  ])
  const sessionName = new Map(sessions.map((s) => [s.id, s.name]))
  const exerciseName = new Map(exercises.map((e) => [e.id, e.name]))
  sets.sort((a, b) => a.date.localeCompare(b.date) || a.sessionId.localeCompare(b.sessionId) || a.setIndex - b.setIndex)
  const file = (name: string, csv: string) => new File([csv], `fittrack-${name}-${day}.csv`, { type: 'text/csv' })
  return [
    file(
      'diary',
      toCsv(
        ['date', 'meal', 'food', 'brand', 'grams', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'fibre_g', 'sugar_g', 'sat_fat_g', 'salt_g', 'source'],
        entries.map((e) => [e.date, e.meal, e.name, e.brand, e.grams, e.macros.kcal, e.macros.protein, e.macros.carbs, e.macros.fat, e.macros.fibre, e.macros.sugar, e.macros.satFat, e.macros.salt, e.source]),
      ),
    ),
    file(
      'sets',
      toCsv(
        ['date', 'workout', 'exercise', 'set', 'kind', 'weight_kg', 'reps', 'rir'],
        sets.map((s) => [s.date, sessionName.get(s.sessionId), exerciseName.get(s.exerciseId) ?? s.exerciseId, s.setIndex + 1, s.kind, s.weightKg, s.reps, s.rir]),
      ),
    ),
    file(
      'cardio',
      toCsv(
        ['date', 'type', 'duration_min', 'distance_km', 'rpe', 'avg_hr', 'kcal', 'source', 'notes'],
        cardio.map((c) => [c.date, c.type, c.durationMin, c.distanceKm, c.rpe, c.avgHr, c.kcal, c.source, c.notes]),
      ),
    ),
    file('metrics', toCsv(['date', 'type', 'value', 'source'], metrics.map((m) => [m.date, m.type, m.value, m.source]))),
  ]
}
