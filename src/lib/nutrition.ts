// Calorie and macro targets: Mifflin-St Jeor (or Katch-McArdle with a body-fat
// reading) × activity factor, shifted for the goal, then protein, fat and the
// remainder as carbohydrate. Every default can be overridden; an override is
// stored as a defined value and survives recalculation ("set by you").

import type { GoalType, Sex } from '../db'

export interface ActivityLevel {
  factor: number
  label: string
  detail: string
}

export const ACTIVITY_LEVELS: readonly ActivityLevel[] = [
  { factor: 1.2, label: 'Seated', detail: 'Desk job, little walking, no regular training' },
  { factor: 1.375, label: 'Light', detail: 'Desk job and training 1–3 times a week, or on your feet part of the day' },
  { factor: 1.55, label: 'Moderate', detail: 'Training 3–5 times a week, or a job with a lot of walking' },
  { factor: 1.725, label: 'Very active', detail: 'Hard training 6–7 times a week, or a physical job plus training' },
  { factor: 1.9, label: 'Extreme', detail: 'Heavy physical work plus hard training, or training twice a day' },
]

export interface GoalInfo {
  label: string
  blurb: string
  /** Default calorie shift in % of maintenance. */
  adjustPct: number
  /** Range the slider offers. */
  adjustRange: [number, number]
  /** Planned weekly weight change in % of body weight. */
  rateBand: [number, number]
  proteinPerKg: number
  fatPerKg: number
}

export const GOALS: Record<GoalType, GoalInfo> = {
  bulk: {
    label: 'Lean bulk',
    blurb: 'Gain about 0.25–0.5% of body weight a week',
    adjustPct: 10,
    adjustRange: [5, 20],
    rateBand: [0.25, 0.5],
    proteinPerKg: 2.0,
    fatPerKg: 0.9,
  },
  maintain: {
    label: 'Maintain',
    blurb: 'Hold your weight while you train',
    adjustPct: 0,
    adjustRange: [0, 0],
    rateBand: [-0.25, 0.25],
    proteinPerKg: 2.0,
    fatPerKg: 0.9,
  },
  cut: {
    label: 'Cut',
    blurb: 'Lose about 0.5–1% of body weight a week and keep muscle',
    adjustPct: -20,
    adjustRange: [-25, -10],
    rateBand: [-1, -0.5],
    proteinPerKg: 2.2,
    fatPerKg: 0.7,
  },
}

export const PROTEIN_RANGE: [number, number] = [1.6, 2.6]
export const FAT_RANGE: [number, number] = [0.5, 1.5]
export const ACTIVITY_RANGE: [number, number] = [1.2, 1.9]
export const FAT_FLOOR_PER_KG = 0.5
export const CARB_WARN_PER_KG = 3

export interface TargetInputs {
  sex: Sex
  ageYears: number
  heightCm: number
  weightKg: number
  bodyFatPct: number | null
  /** Use Katch-McArdle; only honoured when bodyFatPct is known. */
  useLeanMass: boolean
  activityFactor: number
  goal: GoalType
  /** Overrides. Undefined means "use the default for the goal". */
  goalAdjustPct?: number
  proteinPerKg?: number
  fatPerKg?: number
  kcalOverride?: number
  /** Maintenance measured from 14 days of intake and weight trend; replaces resting × activity. */
  maintenanceOverride?: number
}

export type TargetWarningCode = 'belowResting' | 'lowCarbs' | 'minorNoDeficit' | 'macrosExceedKcal'

export interface TargetWarning {
  code: TargetWarningCode
  message: string
}

export interface TargetResult {
  method: 'mifflin' | 'katch' | 'adaptive'
  /** Resting × activity, also when the maintenance in use comes from your data. */
  formulaMaintenanceKcal: number
  restingKcal: number
  maintenanceKcal: number
  goalAdjustPct: number
  kcal: number
  proteinPerKg: number
  fatPerKg: number
  proteinG: number
  fatG: number
  carbsG: number
  carbsPerKg: number
  warnings: TargetWarning[]
  setByYou: { goalAdjustPct: boolean; proteinPerKg: boolean; fatPerKg: boolean; kcal: boolean }
}

