import { describe, expect, it } from 'vitest'
import type { SetLog } from '../db'
import { adherenceByWeek, isOnTarget, movingAverage, targetLookup, weeklyBestE1rm, weeklyMeans, weeklySets } from './progress'

describe('progress maths', () => {
  it('averages the last 7 days once 4 of them have a value', () => {
    const pts = ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'].map((date, i) => ({ date, value: 400 + i * 20 }))
    const ma = movingAverage(pts)
    expect(ma).toEqual([{ date: '2026-11-13', value: 430 }])
  })

  it('keeps weekly means with their day counts', () => {
    expect(
      weeklyMeans([
        { date: '2026-11-16', value: 8000 },
        { date: '2026-11-17', value: 10000 },
        { date: '2026-11-24', value: 5000 },
      ]),
    ).toEqual([
      { week: '2026-11-16', mean: 9000, days: 2 },
      { week: '2026-11-23', mean: 5000, days: 1 },
    ])
  })

  it('counts weekly hard sets per group from work sets only', () => {
    const ex = new Map([['bench', { primary: ['chest' as const], secondary: ['triceps' as const, 'shoulders' as const] }]])
    const sets = [
      { exerciseId: 'bench', date: '2026-11-16', kind: 'work' as const },
      { exerciseId: 'bench', date: '2026-11-18', kind: 'work' as const },
      { exerciseId: 'bench', date: '2026-11-18', kind: 'warmup' as SetLog['kind'] },
    ]
    const v = weeklySets(sets, ex).get('2026-11-16')!
    expect(v.chest).toBe(2)
    expect(v.triceps).toBe(1)
  })

  it('takes the best estimated 1RM per week from sets of 10 reps or fewer', () => {
    const w = weeklyBestE1rm([
      { date: '2026-11-16', kind: 'work', weightKg: 100, reps: 5 },
      { date: '2026-11-18', kind: 'work', weightKg: 90, reps: 10 },
      { date: '2026-11-18', kind: 'work', weightKg: 60, reps: 15 },
    ])
    expect(w).toHaveLength(1)
    expect(w[0].value).toBeCloseTo(120, 2) // 90 × (1 + 10/30) beats 100 × (1 + 5/30) = 116.7
  })

  it('judges adherence by calories within 10% and protein at 90%', () => {
    const t = { kcal: 2500, proteinG: 160 }
    expect(isOnTarget({ date: 'x', kcal: 2300, protein: 150 }, t)).toBe(true)
    expect(isOnTarget({ date: 'x', kcal: 2200, protein: 170 }, t)).toBe(false)
    expect(isOnTarget({ date: 'x', kcal: 2500, protein: 140 }, t)).toBe(false)
    const lookup = targetLookup([
      { effectiveFrom: '2026-11-01', kcal: 2500, proteinG: 160 },
      { effectiveFrom: '2026-11-18', kcal: 3000, proteinG: 160 },
    ])
    expect(lookup('2026-11-17')?.kcal).toBe(2500)
    expect(lookup('2026-11-18')?.kcal).toBe(3000)
    expect(lookup('2026-10-31')).toBeNull()
    const weeks = adherenceByWeek(
      [
        { date: '2026-11-16', kcal: 2450, protein: 160 },
        { date: '2026-11-17', kcal: 1800, protein: 160 },
        { date: '2026-11-18', kcal: 2950, protein: 150 },
        { date: '2026-11-19', kcal: 0, protein: 0 },
      ],
      lookup,
    )
    expect(weeks).toEqual([{ week: '2026-11-16', logged: 3, onTarget: 2 }])
  })
})
