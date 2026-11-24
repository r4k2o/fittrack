import { describe, expect, it } from 'vitest'
import type { SetLog } from '../db'
import { addDays, ageOn, isoWeek, weekStart } from './dates'
import { parseDecimal } from './format'
import { defaultRepRange, defaultRestSec, findRecords, nextTarget, sessionStats } from './training'

const set = (exerciseId: string, weightKg: number, reps: number, kind: SetLog['kind'] = 'work'): SetLog => ({
  id: crypto.randomUUID(),
  sessionId: 's',
  exerciseId,
  date: '2026-11-16',
  kind,
  weightKg,
  reps,
  setIndex: 0,
  createdAt: '',
  updatedAt: '',
})

describe('progression', () => {
  it('adds the smallest load step once every work set reaches the top of the range', () => {
    const p = nextTarget(
      [
        { weightKg: 72.5, reps: 10 },
        { weightKg: 72.5, reps: 10 },
        { weightKg: 72.5, reps: 10 },
      ],
      [6, 10],
      2.5,
    )
    expect(p).toEqual({ increased: true, sets: Array(3).fill({ weightKg: 75, reps: 6 }) })
  })

  it('repeats last time when any set fell short', () => {
    const last = [
      { weightKg: 72.5, reps: 8 },
      { weightKg: 72.5, reps: 8 },
      { weightKg: 72.5, reps: 7 },
    ]
    expect(nextTarget(last, [6, 10], 2.5)).toEqual({ increased: false, sets: last })
    expect(nextTarget([], [6, 10], 2.5)).toBeNull()
  })

  it('progresses by reps when there is no load step', () => {
    const last = [{ weightKg: 0, reps: 15 }]
    expect(nextTarget(last, [10, 15], 0)?.increased).toBe(false)
  })

  it('picks rep ranges and rest by exercise type', () => {
    expect(defaultRepRange({ compound: true, equipment: 'barbell', pattern: 'squat' })).toEqual([6, 10])
    expect(defaultRepRange({ compound: true, equipment: 'dumbbell', pattern: 'hpush' })).toEqual([8, 12])
    expect(defaultRepRange({ compound: false, equipment: 'cable', pattern: 'isolation' })).toEqual([10, 15])
    expect(defaultRepRange({ compound: false, equipment: 'bodyweight', pattern: 'isolation', unit: 'seconds' })).toEqual([30, 60])
    expect(defaultRestSec({ compound: true, pattern: 'hinge' })).toBe(150)
    expect(defaultRestSec({ compound: false, pattern: 'isolation' })).toBe(90)
  })

  it('sums volume over work sets and finds new records', () => {
    const today = [set('bench', 40, 10, 'warmup'), set('bench', 75, 6), set('bench', 75, 6), set('row', 60, 10)]
    expect(sessionStats(today)).toEqual({ workSets: 3, volumeKg: 75 * 12 + 600, exercises: 2 })
    // bench 75 × 6 → e1RM 90 beats 88; row 60 × 10 → 80 does not beat 85
    const hits = findRecords(today, new Map([['bench', 88], ['row', 85]]))
    expect(hits.map((h) => h.exerciseId)).toEqual(['bench'])
    expect(hits[0].e1rm).toBeCloseTo(90)
    // equalling the old best is not a record
    expect(findRecords(today, new Map([['bench', 90], ['row', 85]]))).toEqual([])
  })
})

describe('dates and input', () => {
  it('labels ISO weeks across year boundaries', () => {
    expect(isoWeek('2026-11-24')).toBe('2026-W48')
    expect(isoWeek('2026-12-31')).toBe('2026-W53')
    expect(isoWeek('2027-01-01')).toBe('2026-W53')
    expect(isoWeek('2021-01-03')).toBe('2020-W53')
    expect(isoWeek('2024-12-30')).toBe('2025-W01')
  })

  it('moves across months and finds the Monday', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(weekStart('2026-11-29')).toBe('2026-11-23')
    expect(weekStart('2026-11-23')).toBe('2026-11-23')
  })

  it('computes age on a given day', () => {
    expect(ageOn('2001-11-25', '2026-11-24')).toBe(24)
    expect(ageOn('2001-11-24', '2026-11-24')).toBe(25)
  })

  it('reads decimal commas from a German keypad', () => {
    expect(parseDecimal('72,5')).toBe(72.5)
    expect(parseDecimal(' 80.4 ')).toBe(80.4)
    expect(parseDecimal('')).toBeNull()
    expect(parseDecimal('7a')).toBeNull()
  })
})
