// Health import: a preview first (what would be added, changed or left alone), then
// one transaction that writes the values with source "health" and logs what it did.
// Metrics are unique on type, date and source and workouts carry their source id, so
// importing the same file twice changes nothing. The latest import can be undone.

import { db, newRow, type CardioSession, type ImportLog, type Metric } from '../db'
import { estimateCardioKcal } from '../lib/cardio'
import { parseHealthLines, sleepScore, type DayMetric, type HealthMetric, type ParsedHealth } from '../lib/health'
import { bodyWeightKg } from './cardio'

export type ImportKind = HealthMetric | 'cardio'

export interface ChangeCount {
  kind: ImportKind
  added: number
  changed: number
  unchanged: number
}

export interface ImportPreview {
  parsed: ParsedHealth
  /** Scores the app computes for imported nights (source "computed"). */
  computed: DayMetric[]
  fileHash: string
  /** An earlier import of exactly this file. */
  previousImport: ImportLog | null
  changes: ChangeCount[]
}

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function computedScores(parsed: ParsedHealth): DayMetric[] {
  return parsed.nights.map((n) => ({ type: 'sleepScore' as const, date: n.date, value: sleepScore(n, parsed.nights) }))
}

const same = (a: number, b: number) => Math.abs(a - b) < 1e-6

async function existingMetric(m: DayMetric, source: 'health' | 'computed'): Promise<Metric | undefined> {
  return db.metrics.where('[type+date+source]').equals([m.type, m.date, source]).first()
}

export async function previewHealthImport(text: string): Promise<ImportPreview> {
  const parsed = parseHealthLines(text)
  const computed = computedScores(parsed)
  const fileHash = await sha256(text)
  const previousImport = (await db.imports.where('fileHash').equals(fileHash).first()) ?? null
  const counts = new Map<ImportKind, ChangeCount>()
  const bump = (kind: ImportKind, k: 'added' | 'changed' | 'unchanged') => {
    const c = counts.get(kind) ?? { kind, added: 0, changed: 0, unchanged: 0 }
    c[k]++
    counts.set(kind, c)
  }
  for (const m of parsed.metrics) {
    const prev = await existingMetric(m, 'health')
    bump(m.type, !prev ? 'added' : same(prev.value, m.value) ? 'unchanged' : 'changed')
  }
  for (const w of parsed.workouts) {
    const prev = await db.cardioSessions.where('externalId').equals(w.externalId).first()
    bump('cardio', !prev ? 'added' : prev.durationMin === w.durationMin && prev.distanceKm === w.distanceKm && (w.kcal == null || prev.kcal === w.kcal) ? 'unchanged' : 'changed')
  }
  const order: ImportKind[] = ['weight', 'bodyFat', 'steps', 'sleepMin', 'sleepScore', 'cardio']
  return { parsed, computed, fileHash, previousImport, changes: order.flatMap((k) => (counts.has(k) ? [counts.get(k)!] : [])) }
}

export async function applyHealthImport(preview: ImportPreview, source = 'shortcut'): Promise<ImportLog> {
  const weight = preview.parsed.workouts.some((w) => w.kcal == null) ? await bodyWeightKg() : null
  return db.transaction('rw', db.metrics, db.cardioSessions, db.imports, async () => {
    const now = new Date().toISOString()
    const added = { metrics: [] as string[], cardio: [] as string[] }
    const previous = { metrics: [] as Metric[], cardio: [] as CardioSession[] }
    const counts: Record<string, number> = { added: 0, changed: 0, unchanged: 0, skipped: preview.parsed.skipped.length }

    const write = async (m: DayMetric, src: 'health' | 'computed') => {
      const prev = await existingMetric(m, src)
      if (prev) {
        if (same(prev.value, m.value)) {
          counts.unchanged++
          return
        }
        previous.metrics.push(prev)
        await db.metrics.put({ ...prev, value: m.value, updatedAt: now })
        counts.changed++
        return
      }
      const row = newRow<Metric>({ type: m.type, date: m.date, value: m.value, source: src })
      await db.metrics.add(row)
      added.metrics.push(row.id)
      counts.added++
    }
    for (const m of preview.parsed.metrics) await write(m, 'health')
    for (const m of preview.computed) await write(m, 'computed')

    for (const w of preview.parsed.workouts) {
      const prev = await db.cardioSessions.where('externalId').equals(w.externalId).first()
      const kcal = w.kcal ?? (weight ? estimateCardioKcal(w.type, w.durationMin, weight, w.distanceKm) : null)
      const fields = {
        date: w.date,
        startedAt: w.startedAt,
        type: w.type,
        durationMin: w.durationMin,
        distanceKm: w.distanceKm,
        kcal,
        kcalEstimated: w.kcal == null && kcal != null,
      }
      if (prev) {
        if (prev.durationMin === w.durationMin && prev.distanceKm === w.distanceKm && (w.kcal == null || prev.kcal === w.kcal)) {
          counts.unchanged++
          continue
        }
        previous.cardio.push(prev)
        await db.cardioSessions.put({ ...prev, ...fields, updatedAt: now })
        counts.changed++
        continue
      }
      const row = newRow<CardioSession>({ ...fields, rpe: null, avgHr: null, source: 'health', externalId: w.externalId })
      await db.cardioSessions.add(row)
      added.cardio.push(row.id)
      counts.added++
    }

    const log = newRow<ImportLog>({
      source,
      fromDate: preview.parsed.fromDate ?? '',
      toDate: preview.parsed.toDate ?? '',
      counts,
      fileHash: preview.fileHash,
      added,
      previous,
    })
    await db.imports.add(log)
    return log
  })
}

export async function listImports(): Promise<ImportLog[]> {
  const rows = await db.imports.toArray()
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** Takes back the latest import: removes what it added and restores what it overwrote. */
export async function undoLatestImport(): Promise<ImportLog | null> {
  return db.transaction('rw', db.metrics, db.cardioSessions, db.imports, async () => {
    const [latest] = (await db.imports.toArray()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    if (!latest) return null
    await db.metrics.bulkDelete(latest.added?.metrics ?? [])
    await db.cardioSessions.bulkDelete(latest.added?.cardio ?? [])
    if (latest.previous?.metrics.length) await db.metrics.bulkPut(latest.previous.metrics)
    if (latest.previous?.cardio.length) await db.cardioSessions.bulkPut(latest.previous.cardio)
    await db.imports.delete(latest.id)
    return latest
  })
}