export function mifflinStJeor(sex: Sex, weightKg: number, heightCm: number, ageYears: number): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * ageYears + (sex === 'male' ? 5 : -161)
}

export function katchMcArdle(weightKg: number, bodyFatPct: number): number {
  const leanKg = weightKg * (1 - bodyFatPct / 100)
  return 370 + 21.6 * leanKg
}

export const roundTo = (n: number, step: number) => Math.round(n / step) * step

export function calculateTargets(i: TargetInputs): TargetResult {
  const goal = GOALS[i.goal]
  const warnings: TargetWarning[] = []
  const katch = i.useLeanMass && i.bodyFatPct != null && i.bodyFatPct > 0
  const resting = katch ? katchMcArdle(i.weightKg, i.bodyFatPct as number) : mifflinStJeor(i.sex, i.weightKg, i.heightCm, i.ageYears)
  const formulaMaintenance = resting * i.activityFactor
  const maintenance = i.maintenanceOverride && i.maintenanceOverride > 0 ? i.maintenanceOverride : formulaMaintenance

  let adjust = i.goalAdjustPct ?? goal.adjustPct
  if (i.ageYears < 18 && adjust < 0) {
    adjust = 0
    warnings.push({
      code: 'minorNoDeficit',
      message: 'Under 18 there is no deficit target. Please talk to a doctor or dietitian before cutting.',
    })
  }

  const kcal = i.kcalOverride != null ? Math.round(i.kcalOverride) : roundTo(maintenance * (1 + adjust / 100), 10)
  const proteinPerKg = i.proteinPerKg ?? goal.proteinPerKg
  const fatPerKg = Math.max(FAT_FLOOR_PER_KG, i.fatPerKg ?? goal.fatPerKg)
  const proteinG = Math.round(proteinPerKg * i.weightKg)
  const fatG = Math.round(fatPerKg * i.weightKg)
  let carbsG = Math.round((kcal - 4 * proteinG - 9 * fatG) / 4)
  if (carbsG < 0) {
    carbsG = 0
    warnings.push({
      code: 'macrosExceedKcal',
      message: 'Protein and fat already use up the calories. Raise the calorie target or lower protein or fat.',
    })
  }
  const carbsPerKg = carbsG / i.weightKg
  if (kcal < resting) {
    warnings.push({
      code: 'belowResting',
      message: `The target is below your estimated resting energy of ${Math.round(resting)} kcal.`,
    })
  }
  if (carbsPerKg < CARB_WARN_PER_KG && carbsG > 0) {
    warnings.push({
      code: 'lowCarbs',
      message: 'Carbohydrate is below 3 g per kg, the low end of what supports hard training.',
    })
  }

  return {
    method: i.maintenanceOverride && i.maintenanceOverride > 0 ? 'adaptive' : katch ? 'katch' : 'mifflin',
    formulaMaintenanceKcal: Math.round(formulaMaintenance),
    restingKcal: Math.round(resting),
    maintenanceKcal: Math.round(maintenance),
    goalAdjustPct: adjust,
    kcal,
    proteinPerKg,
    fatPerKg,
    proteinG,
    fatG,
    carbsG,
    carbsPerKg,
    warnings,
    setByYou: {
      goalAdjustPct: i.goalAdjustPct != null,
      proteinPerKg: i.proteinPerKg != null,
      fatPerKg: i.fatPerKg != null,
      kcal: i.kcalOverride != null,
    },
  }
}

/** Nearest activity level for a factor, for labels. */
export function activityLevelFor(factor: number): ActivityLevel {
  return ACTIVITY_LEVELS.reduce((best, l) => (Math.abs(l.factor - factor) < Math.abs(best.factor - factor) ? l : best))
}
