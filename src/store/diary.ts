import { db, newRow, type DiaryEntry, type DiarySource, type Food, type Meal, type Nutrients } from '../db'
import { addDays } from '../lib/dates'
import { roundNutrients, scaleNutrients } from '../lib/macros'
import { recipeIdOf } from '../lib/recipes'

export const MEALS: readonly Meal[] = ['breakfast', 'lunch', 'dinner', 'snacks']

export const MEAL_LABEL: Record<Meal, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snacks: 'Snacks',
}

/** The meal slot that fits the time of day. */
export function mealForNow(d: Date = new Date()): Meal {
  const h = d.getHours()
  if (h < 10) return 'breakfast'
  if (h < 15) return 'lunch'
  if (h < 21) return 'dinner'
  return 'snacks'
}

export interface PortionChoice {
  grams: number
  servingName?: string | null
  servingCount?: number | null
}

/**
 * Logs a food portion with its own macro snapshot and remembers the portion on the food.
 * A recipe comes in as a food with a `recipe:` id and is logged with its recipe id.
 */
export async function logFood(food: Food, portion: PortionChoice, meal: Meal, date: string, source: DiarySource): Promise<DiaryEntry> {
  const recipeId = recipeIdOf(food.id)
  const entry = newRow<DiaryEntry>({
    date,
    meal,
    foodId: recipeId ? null : food.id,
    ...(recipeId ? { recipeId } : {}),
    name: food.name,
    ...(food.brand ? { brand: food.brand } : {}),
    grams: portion.grams,
    servingName: portion.servingName ?? null,
    servingCount: portion.servingCount ?? null,
    macros: roundNutrients(scaleNutrients(food.per100, portion.grams)),
    source: recipeId ? 'recipe' : source,
  })
  const now = new Date().toISOString()
  await db.transaction('rw', db.diaryEntries, db.foods, db.recipes, async () => {
    await db.diaryEntries.add(entry)
    if (recipeId) await db.recipes.update(recipeId, { lastUsedAt: now, lastPortionG: portion.grams })
    else await db.foods.update(food.id, { lastUsedAt: now, lastPortionG: portion.grams })
  })
  return entry
}

export interface QuickAdd {
  name?: string
  kcal: number
  protein?: number
  carbs?: number
  fat?: number
}

/** Calories and macros without a food. */
export async function logQuickAdd(q: QuickAdd, meal: Meal, date: string): Promise<DiaryEntry> {
  const entry = newRow<DiaryEntry>({
    date,
    meal,
    foodId: null,
    name: q.name?.trim() || 'Quick add',
    grams: null,
    macros: roundNutrients({ kcal: q.kcal, protein: q.protein ?? 0, carbs: q.carbs ?? 0, fat: q.fat ?? 0 }),
    source: 'quick',
  })
  await db.diaryEntries.add(entry)
  return entry
}

/** Re-portions an entry from its food's current values. */
export async function updatePortion(entry: DiaryEntry, food: Food, portion: PortionChoice, meal: Meal = entry.meal): Promise<void> {
  const recipeId = recipeIdOf(food.id)
  await db.transaction('rw', db.diaryEntries, db.foods, db.recipes, async () => {
    await db.diaryEntries.put({
      ...entry,
      meal,
      grams: portion.grams,
      servingName: portion.servingName ?? null,
      servingCount: portion.servingCount ?? null,
      macros: roundNutrients(scaleNutrients(food.per100, portion.grams)),
      updatedAt: new Date().toISOString(),
    })
    if (recipeId) await db.recipes.update(recipeId, { lastPortionG: portion.grams })
    else await db.foods.update(food.id, { lastPortionG: portion.grams })
  })
}

export async function updateQuickAdd(entry: DiaryEntry, q: QuickAdd, meal: Meal = entry.meal): Promise<void> {
  await db.diaryEntries.put({
    ...entry,
    meal,
    name: q.name?.trim() || 'Quick add',
    macros: roundNutrients({ kcal: q.kcal, protein: q.protein ?? 0, carbs: q.carbs ?? 0, fat: q.fat ?? 0 }),
    updatedAt: new Date().toISOString(),
  })
}

