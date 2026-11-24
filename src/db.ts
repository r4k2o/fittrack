// Storage: one IndexedDB database on the phone, through Dexie.
// Rules that keep the data sane:
// - Ids are UUIDs (seeded library rows use stable ids so references survive a restore).
// - Every row carries createdAt and updatedAt (UTC ISO); restore merges on updatedAt.
// - Days are local YYYY-MM-DD strings; timestamps are UTC.
// - A diary entry stores a snapshot of its macros, so editing a food never rewrites past days.
// - Targets are never overwritten: a new row with a new effectiveFrom takes over.
// - metrics is unique on type + date + source, so importing the same file twice changes nothing.
// - IndexedDB cannot index booleans, so queried flags (active, custom) are stored as 0 or 1.

import Dexie, { type EntityTable } from 'dexie'
import type { TargetInputs } from './lib/nutrition'

export const DB_NAME = 'fittrack'
export const SCHEMA_VERSION = 1

export type Flag = 0 | 1
export type Sex = 'male' | 'female'
export type Experience = 'beginner' | 'intermediate' | 'advanced'
export type GoalType = 'bulk' | 'maintain' | 'cut'
export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snacks'
export type FoodSource = 'list' | 'off' | 'custom'
export type DiarySource = 'search' | 'recent' | 'barcode' | 'quick' | 'copy' | 'photo' | 'recipe'
export type MetricType = 'weight' | 'bodyFat' | 'steps' | 'sleepMin' | 'sleepScore' | 'waist'
export type MetricSource = 'manual' | 'health' | 'computed'
export type SetKind = 'warmup' | 'work'
export type Pattern = 'squat' | 'hinge' | 'hpush' | 'hpull' | 'vpush' | 'vpull' | 'isolation'
export type Joint = 'shoulder' | 'elbow' | 'wrist' | 'lowerBack' | 'hip' | 'knee'
export type Equipment =
  | 'barbell'
  | 'ezbar'
  | 'trapbar'
  | 'dumbbell'
  | 'kettlebell'
  | 'cable'
  | 'machine'
  | 'smith'
  | 'bodyweight'
  | 'band'
  | 'other'
export type Muscle =
  | 'chest'
  | 'lats'
  | 'midBack'
  | 'lowerBack'
  | 'traps'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'adductors'
  | 'abductors'
  | 'abs'
  | 'neck'
export type CardioType = 'run' | 'cycle' | 'row' | 'swim' | 'walk' | 'elliptical' | 'stairs' | 'sport' | 'other'

export interface Row {
  id: string
  createdAt: string
  updatedAt: string
}

export interface Profile extends Row {
  sex: Sex
  birthDate: string
  heightCm: number
  activityFactor: number
  experience?: Experience
}

export interface Goal extends Row {
  type: GoalType
  startDate: string
  endDate?: string | null
  startWeightKg: number
  /** Planned weekly change, % of body weight (midpoint of the goal's band). */
  ratePctPerWeek: number
  active: Flag
}

export interface NutritionTarget extends Row {
  goalId: string
  effectiveFrom: string
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
  method: 'mifflin' | 'katch' | 'adaptive'
  inputs: TargetInputs
}

/** Values per 100 g (or 100 ml). kcal, protein, carbs and fat are required. */
export interface Nutrients {
  kcal: number
  protein: number
  carbs: number
  fat: number
  fibre?: number
  sugar?: number
  satFat?: number
  salt?: number
}

export interface Serving {
  name: string
  grams: number
}

export interface Food extends Row {
  name: string
  brand?: string
  barcode?: string
  source: FoodSource
  per100: Nutrients
  servings: Serving[]
  synonyms?: string[]
  /** Set when the stated calories are far from 4P + 4C + 9F. */
  flagged?: boolean
  lastUsedAt?: string
  lastPortionG?: number
}

export interface Recipe extends Row {
  name: string
  servings: number
  cookedWeightG?: number | null
  ingredients: { foodId: string; grams: number }[]
}

export interface DiaryEntry extends Row {
  date: string
  meal: Meal
  foodId?: string | null
  recipeId?: string | null
  name: string
  brand?: string
  grams?: number | null
  servingName?: string | null
  servingCount?: number | null
  /** Snapshot for this portion, so later food edits never change past days. */
  macros: Nutrients
  source: DiarySource
}

export interface MealTemplate extends Row {
  name: string
  items: { foodId?: string | null; recipeId?: string | null; name: string; grams: number; macros: Nutrients }[]
}

export interface Exercise extends Row {
  name: string
  primary: Muscle[]
  secondary: Muscle[]
  equipment: Equipment
  pattern: Pattern
  jointStress: Joint[]
  compound: boolean
  custom: Flag
  unit?: 'reps' | 'seconds'
  level?: string
  instructions?: string[]
  /** Smallest load step for progression; defaults by equipment when unset. */
  loadStepKg?: number
}

export interface Plan extends Row {
  name: string
  split: string
  daysPerWeek: number
  answers?: unknown
  generatorVersion?: number | null
  active: Flag
  /** 'routines' holds workouts saved by hand; 'generated' comes from the questionnaire (phase 2). */
  kind: 'routines' | 'generated'
}

