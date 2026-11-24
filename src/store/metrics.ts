import Dexie from 'dexie'
import { db, newRow, type Metric, type MetricSource, type MetricType } from '../db'
import type { DayValue } from '../lib/trends'

/**
 * One value per type, date and source. Writing the same key again updates the
 * existing row, so re-entering today's weight or re-importing a file adds nothing.
 */
export async function upsertMetric(type: MetricType, date: string, value: number, source: MetricSource = 'manual'): Promise<Metric> {
  return db.transaction('rw', db.metrics, async () => {
    const existing = await db.metrics.where('[type+date+source]').equals([type, date, source]).first()
    if (existing) {
      const updated = { ...existing, value, updatedAt: new Date().toISOString() }
      await db.metrics.put(updated)
      return updated
    }
    const row = newRow<Metric>({ type, date, value, source })
    await db.metrics.add(row)
    return row
  })
}

export async function deleteMetric(id: string): Promise<void> {
  await db.metrics.delete(id)
}

const SOURCE_PRIORITY: Record<MetricSource, number> = { manual: 0, health: 1, computed: 2 }

/** One value per day for a metric type, sorted by date. Manual entries win over imports. */
export async function metricSeries(type: MetricType, from: string = '0000-00-00', to: string = '9999-99-99'): Promise<DayValue[]> {
  const rows = await db.metrics.where('[type+date]').between([type, from], [type, to], true, true).toArray()
  return reduceDaily(rows)
}

export function reduceDaily(rows: readonly Metric[]): DayValue[] {
  const best = new Map<string, Metric>()
  for (const r of rows) {
    const cur = best.get(r.date)
    if (!cur || SOURCE_PRIORITY[r.source] < SOURCE_PRIORITY[cur.source]) best.set(r.date, r)
  }
  return [...best.values()].sort((a, b) => a.date.localeCompare(b.date)).map((r) => ({ date: r.date, value: r.value }))
}

export async function latestMetric(type: MetricType): Promise<Metric | undefined> {
  return db.metrics.where('[type+date]').between([type, Dexie.minKey], [type, Dexie.maxKey]).last()
}
