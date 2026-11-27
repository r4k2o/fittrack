import { describe, expect, it } from 'vitest'
import library from '../data/exercises.json'
import { homeReplacement, homeVersion, isHomeExercise } from './home'
import type { PlannerExercise } from './planner'
import { primaryGroups } from './volume'

const EX = library.exercises.map((x) => ({ ...x, jointStress: x.joints })) as unknown as PlannerExercise[]
const by = new Map(EX.map((e) => [e.id, e]))
const row = (exerciseId: string, repMin = 8, repMax = 12) => ({ exerciseId, sets: 3, repMin, repMax, targetRir: 2, restSec: 150 })

describe('home workouts', () => {
  it('swaps gym lifts for bodyweight ones of the same movement and muscle', () => {
    const bench = homeReplacement(by.get('fedb:Barbell_Bench_Press_-_Medium_Grip')!, EX)!
    expect(bench.id).toBe('fedb:Pushups')
    const pulldown = homeReplacement(by.get('fedb:Wide-Grip_Lat_Pulldown')!, EX)!
    expect(pulldown.pattern).toBe('vpull')
    expect(isHomeExercise(pulldown)).toBe(true)
    const legPress = homeReplacement(by.get('fedb:Leg_Press')!, EX)!
    expect(primaryGroups(legPress)).toContain('quads')
    expect(isHomeExercise(legPress)).toBe(true)
  })

  it('converts a whole session without repeating an exercise, and raises the reps', () => {
    const s = homeVersion(
      [row('fedb:Barbell_Bench_Press_-_Medium_Grip', 6, 10), row('fedb:Incline_Dumbbell_Press'), row('fedb:Seated_Cable_Rows'), row('fedb:Triceps_Pushdown', 10, 15), row('fedb:Pushups')],
      EX,
    )
    const ids = s.rows.map((r) => r.exerciseId)
    expect(new Set(ids).size).toBe(ids.length)
    expect(s.rows.every((r) => isHomeExercise(by.get(r.exerciseId)!))).toBe(true)
    expect(s.rows[0]).toMatchObject({ sets: 3, repMin: 8, repMax: 15, from: 'fedb:Barbell_Bench_Press_-_Medium_Grip' })
    const triceps = s.rows.find((r) => r.from === 'fedb:Triceps_Pushdown')!
    expect([triceps.repMin, triceps.repMax]).toEqual([12, 20])
    expect(s.dropped).toEqual([])
  })

  it('respects flagged joints', () => {
    const r = homeReplacement(by.get('fedb:Barbell_Bench_Press_-_Medium_Grip')!, EX, { injuries: ['wrist'], experience: 'intermediate' })!
    expect(r.jointStress).not.toContain('wrist')
  })
})
