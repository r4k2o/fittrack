import { describe, expect, it } from 'vitest'
import { atwaterKcal, checkEnergy, roundNutrients, scaleNutrients, sumNutrients } from './macros'

describe('macros', () => {
  it('scales values per 100 g to a portion', () => {
    const p = scaleNutrients({ kcal: 389, protein: 13.5, carbs: 58.7, fat: 7, fibre: 10 }, 60)
    expect(roundNutrients(p)).toEqual({ kcal: 233, protein: 8.1, carbs: 35.2, fat: 4.2, fibre: 6 })
  })

  it('sums entries and keeps optional values only when present', () => {
    const total = sumNutrients([
      { kcal: 100, protein: 10, carbs: 5, fat: 4 },
      { kcal: 50, protein: 1, carbs: 10, fat: 0, salt: 0.2 },
    ])
    expect(total).toEqual({ kcal: 150, protein: 11, carbs: 15, fat: 4, salt: 0.2 })
  })

  it('accepts label values close to 4P + 4C + 9F and flags those far off', () => {
    expect(atwaterKcal({ protein: 10, carbs: 10, fat: 10 })).toBe(170)
    // a hazelnut spread: stated 539, computed 533.3
    expect(checkEnergy({ kcal: 539, protein: 6.3, carbs: 57.5, fat: 30.9 }).ok).toBe(true)
    // kJ typed into the kcal field
    expect(checkEnergy({ kcal: 2252, protein: 6.3, carbs: 57.5, fat: 30.9 }).ok).toBe(false)
    // tiny absolute gaps never flag, even when large in relative terms
    expect(checkEnergy({ kcal: 2, protein: 0, carbs: 0, fat: 0 }).ok).toBe(true)
  })
})
