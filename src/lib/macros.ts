import type { Nutrients } from '../db'

export const EMPTY_NUTRIENTS: Nutrients = { kcal: 0, protein: 0, carbs: 0, fat: 0 }

const OPTIONAL = ['fibre', 'sugar', 'satFat', 'salt'] as const

/** Values for a portion of `grams`, from values per 100 g. */
export function scaleNutrients(per100: Nutrients, grams: number): Nutrients {
  const f = grams / 100
  const out: Nutrients = {
    kcal: per100.kcal * f,
    protein: per100.protein * f,
    carbs: per100.carbs * f,
    fat: per100.fat * f,
  }
  for (const k of OPTIONAL) {
    const v = per100[k]
    if (v != null) out[k] = v * f
  }
  return out
}

export function addNutrients(a: Nutrients, b: Nutrients): Nutrients {
  const out: Nutrients = {
    kcal: a.kcal + b.kcal,
    protein: a.protein + b.protein,
    carbs: a.carbs + b.carbs,
    fat: a.fat + b.fat,
  }
  for (const k of OPTIONAL) {
    if (a[k] != null || b[k] != null) out[k] = (a[k] ?? 0) + (b[k] ?? 0)
  }
  return out
}

export function sumNutrients(list: readonly Nutrients[]): Nutrients {
  return list.reduce(addNutrients, EMPTY_NUTRIENTS)
}

/** Rounds for storage: kcal to whole numbers, grams to one decimal. */
export function roundNutrients(n: Nutrients): Nutrients {
  const r1 = (x: number) => Math.round(x * 10) / 10
  const out: Nutrients = { kcal: Math.round(n.kcal), protein: r1(n.protein), carbs: r1(n.carbs), fat: r1(n.fat) }
  for (const k of OPTIONAL) {
    const v = n[k]
    if (v != null) out[k] = k === 'salt' ? Math.round(v * 100) / 100 : r1(v)
  }
  return out
}

/** Calories implied by the macros: 4 × protein + 4 × carbohydrate + 9 × fat. */
export function atwaterKcal(n: Pick<Nutrients, 'protein' | 'carbs' | 'fat'>): number {
  return 4 * n.protein + 4 * n.carbs + 9 * n.fat
}

export interface EnergyCheck {
  ok: boolean
  computedKcal: number
  diffKcal: number
}

/**
 * Flags values whose stated calories are far from 4P + 4C + 9F.
 * Labels count fibre (2 kcal/g), alcohol and polyols too, so small gaps are normal:
 * a value is flagged only when it is off by more than 20% and more than 15 kcal.
 */
export function checkEnergy(per100: Nutrients): EnergyCheck {
  const computedKcal = atwaterKcal(per100)
  const diffKcal = per100.kcal - computedKcal
  const base = Math.max(per100.kcal, computedKcal, 1)
  const ok = Math.abs(diffKcal) <= 15 || Math.abs(diffKcal) / base <= 0.2
  return { ok, computedKcal, diffKcal }
}
