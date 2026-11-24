import { describe, expect, it } from 'vitest'
import type { Recipe } from '../db'
import { recipeAsFood, recipeIdOf, recipeTotals } from './recipes'

const foods = new Map([
  ['rice', { per100: { kcal: 350, protein: 7, carbs: 78, fat: 1 } }],
  ['chicken', { per100: { kcal: 110, protein: 23, carbs: 0, fat: 2 } }],
])

describe('recipes', () => {
  it('totals raw ingredients, then spreads them over the cooked weight', () => {
    // 200 g dry rice + 400 g chicken = 1,140 kcal; cooked dish weighs 1,000 g.
    const t = recipeTotals({ servings: 4, cookedWeightG: 1000, ingredients: [{ foodId: 'rice', grams: 200 }, { foodId: 'chicken', grams: 400 }] }, foods)
    expect(t.rawG).toBe(600)
    expect(t.totals.kcal).toBe(1140)
    expect(t.per100.kcal).toBeCloseTo(114)
    expect(t.per100.protein).toBeCloseTo(10.6)
    expect(t.perServing.kcal).toBeCloseTo(285)
    expect(t.servingG).toBe(250)
  })

  it('uses the raw weight when no cooked weight is given and counts missing foods', () => {
    const t = recipeTotals({ servings: 2, cookedWeightG: null, ingredients: [{ foodId: 'chicken', grams: 400 }, { foodId: 'gone', grams: 50 }] }, foods)
    expect(t.dishG).toBe(400)
    expect(t.per100.kcal).toBeCloseTo(110)
    expect(t.missing).toBe(1)
  })

  it('becomes a food with one serving for the portion screen', () => {
    const r = { id: 'r1', name: 'Rice bowl', servings: 4, cookedWeightG: 1000, ingredients: [{ foodId: 'rice', grams: 200 }, { foodId: 'chicken', grams: 400 }], createdAt: 'x', updatedAt: 'x' } as Recipe
    const f = recipeAsFood(r, foods)
    expect(f.id).toBe('recipe:r1')
    expect(f.servings).toEqual([{ name: 'serving', grams: 250 }])
    expect(recipeIdOf(f.id)).toBe('r1')
    expect(recipeIdOf('list:abc')).toBeNull()
  })
})
