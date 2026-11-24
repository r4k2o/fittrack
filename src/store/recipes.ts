// Recipes and saved meals. A recipe is logged through the same portion screen as a
// food (as a food with a `recipe:` id); a saved meal logs its items with the macro
// snapshots they had when it was saved.

import { db, newRow, type DiaryEntry, type Food, type Meal, type MealTemplate, type Recipe } from '../db'
import { recipeAsFood } from '../lib/recipes'

export interface RecipeDraft {
  id?: string
  name: string
  servings: number
  cookedWeightG: number | null
  ingredients: { foodId: string; grams: number }[]
}

export async function listRecipes(): Promise<Recipe[]> {
  const rows = await db.recipes.toArray()
  return rows.sort((a, b) => (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? '') || a.name.localeCompare(b.name))
}

export async function saveRecipe(draft: RecipeDraft): Promise<Recipe> {
  const fields = {
    name: draft.name.trim(),
    servings: Math.max(1, Math.round(draft.servings)),
    cookedWeightG: draft.cookedWeightG && draft.cookedWeightG > 0 ? draft.cookedWeightG : null,
    ingredients: draft.ingredients.filter((i) => i.grams > 0),
  }
  if (draft.id) {
    const prev = await db.recipes.get(draft.id)
    if (prev) {
      const row: Recipe = { ...prev, ...fields, updatedAt: new Date().toISOString() }
      await db.recipes.put(row)
      return row
    }
  }
  const row = newRow<Recipe>(fields)
  await db.recipes.add(row)
  return row
}

export async function deleteRecipe(id: string): Promise<Recipe | null> {
  const row = await db.recipes.get(id)
  if (row) await db.recipes.delete(id)
  return row ?? null
}

export async function restoreRecipe(row: Recipe): Promise<void> {
  await db.recipes.put(row)
}

export async function ingredientFoods(recipes: readonly Pick<Recipe, 'ingredients'>[]): Promise<Map<string, Food>> {
  const ids = [...new Set(recipes.flatMap((r) => r.ingredients.map((i) => i.foodId)))]
  const rows = await db.foods.bulkGet(ids)
  return new Map(rows.filter((f): f is Food => !!f).map((f) => [f.id, f]))
}

/** Every recipe as a food for search, lists and the portion screen. */
export async function recipeFoods(): Promise<Food[]> {
  const recipes = await listRecipes()
  const foods = await ingredientFoods(recipes)
  return recipes.map((r) => recipeAsFood(r, foods))
}

export async function recipeFood(recipeId: string): Promise<Food | null> {
  const r = await db.recipes.get(recipeId)
  if (!r) return null
  return recipeAsFood(r, await ingredientFoods([r]))
}

// ---- saved meals ------------------------------------------------------------------------

export async function listMealTemplates(): Promise<MealTemplate[]> {
  const rows = await db.mealTemplates.toArray()
  return rows.sort((a, b) => a.name.localeCompare(b.name))
}

export async function saveMealTemplate(name: string, entries: readonly DiaryEntry[]): Promise<MealTemplate> {
  const row = newRow<MealTemplate>({
    name: name.trim(),
    items: entries.map((e) => ({
      foodId: e.foodId ?? null,
      recipeId: e.recipeId ?? null,
      name: e.name,
      grams: e.grams ?? 0,
      macros: { ...e.macros },
      ...(e.servingName ? { servingName: e.servingName, servingCount: e.servingCount ?? 1 } : {}),
    })),
  })
  await db.mealTemplates.add(row)
  return row
}

export async function deleteMealTemplate(id: string): Promise<MealTemplate | null> {
  const row = await db.mealTemplates.get(id)
  if (row) await db.mealTemplates.delete(id)
  return row ?? null
}

export async function restoreMealTemplate(row: MealTemplate): Promise<void> {
  await db.mealTemplates.put(row)
}

/** Logs every item of a saved meal; returns the new entries so the log can be undone. */
export async function logMealTemplate(t: MealTemplate, meal: Meal, date: string): Promise<DiaryEntry[]> {
  const rows = t.items.map((it) =>
    newRow<DiaryEntry>({
      date,
      meal,
      foodId: it.foodId ?? null,
      recipeId: it.recipeId ?? null,
      name: it.name,
      grams: it.grams > 0 ? it.grams : null,
      servingName: it.servingName ?? null,
      servingCount: it.servingCount ?? null,
      macros: { ...it.macros },
      source: 'copy',
    }),
  )
  await db.diaryEntries.bulkAdd(rows)
  return rows
}
