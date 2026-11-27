// The backup file: one zip with a manifest (schema version, date, row counts), one
// JSON file per store and a photos folder when that switch is on. Pure functions;
// reading and writing the database lives in store/backup.ts.

import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import { STORE_NAMES, type StoreName } from '../db'
import { manifestSchema, rowSchemas, type BackupManifest } from './schemas'

export const BACKUP_FORMAT = 1

export type BackupRow = Record<string, unknown>
export type Snapshot = Partial<Record<StoreName, BackupRow[]>>

export interface BackupContent {
  manifest: BackupManifest
  data: Snapshot
  /** Binary files by path inside the zip, e.g. photos/<id>.jpg. */
  files: Record<string, Uint8Array>
  warnings: string[]
}

export type DecodeResult = { ok: true; content: BackupContent } | { ok: false; errors: string[] }

/** Migrations from schema version n to n + 1, applied in order to older backups. */
const MIGRATIONS: Record<number, (data: Snapshot) => Snapshot> = {}

export function backupFileName(day: string): string {
  return `fittrack-backup-${day}.zip`
}

export function encodeBackup(
  data: Snapshot,
  files: Record<string, Uint8Array>,
  opts: { exportedAt: string; schemaVersion: number; appVersion?: string },
): Uint8Array {
  const counts: Record<string, number> = {}
  for (const store of STORE_NAMES) counts[store] = data[store]?.length ?? 0
  const manifest: BackupManifest = {
    app: 'fittrack',
    format: BACKUP_FORMAT,
    schemaVersion: opts.schemaVersion,
    exportedAt: opts.exportedAt,
    ...(opts.appVersion ? { appVersion: opts.appVersion } : {}),
    counts,
    includesPhotos: Object.keys(files).length > 0,
  }
  const zip: Zippable = { 'manifest.json': strToU8(JSON.stringify(manifest, null, 2)) }
  for (const store of STORE_NAMES) zip[`data/${store}.json`] = strToU8(JSON.stringify(data[store] ?? []))
  // JPEGs are already compressed; storing them avoids burning time on deflate
  for (const [path, bytes] of Object.entries(files)) zip[path] = [bytes, { level: 0 }]
  return zipSync(zip, { level: 6, mtime: new Date(opts.exportedAt) })
}

export function decodeBackup(bytes: Uint8Array, currentSchema: number): DecodeResult {
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(bytes)
  } catch {
    return { ok: false, errors: ['Das ist keine Zip-Datei. Wähle eine fittrack-backup-….zip.'] }
  }
  const rawManifest = entries['manifest.json']
  if (!rawManifest) return { ok: false, errors: ['Kein manifest.json im Archiv, also kein Fittrack-Backup.'] }

  let manifest: BackupManifest
  try {
    const parsed = manifestSchema.safeParse(JSON.parse(strFromU8(rawManifest)))
    if (!parsed.success) return { ok: false, errors: ['Das Manifest gehört zu keinem Fittrack-Backup.'] }
    manifest = parsed.data
  } catch {
    return { ok: false, errors: ['Das Manifest ist kein gültiges JSON.'] }
  }
  if (manifest.schemaVersion > currentSchema) {
    return {
      ok: false,
      errors: [`This backup comes from a newer version of the app (schema ${manifest.schemaVersion}). Update the app first: close it and open it again.`],
    }
  }

  const warnings: string[] = []
  let data: Snapshot = {}
  for (const store of STORE_NAMES) {
    const raw = entries[`data/${store}.json`]
    if (!raw) continue
    try {
      const rows: unknown = JSON.parse(strFromU8(raw))
      if (!Array.isArray(rows)) return { ok: false, errors: [`data/${store}.json ist keine Liste von Zeilen.`] }
      data[store] = rows as BackupRow[]
    } catch {
      return { ok: false, errors: [`data/${store}.json ist kein gültiges JSON.`] }
    }
  }
  for (const name of Object.keys(entries)) {
    if (name.startsWith('data/') && !STORE_NAMES.includes(name.slice(5, -5) as StoreName)) {
      warnings.push(`${name} is not a store this version knows; it was ignored.`)
    }
  }

  for (let v = manifest.schemaVersion; v < currentSchema; v++) {
    const step = MIGRATIONS[v]
    if (!step) return { ok: false, errors: [`Keine Migration von Schema ${v} auf ${v + 1}.`] }
    data = step(data)
  }

  const errors: string[] = []
  for (const store of STORE_NAMES) {
    const rows = data[store] ?? []
    rows.forEach((row, i) => {
      const r = rowSchemas[store].safeParse(row)
      if (!r.success && errors.length < 20) {
        const issue = r.error.issues[0]
        errors.push(`${store} Zeile ${i + 1}: ${issue.path.join('.') || 'Zeile'} ${issue.message}`)
      }
    })
    const expected = manifest.counts[store]
    if (expected != null && expected !== rows.length) warnings.push(`${store}: manifest says ${expected} rows, file has ${rows.length}.`)
  }

  const files: Record<string, Uint8Array> = {}
  for (const photo of data.photos ?? []) {
    for (const field of ['image', 'thumbnail'] as const) {
      const ref = photo[field] as { $file?: string } | undefined
      const path = ref?.$file
      if (!path || !entries[path]) errors.push(`photos: file ${path ?? '(missing)'} is not in the archive.`)
      else files[path] = entries[path]
    }
  }

  if (errors.length) return { ok: false, errors }
  return { ok: true, content: { manifest, data, files, warnings } }
}

export type RestoreMode = 'replace' | 'merge'

export interface StorePlan {
  store: StoreName
  inBackup: number
  add: number
  update: number
  unchanged: number
  remove: number
}

export const keyOf = (store: StoreName): string => (store === 'settings' ? 'key' : 'id')

/**
 * What a restore would do per store, before anything is written. `existing` holds
 * the rows a restore may touch (custom exercises only, settings without local keys).
 * Merge goes row by row and keeps the newer updatedAt; it cannot see deletions.
 * Replace makes the phone match the backup exactly.
 */
export function planRestore(backup: Snapshot, existing: Snapshot, mode: RestoreMode): StorePlan[] {
  return STORE_NAMES.map((store) => {
    const key = keyOf(store)
    const incoming = backup[store] ?? []
    const current = new Map((existing[store] ?? []).map((r) => [String(r[key]), r]))
    let add = 0
    let update = 0
    let unchanged = 0
    for (const row of incoming) {
      const prev = current.get(String(row[key]))
      if (!prev) add += 1
      else if (mode === 'replace' ? JSON.stringify(prev) !== JSON.stringify(row) : isNewer(row, prev)) update += 1
      else unchanged += 1
    }
    const incomingKeys = new Set(incoming.map((r) => String(r[key])))
    const remove = mode === 'replace' ? [...current.keys()].filter((k) => !incomingKeys.has(k)).length : 0
    return { store, inBackup: incoming.length, add, update, unchanged, remove }
  })
}

export function isNewer(a: BackupRow, b: BackupRow): boolean {
  return String(a.updatedAt ?? '') > String(b.updatedAt ?? '')
}

/** Rows from the backup that a merge writes: new ones and those with a newer updatedAt. */
export function rowsToMerge(incoming: readonly BackupRow[], existing: ReadonlyMap<string, BackupRow>, key: string): BackupRow[] {
  return incoming.filter((row) => {
    const prev = existing.get(String(row[key]))
    return !prev || isNewer(row, prev)
  })
}
