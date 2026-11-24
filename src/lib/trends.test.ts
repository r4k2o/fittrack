import { describe, expect, it } from 'vitest'
import { addDays } from './dates'
import { e1rm, ema, estimateExpenditure, ratePctPerWeek, valueOn, weeklyAverages } from './trends'

describe('trend maths', () => {
  it('moves the trend 10% of the way toward each reading', () => {
    const t = ema([
      { date: '2026-11-02', value: 80 },
      { date: '2026-11-01', value: 81 },
      { date: '2026-11-03', value: 82 },
    ])
    expect(t.map((p) => p.date)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03'])
    expect(t[0].value).toBe(81)
    expect(t[1].value).toBeCloseTo(80.9)
    expect(t[2].value).toBeCloseTo(81.01) // 80.9 + 0.1 × (82 − 80.9)
    expect(valueOn(t, '2026-11-05')).toBeCloseTo(t[2].value)
    expect(valueOn(t, '2026-10-30')).toBeNull()
  })

  it('shows a weekly average only with at least 4 of 7 days', () => {
    const days = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-23', '2026-11-24']
    const w = weeklyAverages(days.map((date, i) => ({ date, value: 80 + i })))
    expect(w).toEqual([
      { week: '2026-11-16', days: 4, avg: 81.5 },
      { week: '2026-11-23', days: 2, avg: null },
    ])
  })

  it('expresses the rate of change per week as a share of body weight', () => {
    const trend = Array.from({ length: 15 }, (_, i) => ({ date: addDays('2026-11-01', i), value: 80 + 0.04 * i }))
    // 0.56 kg over 14 days on 80 kg: 0.35% a week
    expect(ratePctPerWeek(trend, '2026-11-15')).toBeCloseTo(0.35)
    expect(ratePctPerWeek(trend, '2026-11-10')).toBeNull()
  })

  it('estimates 1RM from sets of 10 reps or fewer', () => {
    expect(e1rm(100, 5)).toBeCloseTo(116.667, 2)
    expect(e1rm(72.5, 8)).toBeCloseTo(91.83, 2)
    expect(e1rm(60, 11)).toBeNull()
    expect(e1rm(0, 5)).toBeNull()
  })

  it('reproduces the expenditure example: 2,900 kcal a day and +0.4 kg in 14 days', () => {
    const end = '2026-11-28'
    const intake = new Map(Array.from({ length: 14 }, (_, i) => [addDays(end, -i), 2900]))
    const trend = [
      { date: addDays(end, -14), value: 80 },
      { date: end, value: 80.4 },
    ]
    const r = estimateExpenditure(intake, trend, end)
    expect(r?.kcal).toBeCloseTo(2680)
    expect(r?.loggedDays).toBe(14)
  })

  it('needs 80% of days logged before estimating expenditure', () => {
    const end = '2026-11-28'
    const intake = new Map(Array.from({ length: 10 }, (_, i) => [addDays(end, -i), 2900]))
    const trend = [
      { date: addDays(end, -14), value: 80 },
      { date: end, value: 80.4 },
    ]
    expect(estimateExpenditure(intake, trend, end)).toBeNull()
  })
})
