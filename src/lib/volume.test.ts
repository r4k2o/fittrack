import { describe, expect, it } from 'vitest'
import { groupCredits, primaryGroups, sessionMinutes, spacingIssues, volumeOf, weekdayGap, type Group } from './volume'

const bench = { primary: ['chest' as const], secondary: ['shoulders' as const, 'triceps' as const] }
const squat = { primary: ['quads' as const], secondary: ['calves' as const, 'glutes' as const, 'hamstrings' as const, 'lowerBack' as const] }
const row = { primary: ['midBack' as const], secondary: ['biceps' as const, 'lats' as const, 'shoulders' as const] }

describe('weekly volume', () => {
  it('counts 1 for the main muscle and 0.5 for assisting ones', () => {
    expect(groupCredits(bench)).toEqual({ chest: 1, shoulders: 0.5, triceps: 0.5 })
  })

  it('gives calves and lower back no credit from a squat', () => {
    expect(groupCredits(squat)).toEqual({ quads: 1, glutes: 0.5, hamstrings: 0.5 })
  })

  it('counts a group once when two of its muscles are listed', () => {
    expect(groupCredits(row)).toEqual({ back: 1, biceps: 0.5, shoulders: 0.5 })
    expect(primaryGroups(row)).toEqual(['back'])
  })

  it('sums sets across exercises', () => {
    const v = volumeOf([
      { exercise: bench, sets: 3 },
      { exercise: row, sets: 4 },
    ])
    expect(v.chest).toBe(3)
    expect(v.shoulders).toBe(3.5)
    expect(v.back).toBe(4)
  })
})

describe('session time', () => {
  it('plans 3 minutes per compound set, 2 per isolation set and 5 of warm-up', () => {
    expect(sessionMinutes([])).toBe(0)
    expect(sessionMinutes([{ id: 'a', compound: true, sets: 5 }])).toBe(20)
    // 15 compound sets is 50 minutes: "roughly 15 sets in 45 minutes" once a few are isolation.
    expect(sessionMinutes([{ id: 'a', compound: true, sets: 10 }, { id: 'b', compound: false, sets: 5 }])).toBe(45)
  })

  it('saves time with a superset', () => {
    const single = sessionMinutes([
      { id: 'a', compound: false, sets: 3 },
      { id: 'b', compound: false, sets: 3 },
    ])
    const paired = sessionMinutes([
      { id: 'a', compound: false, sets: 3, pairWith: 'b' },
      { id: 'b', compound: false, sets: 3, pairWith: 'a' },
    ])
    expect(single).toBe(17)
    expect(paired).toBe(14)
    // Uneven pairs: 2 rounds together, the third set alone.
    expect(
      sessionMinutes([
        { id: 'a', compound: true, sets: 3, pairWith: 'b' },
        { id: 'b', compound: true, sets: 2, pairWith: 'a' },
      ]),
    ).toBe(5 + 2 * 4 + 3)
  })
})

describe('spacing', () => {
  it('measures days round the week', () => {
    expect(weekdayGap(0, 1)).toBe(1)
    expect(weekdayGap(0, 3)).toBe(3)
    expect(weekdayGap(5, 0)).toBe(2)
    expect(weekdayGap(6, 0)).toBe(1)
  })

  it('flags the same group on neighbouring days only', () => {
    const g = (...x: Group[]) => new Set(x)
    const issues = spacingIssues([
      { weekday: 0, groups: g('chest', 'back') },
      { weekday: 1, groups: g('quads') },
      { weekday: 2, groups: g('chest') },
      { weekday: 3, groups: g('chest', 'quads') },
    ])
    expect(issues).toEqual([{ group: 'chest', days: [2, 3] }])
  })
})
