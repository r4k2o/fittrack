import { db, newRow, type Food, type Nutrients, type Serving } from '../db'
import { addDays, localDay } from '../lib/dates'
import { checkEnergy } from '../lib/macros'
import { setSetting } from './settings'

export async function findByBarcode(code: string): Promise<Food | undefined> {
  return db.foods.where('barcode').equals(code).first()
}

export interface NewFood {
  name: string
  brand?: string
  barcode?: string
  source: Food['source']
  per100: Nutrients
  servings?: Serving[]
  synonyms?: string[]
}

/** Saves a scanned or hand-made food. A barcode that already exists updates that food. */
export async function saveFood(input: NewFood): Promise<Food> {
  const flagged = !checkEnergy(input.per100).ok
  return db.transaction('rw', db.foods, async () => {
    const existing = input.barcode ? await db.foods.where('barcode').equals(input.barcode).first() : undefined
    if (existing) {
      const updated: Food = {
        ...existing,
        ...input,
        servings: input.servings ?? existing.servings,
        flagged,
        updatedAt: new Date().toISOString(),
      }
      await db.foods.put(updated)
      return updated
    }
    const food = newRow<Food>({ ...input, servings: input.servings ?? [], flagged })
    await db.foods.add(food)
    return food
  })
}

export async function updateFood(food: Food): Promise<void> {
  await db.foods.put({ ...food, flagged: !checkEnergy(food.per100).ok, updatedAt: new Date().toISOString() })
}

export async function deleteFood(id: string): Promise<void> {
  await db.foods.delete(id)
}

/** Most recently logged foods first. */
export async function recentFoods(limit = 20): Promise<Food[]> {
  const out: Food[] = []
  await db.foods
    .orderBy('lastUsedAt')
    .reverse()
    .until(() => out.length >= limit)
    .each((f) => {
      if (f.lastUsedAt) out.push(f)
    })
  return out
}

/** Foods logged most often in the last `days` days. */
export async function frequentFoods(limit = 20, days = 60, today = localDay()): Promise<Food[]> {
  const from = addDays(today, -days)
  const counts = new Map<string, number>()
  await db.diaryEntries
    .where('date')
    .between(from, today, true, true)
    .each((e) => {
      if (e.foodId) counts.set(e.foodId, (counts.get(e.foodId) ?? 0) + 1)
    })
  const ids = [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id)
  const foods = await db.foods.bulkGet(ids)
  return foods.filter((f): f is Food => !!f)
}

/** Scanned and hand-made foods, by name. */
export async function myFoods(): Promise<Food[]> {
  const rows = await db.foods.where('source').anyOf('off', 'custom').toArray()
  return rows.sort((a, b) => a.name.localeCompare(b.name))
}

export interface ListFood {
  key: string
  name: string
  per100: Nutrients
  synonyms?: string[]
  servings?: Serving[]
}

/**
 * Replaces the imported food list. Ids are derived from each row's key, so importing
 * the same table again keeps the links from recent foods and the diary intact.
 */
export async function importFoodList(rows: readonly ListFood[], listName: string): Promise<number> {
  const now = new Date().toISOString()
  const foods: Food[] = rows.map((r) => ({
    id: `list:${r.key}`,
    name: r.name,
    source: 'list',
    per100: r.per100,
    servings: r.servings ?? [],
    ...(r.synonyms?.length ? { synonyms: r.synonyms } : {}),
    flagged: !checkEnergy(r.per100).ok,
    createdAt: now,
    updatedAt: now,
  }))
  await db.transaction('rw', db.foods, db.settings, async () => {
    const keep = new Set(foods.map((f) => f.id))
    const old = await db.foods.where('source').equals('list').toArray()
    const usage = new Map(old.map((f) => [f.id, f]))
    await db.foods.bulkDelete(old.filter((f) => !keep.has(f.id)).map((f) => f.id))
    // carry over per-food memory (recent use, last portion) for foods that stay
    await db.foods.bulkPut(
      foods.map((f) => {
        const prev = usage.get(f.id)
        return prev ? { ...f, createdAt: prev.createdAt, lastUsedAt: prev.lastUsedAt, lastPortionG: prev.lastPortionG } : f
      }),
    )
    await setSetting('foodList', { name: listName, count: foods.length, importedAt: now })
  })
  return foods.length
}

export async function removeFoodList(): Promise<void> {
  await db.transaction('rw', db.foods, db.settings, async () => {
    await db.foods.where('source').equals('list').delete()
    await setSetting('foodList', null)
  })
}
