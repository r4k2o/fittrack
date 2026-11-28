import { describe, expect, it } from 'vitest'
import { consistency, heatGrid, heatLevel, type DayLoad } from './consistency'

const load = (date: string, sets: number, cardioMin = 0): DayLoad => ({ date, sessions: sets > 0 ? 1 : 0, sets, cardioMin, names: [] })
const map = (rows: DayLoad[]) => new Map(rows.map((r) => [r.date, r]))

describe('training consistency', () => {
  it('shades a day by its hard sets, with cardio alone as the lightest step', () => {
    expect(heatLevel(undefined)).toBe(0)
    expect(heatLevel(load('2026-11-02', 0, 30))).toBe(1)
    expect(heatLevel(load('2026-11-02', 9))).toBe(1)
    expect(heatLevel(load('2026-11-02', 10))).toBe(2)
    expect(heatLevel(load('2026-11-02', 16))).toBe(3)
    expect(heatLevel(load('2026-11-02', 30))).toBe(4)
  })

  it('lays out whole weeks from Monday, oldest first, with later days left empty', () => {
    // Friday 27 November 2026
    const g = heatGrid(map([load('2026-11-27', 18), load('2026-11-23', 12)]), '2026-11-27', 16)
    expect(g.weeks).toHaveLength(16)
    const last = g.weeks[15]
    expect(last.monday).toBe('2026-11-23')
    expect(last.days.map((d) => d.level)).toEqual([2, 0, 0, 0, 3, 0, 0])
    expect(last.days[5].future).toBe(true)
    expect(g.weeks[0].monday).toBe('2026-08-10')
    expect(g.months.map((m) => m.label)).toEqual(['Sep', 'Okt', 'Nov'])
  })

  it('counts active weeks since training began, the weekly average and the run of weeks', () => {
    const rows = [
      // three weeks ago: 3 days, two weeks ago: nothing, last week: 4 days, this week: 2 days
      load('2026-11-02', 12),
      load('2026-11-04', 12),
      load('2026-11-06', 12),
      load('2026-11-16', 12),
      load('2026-11-17', 12),
      load('2026-11-19', 12),
      load('2026-11-21', 0, 40),
      load('2026-11-23', 12),
      load('2026-11-25', 12),
    ]
    const c = consistency(map(rows), '2026-11-27', 16)
    expect(c.trainingDays).toBe(9)
    expect(c.weeksCounted).toBe(4)
    expect(c.activeWeeks).toBe(3)
    expect(c.perWeek).toBeCloseTo(7 / 3, 5)
    expect(c.thisWeek).toBe(2)
    expect(c.streakWeeks).toBe(2)
  })

  it('keeps the run going while this week is still empty', () => {
    const c = consistency(map([load('2026-11-16', 12), load('2026-11-10', 12)]), '2026-11-23', 16)
    expect(c.thisWeek).toBe(0)
    expect(c.streakWeeks).toBe(2)
    expect(consistency(new Map(), '2026-11-23').perWeek).toBeNull()
  })
})
