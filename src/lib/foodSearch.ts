// Search over the local food list and everything scanned or created, in memory.
// Matching is by prefix and tolerant of typos, across name, synonyms and brand;
// recent and frequent foods rank first. Text search never goes to the network.

import MiniSearch from 'minisearch'
import type { Food } from '../db'

/** Lowercase, no accents, ß → ss: "Käse" matches "kase" and "kaese" matches loosely. */
export function normalizeTerm(term: string): string {
  return term
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
}

type Doc = Pick<Food, 'id' | 'name' | 'brand' | 'synonyms'>

export function buildFoodIndex(foods: readonly Doc[]): MiniSearch<Doc> {
  const index = new MiniSearch<Doc>({
    fields: ['name', 'synonyms', 'brand'],
    storeFields: [],
    processTerm: (t) => normalizeTerm(t) || null,
    extractField: (doc, field) => {
      if (field === 'synonyms') return (doc.synonyms ?? []).join(' ')
      return (doc as unknown as Record<string, string | undefined>)[field] ?? ''
    },
  })
  index.addAll(foods as Doc[])
  return index
}

export interface Usage {
  /** Uses in the last 60 days. */
  count: number
  /** Days since last use, if any. */
  daysAgo?: number
}

export function usageBoost(u: Usage | undefined): number {
  if (!u) return 1
  const recency = u.daysAgo == null ? 0 : u.daysAgo <= 3 ? 1 : u.daysAgo <= 14 ? 0.5 : 0.2
  return 1 + recency + Math.log1p(u.count) * 0.5
}

export function searchFoods(index: MiniSearch<Doc>, query: string, usage: ReadonlyMap<string, Usage>, limit = 40): string[] {
  const q = query.trim()
  if (!q) return []
  const opts = {
    prefix: true,
    fuzzy: (term: string) => (term.length > 3 ? 0.2 : false),
    boost: { name: 3, synonyms: 2, brand: 1 },
    boostDocument: (id: unknown) => usageBoost(usage.get(String(id))),
  }
  let hits = index.search(q, { ...opts, combineWith: 'AND' })
  if (hits.length === 0) hits = index.search(q, { ...opts, combineWith: 'OR' })
  return hits.slice(0, limit).map((h) => String(h.id))
}
