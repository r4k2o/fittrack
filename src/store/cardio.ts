import { db, newRow, type CardioSession, type CardioType } from '../db'
import { estimateCardioKcal } from '../lib/cardio'
import { latestMetric } from './metrics'

export interface CardioInput {
  date: string
  startedAt?: string | null
  type: CardioType
  durationMin: number
  distanceKm?: number | null
  rpe?: number | null
  avgHr?: number | null
  /** From the watch; when empty the app estimates it. */
  kcal?: number | null
  notes?: string
}

/** Body weight for the calorie estimate: the latest reading, else the one the targets used. */
export async function bodyWeightKg(): Promise<number | null> {
  const m = await latestMetric('weight')
  if (m) return m.value
  const t = await db.nutritionTargets.orderBy('effectiveFrom').last()
  return t?.inputs?.weightKg ?? null
}

export async function saveCardio(input: CardioInput, id?: string): Promise<CardioSession> {
  const weight = await bodyWeightKg()
  const measured = input.kcal != null && input.kcal > 0
  const kcal = measured ? input.kcal! : weight ? estimateCardioKcal(input.type, input.durationMin, weight, input.distanceKm, input.rpe) : null
  const fields = {
    date: input.date,
    startedAt: input.startedAt ?? null,
    type: input.type,
    durationMin: input.durationMin,
    distanceKm: input.distanceKm ?? null,
    rpe: input.rpe ?? null,
    avgHr: input.avgHr ?? null,
    kcal,
    kcalEstimated: !measured && kcal != null,
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
  }
  if (id) {
    const prev = await db.cardioSessions.get(id)
    if (prev) {
      const { notes: _drop, ...rest } = prev
      void _drop
      const row: CardioSession = { ...rest, ...fields, updatedAt: new Date().toISOString() }
      await db.cardioSessions.put(row)
      return row
    }
  }
  const row = newRow<CardioSession>({ ...fields, source: 'manual', externalId: null })
  await db.cardioSessions.add(row)
  return row
}

export async function deleteCardio(id: string): Promise<CardioSession | null> {
  const row = await db.cardioSessions.get(id)
  if (row) await db.cardioSessions.delete(id)
  return row ?? null
}

export async function restoreCardio(row: CardioSession): Promise<void> {
  await db.cardioSessions.put(row)
}

export async function cardioBetween(from: string, to: string): Promise<CardioSession[]> {
  const rows = await db.cardioSessions.where('date').between(from, to, true, true).toArray()
  return rows.sort((a, b) => b.date.localeCompare(a.date) || (b.startedAt ?? b.createdAt).localeCompare(a.startedAt ?? a.createdAt))
}

export async function lastCardio(): Promise<CardioSession | undefined> {
  return db.cardioSessions.orderBy('date').last()
}

/** Calories burned in cardio on a day, for the optional "add burned calories" budget. */
export async function burnedKcal(date: string): Promise<number> {
  const rows = await db.cardioSessions.where('date').equals(date).toArray()
  return rows.reduce((n, r) => n + (r.kcal ?? 0), 0)
}

