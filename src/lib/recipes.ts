// Recipes: ingredients are foods with raw weights, and the recipe totals them. The
// cooked weight, weighed after cooking, gives per-100 g values for the finished dish,
// which accounts for water lost or absorbed; servings divide the total.

import type { Food, Nutrients, Recipe } from '../db'
import { EMPTY_NUTRIENTS, addNutrients, scaleNutrients } from './macros'

export const RECIPE_PREFIX = 'recipe:'

export interface RecipeTotals {
  /** Sum of the raw ingredient weights. */
  rawG: number
  /** The finished dish's weight: the cooked weight when given, else the raw weight. */
  dishG: number
  totals: Nutrients
  per100: Nutrients
  perServing: Nutrients
  servingG: number
  /** Ingredients whose food no longer exists (left out of the totals). */
  missing: number
}

export function recipeTotals(recipe: Pick<Recipe, 'servings' | 'cookedWeightG' | 'ingredients'>, foods: ReadonlyMap<string, Pick<Food, 'per100'>>): RecipeTotals {
  let totals: Nutrients = { ...EMPTY_NUTRIENTS }
  let rawG = 0
  let missing = 0
  for (const ing of recipe.ingredients) {
    const food = foods.get(ing.foodId)
    if (!food) {
      missing++
      continue
    }
    rawG += ing.grams
    totals = addNutrients(totals, scaleNutrients(food.per100, ing.grams))
  }
  const dishG = recipe.cookedWeightG && recipe.cookedWeightG > 0 ? recipe.cookedWeightG : rawG
  const servings = Math.max(1, recipe.servings || 1)
  return {
    rawG,
    dishG,
    totals,
    per100: dishG > 0 ? scaleNutrients(totals, (100 * 100) / dishG) : { ...EMPTY_NUTRIENTS },
    perServing: scaleNutrients(totals, 100 / servings),
    servingG: dishG / servings,
    missing,
  }
}

/** A recipe as a food for the portion screen: per-100 g of the dish and one serving. */
export function recipeAsFood(recipe: Recipe, foods: ReadonlyMap<string, Pick<Food, 'per100'>>): Food {
  const t = recipeTotals(recipe, foods)
  return {
    id: `${RECIPE_PREFIX}${recipe.id}`,
    name: recipe.name,
    source: 'custom',
    per100: t.per100,
    servings: t.servingG > 0 ? [{ name: 'serving', grams: Math.round(t.servingG) }] : [],
    ...(recipe.lastUsedAt ? { lastUsedAt: recipe.lastUsedAt } : {}),
    ...(recipe.lastPortionG ? { lastPortionG: recipe.lastPortionG } : {}),
    createdAt: recipe.createdAt,
    updatedAt: recipe.updatedAt,
  }
}

export function recipeIdOf(foodId: string): string | null {
  return foodId.startsWith(RECIPE_PREFIX) ? foodId.slice(RECIPE_PREFIX.length) : null
}
