import { beforeEach, describe, expect, it } from 'vitest'
import { db, newRow, type Plan, type PlanDay, type Session } from '../db'
import { germanDayName, germanPlanName, migrateNames } from './seed'
import { getSetting } from './settings'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('names from the English version', () => {
  it('maps generated plan and day names and leaves the user’s own names alone', () => {
    expect(germanPlanName('Upper / lower, 4 days')).toBe('Ober- / Unterkörper, 4 Tage')
    expect(germanPlanName('Push, pull, legs, 6 days')).toBe('Push, Pull, Beine, 6 Tage')
    expect(germanPlanName('My summer plan')).toBe('My summer plan')
    expect(germanDayName('Full body B')).toBe('Ganzkörper B')
    expect(germanDayName('Legs')).toBe('Beine')
    expect(germanDayName('Push A')).toBe('Push A')
    expect(germanDayName('Arm day')).toBe('Arm day')
  })

  it('renames stored rows once', async () => {
    await db.plans.add(newRow<Plan>({ name: 'Full body, 3 days', split: 'full-body', daysPerWeek: 3, active: 1, kind: 'generated' }))
    await db.planDays.add(newRow<PlanDay>({ planId: 'p', name: 'Upper A', order: 0, weekday: 0 }))
    await db.sessions.add(newRow<Session>({ date: '2026-11-02', startedAt: '2026-11-02T18:00:00Z', name: 'Workout', exerciseIds: [] }))
    await migrateNames()
    expect((await db.plans.toArray())[0].name).toBe('Ganzkörper, 3 Tage')
    expect((await db.planDays.toArray())[0].name).toBe('Oberkörper A')
    expect((await db.sessions.toArray())[0].name).toBe('Training')
    expect(await getSetting('namesVersion')).toBe(1)
    // a later rename by the user survives the next launch
    await db.sessions.toCollection().modify({ name: 'Workout' })
    await migrateNames()
    expect((await db.sessions.toArray())[0].name).toBe('Workout')
  })
})
