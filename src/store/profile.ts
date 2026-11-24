import { db, newRow, type Goal, type GoalType, type NutritionTarget, type Profile, type Sex } from '../db'
import { ageOn, localDay } from '../lib/dates'
import { calculateTargets, GOALS, type TargetInputs, type TargetResult } from '../lib/nutrition'
import { latestMetric, upsertMetric } from './metrics'
import { setSetting } from './settings'

export const PROFILE_ID = 'me'

export async function getProfile(): Promise<Profile | undefined> {
  return db.profile.get(PROFILE_ID)
}

export async function getActiveGoal(): Promise<Goal | undefined> {
  return db.goals.where('active').equals(1).first()
}

/** The target valid on `date`: the newest row whose effectiveFrom is on or before it. */
export async function targetFor(date: string): Promise<NutritionTarget | undefined> {
  return db.nutritionTargets.where('effectiveFrom').belowOrEqual(date).last()
}

export interface AboutYou {
  sex: Sex
  birthDate: string
  heightCm: number
  weightKg: number
  bodyFatPct: number | null
}

export function buildInputs(
  about: AboutYou,
  activityFactor: number,
  goal: GoalType,
  overrides: Pick<TargetInputs, 'goalAdjustPct' | 'proteinPerKg' | 'fatPerKg' | 'kcalOverride' | 'useLeanMass'> = { useLeanMass: false },
  today = localDay(),
): TargetInputs {
  return {
    sex: about.sex,
    ageYears: ageOn(about.birthDate, today),
    heightCm: about.heightCm,
    weightKg: about.weightKg,
    bodyFatPct: about.bodyFatPct,
    activityFactor,
    goal,
    ...overrides,
    useLeanMass: overrides.useLeanMass ?? false,
  }
}

/**
 * Writes profile, weight, goal and a target row effective today. Called at the end of
 * onboarding and whenever profile, goal or targets change under More.
 */
export async function saveProfileAndTargets(about: AboutYou, inputs: TargetInputs, today = localDay()): Promise<TargetResult> {
  const result = calculateTargets(inputs)
  const now = new Date().toISOString()
  await db.transaction('rw', [db.profile, db.goals, db.nutritionTargets, db.metrics, db.settings], async () => {
    const existing = await db.profile.get(PROFILE_ID)
    const profile: Profile = {
      id: PROFILE_ID,
      sex: about.sex,
      birthDate: about.birthDate,
      heightCm: about.heightCm,
      activityFactor: inputs.activityFactor,
      ...(existing?.experience ? { experience: existing.experience } : {}),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    await db.profile.put(profile)

    const latestWeight = await latestMetric('weight')
    if (!latestWeight || latestWeight.date !== today || latestWeight.value !== about.weightKg) {
      await upsertMetric('weight', today, about.weightKg, 'manual')
    }
    if (about.bodyFatPct != null) await upsertMetric('bodyFat', today, about.bodyFatPct, 'manual')

    let goal = await db.goals.where('active').equals(1).first()
    if (!goal || goal.type !== inputs.goal) {
      if (goal) await db.goals.put({ ...goal, active: 0, endDate: today, updatedAt: now })
      const band = GOALS[inputs.goal].rateBand
      goal = newRow<Goal>({
        type: inputs.goal,
        startDate: today,
        endDate: null,
        startWeightKg: about.weightKg,
        ratePctPerWeek: (band[0] + band[1]) / 2,
        active: 1,
      })
      await db.goals.add(goal)
    }

    const target: Omit<NutritionTarget, 'id' | 'createdAt' | 'updatedAt'> = {
      goalId: goal.id,
      effectiveFrom: today,
      kcal: result.kcal,
      proteinG: result.proteinG,
      carbsG: result.carbsG,
      fatG: result.fatG,
      method: result.method,
      inputs,
    }
    // one row per day: a second change today replaces today's row, earlier days keep theirs
    const sameDay = await db.nutritionTargets.where('effectiveFrom').equals(today).first()
    if (sameDay) await db.nutritionTargets.put({ ...sameDay, ...target, updatedAt: now })
    else await db.nutritionTargets.add(newRow<NutritionTarget>(target))
  })
  return result
}

export async function completeOnboarding(adultConfirmedAt: string): Promise<void> {
  await setSetting('adultConfirmedAt', adultConfirmedAt)
  await setSetting('onboardingDone', true)
}