export interface PlanDay extends Row {
  planId: string
  name: string
  order: number
  weekday?: number | null
}

export interface PlanExercise extends Row {
  planDayId: string
  exerciseId: string
  order: number
  sets: number
  repMin: number
  repMax: number
  targetRir: number
  restSec: number
  supersetWith?: string | null
}

export interface Session extends Row {
  date: string
  startedAt: string
  endedAt?: string | null
  planDayId?: string | null
  name: string
  notes?: string
  /** Exercise order on screen while the workout runs and in history. */
  exerciseIds: string[]
}

export interface SetLog extends Row {
  sessionId: string
  exerciseId: string
  date: string
  kind: SetKind
  weightKg: number
  reps: number
  rir?: number | null
  setIndex: number
}

export interface CardioSession extends Row {
  date: string
  startedAt?: string | null
  type: CardioType
  durationMin: number
  distanceKm?: number | null
  rpe?: number | null
  avgHr?: number | null
  kcal?: number | null
  source: 'manual' | 'health'
  externalId?: string | null
  notes?: string
}

export interface Metric extends Row {
  date: string
  type: MetricType
  value: number
  source: MetricSource
}

export interface Photo extends Row {
  takenAt: string
  isoWeek: string
  pose: 'front' | 'side' | 'back'
  image: Blob
  thumbnail: Blob
  weightKg?: number | null
  starred?: boolean
}

export interface ImportLog extends Row {
  source: string
  fromDate: string
  toDate: string
  counts: Record<string, number>
  fileHash: string
}

export interface Setting {
  key: string
  value: unknown
  updatedAt: string
}

export type FittrackDb = Dexie & {
  profile: EntityTable<Profile, 'id'>
  goals: EntityTable<Goal, 'id'>
  nutritionTargets: EntityTable<NutritionTarget, 'id'>
  foods: EntityTable<Food, 'id'>
  recipes: EntityTable<Recipe, 'id'>
  diaryEntries: EntityTable<DiaryEntry, 'id'>
  mealTemplates: EntityTable<MealTemplate, 'id'>
  exercises: EntityTable<Exercise, 'id'>
  plans: EntityTable<Plan, 'id'>
  planDays: EntityTable<PlanDay, 'id'>
  planExercises: EntityTable<PlanExercise, 'id'>
  sessions: EntityTable<Session, 'id'>
  setLogs: EntityTable<SetLog, 'id'>
  cardioSessions: EntityTable<CardioSession, 'id'>
  metrics: EntityTable<Metric, 'id'>
  photos: EntityTable<Photo, 'id'>
  imports: EntityTable<ImportLog, 'id'>
  settings: EntityTable<Setting, 'key'>
}

/** Index definition, as Dexie reads it (only indexed fields are listed). */
export const STORES = {
  profile: 'id',
  goals: 'id, active',
  nutritionTargets: 'id, goalId, effectiveFrom',
  foods: 'id, barcode, source, lastUsedAt',
  recipes: 'id',
  diaryEntries: 'id, date, [date+meal]',
  mealTemplates: 'id',
  exercises: 'id, custom',
  plans: 'id, active',
  planDays: 'id, planId',
  planExercises: 'id, planDayId',
  sessions: 'id, date, planDayId',
  setLogs: 'id, sessionId, [exerciseId+date]',
  cardioSessions: 'id, date, externalId',
  metrics: 'id, &[type+date+source], [type+date]',
  photos: 'id, isoWeek, [pose+takenAt]',
  imports: 'id, fileHash',
  settings: 'key',
} as const

export type StoreName = keyof typeof STORES
export const STORE_NAMES = Object.keys(STORES) as StoreName[]

export function createDb(name = DB_NAME): FittrackDb {
  const db = new Dexie(name) as FittrackDb
  db.version(SCHEMA_VERSION).stores(STORES)
  return db
}

export const db = createDb()

export const newId = (): string => crypto.randomUUID()

export function stamp<T extends object>(row: T, now = new Date().toISOString()): T & Pick<Row, 'createdAt' | 'updatedAt'> {
  return { ...row, createdAt: now, updatedAt: now }
}

export function touch<T extends { updatedAt: string }>(row: T, now = new Date().toISOString()): T {
  return { ...row, updatedAt: now }
}

let lastStamp = 0

/**
 * A timestamp that is strictly increasing within this session, so rows created in
 * the same millisecond (a copied meal, a burst of taps) keep their order.
 */
export function monotonicIso(): string {
  const now = Date.now()
  lastStamp = now > lastStamp ? now : lastStamp + 1
  return new Date(lastStamp).toISOString()
}

/** Builds a new row with a fresh id and both timestamps. */
export function newRow<T extends Row>(fields: Omit<T, keyof Row> & Partial<Pick<Row, 'id'>>): T {
  const now = monotonicIso()
  return { id: newId(), ...fields, createdAt: now, updatedAt: now } as T
}
