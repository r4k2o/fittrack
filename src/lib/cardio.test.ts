import { describe, expect, it } from 'vitest'
import { estimateCardioKcal, intensityOf, metFor, paceText, weekMinutes } from './cardio'

describe('cardio', () => {
  it('estimates calories as MET × kg × hours', () => {
    // 30 min moderate rowing at 80 kg: 7.0 × 80 × 0.5 = 280 kcal
    expect(estimateCardioKcal('row', 30, 80, null, 5)).toBe(280)
    // A 10 km run in 60 min is 10 km/h: MET 9.8 + 0.3 × 0.75 = 10.03; × 80 kg × 1 h = 802, rounded to 800
    expect(estimateCardioKcal('run', 60, 80, 10)).toBe(800)
  })

  it('takes the MET from the speed when a distance is known', () => {
    expect(metFor('run', 60, 9.7)).toBeCloseTo(9.8)
    expect(metFor('cycle', 60, 24)).toBeCloseTo(10)
    expect(metFor('walk', 60, 5.6)).toBeCloseTo(4.3)
    expect(metFor('stairs', 20, null, 8)).toBe(11)
  })

  it('maps effort to intensity', () => {
    expect(intensityOf(3)).toBe('light')
    expect(intensityOf(6)).toBe('moderate')
    expect(intensityOf(7)).toBe('vigorous')
    expect(intensityOf(null)).toBe('moderate')
  })

  it('shows pace the way each sport does', () => {
    expect(paceText('run', 50, 10)).toBe('5:00 /km')
    expect(paceText('row', 8, 2)).toBe('2:00 /500 m')
    expect(paceText('swim', 30, 1.5)).toBe('2:00 /100 m')
    expect(paceText('cycle', 60, 25)).toBe('25.0 km/h')
    expect(paceText('run', 30, null)).toBeNull()
  })

  it('totals the week by intensity, with vigorous minutes counted double for WHO', () => {
    const w = weekMinutes([
      { durationMin: 30, rpe: 5 },
      { durationMin: 20, rpe: 8 },
      { durationMin: 40, rpe: 3 },
    ])
    expect(w).toEqual({ light: 40, moderate: 30, vigorous: 20, total: 90, moderateEquivalent: 70 })
  })
})
