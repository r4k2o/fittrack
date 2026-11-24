import { describe, expect, it } from 'vitest'
import { calculateTargets, katchMcArdle, mifflinStJeor, type TargetInputs } from './nutrition'

const man: TargetInputs = {
  sex: 'male',
  ageYears: 25,
  heightCm: 180,
  weightKg: 80,
  bodyFatPct: null,
  useLeanMass: false,
  activityFactor: 1.55,
  goal: 'bulk',
}

describe('nutrition targets', () => {
  it('reproduces the worked example for a lean bulk', () => {
    const r = calculateTargets(man)
    expect(r.restingKcal).toBe(1805)
    expect(r.maintenanceKcal).toBe(2798)
    expect(r.kcal).toBe(3080)
    expect([r.proteinG, r.fatG, r.carbsG]).toEqual([160, 72, 448])
    expect(r.warnings).toEqual([])
  })

  it('reproduces the worked example for a cut', () => {
    const r = calculateTargets({ ...man, goal: 'cut' })
    expect(r.kcal).toBe(2240)
    expect([r.proteinG, r.fatG, r.carbsG]).toEqual([176, 56, 258])
  })

  it('uses −161 for women and Katch-McArdle when asked and a body-fat reading exists', () => {
    expect(mifflinStJeor('female', 60, 165, 30)).toBeCloseTo(10 * 60 + 6.25 * 165 - 150 - 161)
    expect(katchMcArdle(80, 15)).toBeCloseTo(370 + 21.6 * 68)
    const r = calculateTargets({ ...man, bodyFatPct: 15, useLeanMass: true })
    expect(r.method).toBe('katch')
    expect(r.restingKcal).toBe(Math.round(370 + 21.6 * 68))
    // without a reading the switch is ignored
    expect(calculateTargets({ ...man, useLeanMass: true }).method).toBe('mifflin')
  })

  it('keeps values set by hand and marks them', () => {
    const r = calculateTargets({ ...man, proteinPerKg: 2.4, kcalOverride: 3000 })
    expect(r.proteinG).toBe(192)
    expect(r.kcal).toBe(3000)
    expect(r.setByYou).toEqual({ goalAdjustPct: false, proteinPerKg: true, fatPerKg: false, kcal: true })
    expect(r.carbsG).toBe(Math.round((3000 - 4 * 192 - 9 * 72) / 4))
  })

  it('never sets fat below 0.5 g/kg', () => {
    expect(calculateTargets({ ...man, fatPerKg: 0.3 }).fatG).toBe(40)
  })

  it('offers no deficit under 18', () => {
    const r = calculateTargets({ ...man, ageYears: 17, goal: 'cut' })
    expect(r.goalAdjustPct).toBe(0)
    expect(r.kcal).toBe(2860) // resting 1845 × 1.55 = 2859.75: maintenance, rounded to 10
    expect(r.warnings.map((w) => w.code)).toContain('minorNoDeficit')
  })

  it('warns below the resting estimate and below 3 g/kg of carbohydrate', () => {
    const r = calculateTargets({ ...man, goal: 'cut', kcalOverride: 1700 })
    expect(r.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(['belowResting', 'lowCarbs']))
  })

  it('does not return negative carbohydrate', () => {
    const r = calculateTargets({ ...man, kcalOverride: 900 })
    expect(r.carbsG).toBe(0)
    expect(r.warnings.map((w) => w.code)).toContain('macrosExceedKcal')
  })
})
