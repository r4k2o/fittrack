import { describe, expect, it } from 'vitest'
import library from '../data/exercises.json'
import type { Equipment, Experience, Joint, Muscle, Pattern } from '../db'
import {
  DAYS_OPTIONS,
  DEFAULT_WEEKDAYS,
  EQUIPMENT_CHOICES,
  generatePlan,
  JOINTS,
  MINUTES_OPTIONS,
  normalizeAnswers,
  splitFor,
  type Region,
  weeklyTargets,
  type EquipmentChoice,
  type GeneratedPlan,
  type PlanAnswers,
  type PlanGoal,
  type PlannerExercise,
} from './planner'
import { GROUPS, primaryGroups, sessionMinutes, spacingIssues, countsAsCompound, VOLUME_CEILING, type Group } from './volume'

const EXERCISES: PlannerExercise[] = library.exercises.map((x) => ({
  id: x.id,
  name: x.name,
  primary: x.primary as Muscle[],
  secondary: x.secondary as Muscle[],
  equipment: x.equipment as Equipment,
  pattern: x.pattern as Pattern,
  jointStress: x.joints as Joint[],
  compound: x.compound,
  ...('unit' in x && x.unit ? { unit: x.unit as 'reps' | 'seconds' } : {}),
  level: x.level,
}))
const BY_ID = new Map(EXERCISES.map((e) => [e.id, e]))

const EXPERIENCES: Experience[] = ['beginner', 'intermediate', 'advanced']
const EQUIPMENT: EquipmentChoice[] = ['full', 'barbell', 'dumbbell', 'machines', 'bodyweight']
const GOALS: PlanGoal[] = ['muscle', 'strength', 'cut']
const INJURIES: Joint[][] = [[], ...JOINTS.map((j) => [j])]

/** Every rule a generated plan must keep; returns what it broke. */
function check(plan: GeneratedPlan, a: PlanAnswers): string[] {
  const problems: string[] = []
  const allowed = new Set(EQUIPMENT_CHOICES[a.equipment].allowed)
  const label = `${a.daysPerWeek}d ${a.minutes}m ${a.experience} ${a.equipment} ${a.goal} [${a.injuries.join(',')}] [${a.priority.join(',')}]`
  const expectedDays = splitFor(normalizeAnswers(a)).days.length
  if (plan.days.length !== expectedDays) problems.push(`${label}: ${plan.days.length} days`)
  const out = new Set((a.exclude ?? []).flatMap((r) => ({ legs: ['quads', 'hamstrings', 'glutes', 'calves'], chest: ['chest'], back: ['back'], shoulders: ['shoulders'], arms: ['biceps', 'triceps'], abs: ['abs'] })[r]))
  for (const day of plan.days) {
    const timed = day.exercises.map((x) => ({ id: x.key, compound: countsAsCompound(BY_ID.get(x.exerciseId)!), sets: x.sets, pairWith: x.pairWith }))
    const minutes = sessionMinutes(timed)
    if (minutes > a.minutes) problems.push(`${label}: ${day.name} takes ${minutes} min`)
    if (minutes !== day.minutes) problems.push(`${label}: ${day.name} reports ${day.minutes} min, is ${minutes}`)
    if (day.exercises.length === 0) problems.push(`${label}: ${day.name} is empty`)
    const seen = new Set<string>()
    for (const x of day.exercises) {
      const e = BY_ID.get(x.exerciseId)
      if (!e) {
        problems.push(`${label}: unknown exercise ${x.exerciseId}`)
        continue
      }
      if (seen.has(e.id)) problems.push(`${label}: ${e.name} twice on ${day.name}`)
      for (const g of primaryGroups(e)) if (out.has(g)) problems.push(`${label}: ${e.name} trains ${g}, which is left out`)
      seen.add(e.id)
      if (!allowed.has(e.equipment)) problems.push(`${label}: ${e.name} needs ${e.equipment}`)
      for (const j of e.jointStress) if (a.injuries.includes(j)) problems.push(`${label}: ${e.name} loads the ${j}`)
      if (a.experience === 'beginner' && e.level === 'expert') problems.push(`${label}: ${e.name} is an expert lift`)
      if (x.sets < 1 || x.sets > 4) problems.push(`${label}: ${e.name} has ${x.sets} sets`)
      if (x.repMin > x.repMax) problems.push(`${label}: ${e.name} rep range ${x.repMin}-${x.repMax}`)
      if (x.pairWith) {
        const partner = day.exercises.find((o) => o.key === x.pairWith)
        if (!partner || partner.pairWith !== x.key) problems.push(`${label}: broken superset on ${day.name}`)
        const i = day.exercises.indexOf(x)
        const j = partner ? day.exercises.indexOf(partner) : -1
        if (Math.abs(i - j) !== 1) problems.push(`${label}: superset partners apart on ${day.name}`)
      }
    }
  }
  for (const g of GROUPS) {
    if (plan.volume[g] > VOLUME_CEILING) problems.push(`${label}: ${g} at ${plan.volume[g]} sets`)
    if (plan.volume[g] < plan.targets[g] && !plan.notes.some((n) => n.kind === 'shortfall' && n.group === g))
      problems.push(`${label}: ${g} short (${plan.volume[g]}/${plan.targets[g]}) without a note`)
  }
  const spacing = spacingIssues(
    plan.days.map((d) => ({
      weekday: d.weekday,
      groups: new Set(d.exercises.flatMap((x) => primaryGroups(BY_ID.get(x.exerciseId)!))),
    })),
  )
  for (const s of spacing) problems.push(`${label}: ${s.group} on ${plan.days[s.days[0]].name} and ${plan.days[s.days[1]].name} under 48 h apart`)
  if (a.injuries.length && !plan.notes.some((n) => n.kind === 'injury')) problems.push(`${label}: no injury note`)
  return problems
}