/** Deletes entries and returns them so an Undo can put them back unchanged. */
export async function deleteEntries(ids: readonly string[]): Promise<DiaryEntry[]> {
  return db.transaction('rw', db.diaryEntries, async () => {
    const rows = (await db.diaryEntries.bulkGet([...ids])).filter((r): r is DiaryEntry => !!r)
    await db.diaryEntries.bulkDelete([...ids])
    return rows
  })
}

export async function restoreEntries(rows: readonly DiaryEntry[]): Promise<void> {
  await db.diaryEntries.bulkPut([...rows])
}

/** Copies entries to another day (and optionally another meal) as new rows. */
export async function copyEntries(entries: readonly DiaryEntry[], toDate: string, toMeal?: Meal): Promise<DiaryEntry[]> {
  const copies = entries.map((e) =>
    newRow<DiaryEntry>({
      date: toDate,
      meal: toMeal ?? e.meal,
      foodId: e.foodId ?? null,
      recipeId: e.recipeId ?? null,
      name: e.name,
      ...(e.brand ? { brand: e.brand } : {}),
      grams: e.grams ?? null,
      servingName: e.servingName ?? null,
      servingCount: e.servingCount ?? null,
      macros: { ...e.macros },
      source: 'copy',
    }),
  )
  await db.diaryEntries.bulkAdd(copies)
  return copies
}

export async function dayEntries(date: string): Promise<DiaryEntry[]> {
  const rows = await db.diaryEntries.where('date').equals(date).toArray()
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function mealEntries(date: string, meal: Meal): Promise<DiaryEntry[]> {
  const rows = await db.diaryEntries.where('[date+meal]').equals([date, meal]).toArray()
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export interface RecentMeal {
  date: string
  meal: Meal
  entries: DiaryEntry[]
  kcal: number
}

/**
 * The same meal on earlier days, newest first, skipping empty days and duplicates
 * (same foods and grams), for "add yesterday's lunch" in one tap.
 */
export async function recentMeals(meal: Meal, beforeDate: string, lookbackDays = 14, limit = 3): Promise<RecentMeal[]> {
  const from = addDays(beforeDate, -lookbackDays)
  const rows = await db.diaryEntries
    .where('[date+meal]')
    .between([from, meal], [beforeDate, meal], true, false)
    .filter((e) => e.meal === meal)
    .toArray()
  const byDate = new Map<string, DiaryEntry[]>()
  for (const r of rows) {
    const list = byDate.get(r.date) ?? []
    list.push(r)
    byDate.set(r.date, list)
  }
  const seen = new Set<string>()
  const out: RecentMeal[] = []
  for (const date of [...byDate.keys()].sort().reverse()) {
    const entries = (byDate.get(date) ?? []).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    const key = entries
      .map((e) => `${e.foodId ?? e.name}:${e.grams ?? e.macros.kcal}`)
      .sort()
      .join('|')
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ date, meal, entries, kcal: entries.reduce((s, e) => s + e.macros.kcal, 0) })
    if (out.length >= limit) break
  }
  return out
}

/** Sum of logged calories per day, for adherence and the expenditure estimate. */
export async function intakeByDay(from: string, to: string): Promise<Map<string, number>> {
  const rows = await db.diaryEntries.where('date').between(from, to, true, true).toArray()
  const map = new Map<string, number>()
  for (const r of rows) map.set(r.date, (map.get(r.date) ?? 0) + r.macros.kcal)
  return map
}

export function macrosOf(entries: readonly DiaryEntry[]): Nutrients[] {
  return entries.map((e) => e.macros)
}

/** A food rebuilt from an entry's own snapshot, for entries whose food was deleted. */
export function foodFromEntry(entry: DiaryEntry): Food | null {
  if (!entry.grams) return null
  const f = 100 / entry.grams
  const m = entry.macros
  return {
    id: entry.foodId ?? `entry:${entry.id}`,
    name: entry.name,
    brand: entry.brand,
    source: 'custom',
    per100: { kcal: m.kcal * f, protein: m.protein * f, carbs: m.carbs * f, fat: m.fat * f },
    servings: [],
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  }
}