function answers(p: Partial<PlanAnswers> = {}): PlanAnswers {
  return { daysPerWeek: 4, minutes: 60, experience: 'intermediate', equipment: 'full', injuries: [], goal: 'muscle', priority: [], ...p }
}

describe('plan generator (gate 2)', () => {
  it('keeps every rule for every combination of answers', () => {
    const problems: string[] = []
    let plans = 0
    for (const daysPerWeek of DAYS_OPTIONS)
      for (const minutes of MINUTES_OPTIONS)
        for (const experience of EXPERIENCES)
          for (const equipment of EQUIPMENT)
            for (const goal of GOALS)
              for (const injuries of INJURIES) {
                const a = answers({ daysPerWeek, minutes, experience, equipment, goal, injuries })
                problems.push(...check(generatePlan(a, EXERCISES), a))
                plans++
              }
    expect(plans).toBe(5 * 5 * 3 * 5 * 3 * 7)
    expect(problems.slice(0, 15)).toEqual([])
  }, 60_000) // thousands of plans: allow for slow CI machines

  it('keeps every rule with one or two priority muscles', () => {
    const problems: string[] = []
    const pairs: Group[][] = [...GROUPS.map((g) => [g]), ['chest', 'back'], ['biceps', 'triceps'], ['glutes', 'hamstrings'], ['shoulders', 'calves']]
    for (const daysPerWeek of DAYS_OPTIONS)
      for (const minutes of [30, 60, 90])
        for (const equipment of EQUIPMENT)
          for (const experience of EXPERIENCES)
            for (const priority of pairs) {
              const a = answers({ daysPerWeek, minutes, experience, equipment, priority })
              problems.push(...check(generatePlan(a, EXERCISES), a))
            }
    expect(problems.slice(0, 15)).toEqual([])
  }, 60_000)

  it('reaches the weekly target for every group on 4 × 60 minutes in a full gym', () => {
    const plan = generatePlan(answers(), EXERCISES)
    for (const g of GROUPS) {
      expect(plan.volume[g], g).toBeGreaterThanOrEqual(12)
      expect(plan.volume[g], g).toBeLessThanOrEqual(20)
    }
    expect(plan.notes.filter((n) => n.kind === 'shortfall')).toEqual([])
    expect(plan.days.map((d) => d.name)).toEqual(['Oberkörper A', 'Unterkörper A', 'Oberkörper B', 'Unterkörper B'])
    expect(plan.days.map((d) => d.weekday)).toEqual([0, 1, 3, 4])
  })

  it('reaches the targets with 3 × 75 minutes of full body for a beginner', () => {
    const plan = generatePlan(answers({ daysPerWeek: 3, minutes: 75, experience: 'beginner' }), EXERCISES)
    for (const g of GROUPS) expect(plan.volume[g], g).toBeGreaterThanOrEqual(10)
  })

  it('maps days to splits and default weekdays', () => {
    const names = (d: number) => generatePlan(answers({ daysPerWeek: d }), EXERCISES).days.map((x) => x.name)
    expect(names(2)).toEqual(['Ganzkörper A', 'Ganzkörper B'])
    expect(names(3)).toEqual(['Ganzkörper A', 'Ganzkörper B', 'Ganzkörper C'])
    expect(names(5)).toEqual(['Oberkörper', 'Unterkörper', 'Push', 'Pull', 'Beine'])
    expect(names(6)).toEqual(['Push A', 'Pull A', 'Beine A', 'Push B', 'Pull B', 'Beine B'])
    for (const d of DAYS_OPTIONS) expect(generatePlan(answers({ daysPerWeek: d }), EXERCISES).days.map((x) => x.weekday)).toEqual(DEFAULT_WEEKDAYS[d])
  })

  it('sets weekly targets by experience, goal and priority', () => {
    expect(weeklyTargets({ experience: 'beginner', goal: 'muscle', priority: [] }).chest).toBe(10)
    expect(weeklyTargets({ experience: 'intermediate', goal: 'muscle', priority: [] }).chest).toBe(12)
    expect(weeklyTargets({ experience: 'advanced', goal: 'strength', priority: [] }).chest).toBe(14)
    expect(weeklyTargets({ experience: 'advanced', goal: 'cut', priority: [] }).chest).toBe(10)
    const t = weeklyTargets({ experience: 'intermediate', goal: 'muscle', priority: ['glutes'] })
    expect(t.glutes).toBe(15)
    expect(t.chest).toBe(12)
  })

  it('puts one heavy lift of 3–6 reps first for a strength focus', () => {
    const plan = generatePlan(answers({ goal: 'strength', equipment: 'barbell' }), EXERCISES)
    for (const d of plan.days) {
      const [first] = d.exercises
      expect(first.role).toBe('main')
      expect([first.repMin, first.repMax]).toEqual([3, 6])
      expect(first.restSec).toBe(180)
      expect(first.pairWith).toBeNull()
      expect(BY_ID.get(first.exerciseId)!.equipment).toBe('barbell')
    }
    expect(plan.days[1].exercises[0].exerciseId).toBe('fedb:Barbell_Squat')
  })

  it('uses 6–10 reps for main lifts, 8–12 for other compounds and 10–15 for isolation', () => {
    const plan = generatePlan(answers(), EXERCISES)
    for (const d of plan.days)
      for (const x of d.exercises) {
        const e = BY_ID.get(x.exerciseId)!
        if (e.unit === 'seconds') continue
        if (x.role === 'main') expect([x.repMin, x.repMax]).toEqual([6, 10])
        else if (countsAsCompound(e)) expect([x.repMin, x.repMax]).toEqual([8, 12])
        else expect([x.repMin, x.repMax]).toEqual([10, 15])
        expect(x.targetRir).toBeGreaterThanOrEqual(1)
        expect(x.targetRir).toBeLessThanOrEqual(3)
      }
  })

  it('pairs supersets and says what it cut when time is short', () => {
    const plan = generatePlan(answers({ daysPerWeek: 2, minutes: 30, experience: 'advanced' }), EXERCISES)
    expect(plan.days.some((d) => d.exercises.some((x) => x.pairWith))).toBe(true)
    expect(plan.notes.some((n) => n.kind === 'superset')).toBe(true)
    expect(plan.notes.some((n) => n.kind === 'shortfall')).toBe(true)
    for (const d of plan.days) expect(d.minutes).toBeLessThanOrEqual(30)
  })

  it('leaves out exercises for a flagged knee and reports the quads', () => {
    const plan = generatePlan(answers({ injuries: ['knee'] }), EXERCISES)
    const all = plan.days.flatMap((d) => d.exercises.map((x) => BY_ID.get(x.exerciseId)!))
    expect(all.some((e) => e.jointStress.includes('knee'))).toBe(false)
    expect(plan.notes.find((n) => n.group === 'quads')?.text).toMatch(/markiertes Gelenk/)
    expect(plan.notes.some((n) => n.kind === 'injury' && /Knie/.test(n.text))).toBe(true)
  })

  it('builds complete plans from bodyweight and bands', () => {
    const plan = generatePlan(answers({ equipment: 'bodyweight', daysPerWeek: 3, minutes: 60 }), EXERCISES)
    const all = plan.days.flatMap((d) => d.exercises.map((x) => BY_ID.get(x.exerciseId)!))
    expect(all.every((e) => e.equipment === 'bodyweight' || e.equipment === 'band')).toBe(true)
    for (const g of ['chest', 'back', 'quads', 'hamstrings', 'glutes'] as Group[]) expect(plan.volume[g], g).toBeGreaterThanOrEqual(10)
  })

  it('warns when chosen weekdays put the same muscle on back-to-back days', () => {
    const plan = generatePlan(answers({ daysPerWeek: 3, weekdays: [0, 1, 2] }), EXERCISES)
    expect(plan.days.map((d) => d.weekday)).toEqual([0, 1, 2])
    const issues = spacingIssues(
      plan.days.map((d) => ({ weekday: d.weekday, groups: new Set(d.exercises.flatMap((x) => primaryGroups(BY_ID.get(x.exerciseId)!))) })),
    )
    expect(issues.length).toBeGreaterThan(0)
  })

  it('is deterministic, and a variant changes the mix', () => {
    const a = answers({ daysPerWeek: 3 })
    expect(generatePlan(a, EXERCISES)).toEqual(generatePlan(a, EXERCISES))
    const ids = (p: GeneratedPlan) => p.days.flatMap((d) => d.exercises.map((x) => x.exerciseId)).join()
    expect(ids(generatePlan(a, EXERCISES, { variant: 1 }))).not.toBe(ids(generatePlan(a, EXERCISES)))
  })

  it('keeps beginners on the same lifts and rotates for intermediates', () => {
    const lifts = (experience: Experience) => {
      const p = generatePlan(answers({ daysPerWeek: 3, experience }), EXERCISES)
      const squat = (i: number) => p.days[i].exercises.find((x) => x.role !== 'accessory' && BY_ID.get(x.exerciseId)!.pattern === 'squat')!.exerciseId
      return [squat(0), squat(2)]
    }
    const [aBeg, cBeg] = lifts('beginner')
    expect(aBeg).toBe(cBeg)
    const [aInt, cInt] = lifts('intermediate')
    expect(aInt).not.toBe(cInt)
  })

  it('keeps every rule when body regions are left out', () => {
    const problems: string[] = []
    const excludes: Region[][] = [['legs'], ['arms'], ['abs'], ['chest'], ['legs', 'abs'], ['chest', 'back', 'shoulders', 'arms']]
    for (const daysPerWeek of DAYS_OPTIONS)
      for (const minutes of [30, 60, 90])
        for (const equipment of EQUIPMENT)
          for (const exclude of excludes) {
            const a = answers({ daysPerWeek, minutes, equipment, exclude })
            problems.push(...check(generatePlan(a, EXERCISES), a))
          }
    expect(problems.slice(0, 15)).toEqual([])
  }, 60_000)

  it('builds an upper-body plan when the legs are left out', () => {
    for (const daysPerWeek of DAYS_OPTIONS) {
      const plan = generatePlan(answers({ daysPerWeek, exclude: ['legs'] }), EXERCISES)
      expect(plan.days.every((d) => d.kind === 'upper' || d.kind === 'push' || d.kind === 'pull')).toBe(true)
      for (const g of ['quads', 'hamstrings', 'glutes', 'calves'] as Group[]) expect(plan.targets[g]).toBe(0)
      expect(plan.notes.some((n) => n.kind === 'shortfall' && ['quads', 'hamstrings', 'glutes', 'calves'].includes(n.group ?? ''))).toBe(false)
    }
    const four = generatePlan(answers({ daysPerWeek: 4, exclude: ['legs'] }), EXERCISES)
    expect(four.days.map((d) => d.name)).toEqual(['Push A', 'Pull A', 'Push B', 'Pull B'])
    for (const g of ['chest', 'back', 'shoulders', 'biceps', 'triceps'] as Group[]) expect(four.volume[g], g).toBeGreaterThanOrEqual(12)
  })

  it('caps a legs-only plan at three days and says why', () => {
    const plan = generatePlan(answers({ daysPerWeek: 5, exclude: ['chest', 'back', 'shoulders', 'arms'] }), EXERCISES)
    expect(plan.days).toHaveLength(3)
    expect(plan.daysPerWeek).toBe(3)
    expect(plan.notes.some((n) => /48 Stunden/.test(n.text))).toBe(true)
  })
})
