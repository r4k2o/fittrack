// Zod schemas that check rows from backups (and later imports and AI responses)
// before they touch the database. Unknown fields pass through, so a backup from a
// newer minor version does not lose data on its way back in.

import { z } from 'zod'
import type { StoreName } from '../db'

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected a YYYY-MM-DD day')
const flag = z.union([z.literal(0), z.literal(1)])
const num = z.number() // Zod 4 rejects NaN and ±Infinity by default
const base = { id: z.string().min(1), createdAt: z.string().min(1), updatedAt: z.string().min(1) }

export const nutrientsSchema = z.looseObject({
  kcal: num,
  protein: num,
  carbs: num,
  fat: num,
  fibre: num.optional(),
  sugar: num.optional(),
  satFat: num.optional(),
  salt: num.optional(),
})

const servingSchema = z.looseObject({ name: z.string(), grams: num.positive() })

/** A Blob stored in the zip as a separate file. */
export const fileRefSchema = z.object({ $file: z.string().min(1), type: z.string() })

export const rowSchemas: Record<StoreName, z.ZodType> = {
  profile: z.looseObject({ ...base, sex: z.enum(['male', 'female']), birthDate: day, heightCm: num.positive(), activityFactor: num }),
  goals: z.looseObject({ ...base, type: z.enum(['bulk', 'maintain', 'cut']), startDate: day, startWeightKg: num, ratePctPerWeek: num, active: flag }),
  nutritionTargets: z.looseObject({
    ...base,
    goalId: z.string(),
    effectiveFrom: day,
    kcal: num,
    proteinG: num,
    carbsG: num,
    fatG: num,
    method: z.string(),
    inputs: z.looseObject({}),
  }),
  foods: z.looseObject({
    ...base,
    name: z.string().min(1),
    source: z.enum(['list', 'off', 'custom']),
    per100: nutrientsSchema,
    servings: z.array(servingSchema),
  }),
  recipes: z.looseObject({
    ...base,
    name: z.string().min(1),
    servings: num.positive(),
    ingredients: z.array(z.looseObject({ foodId: z.string(), grams: num })),
  }),
  diaryEntries: z.looseObject({
    ...base,
    date: day,
    meal: z.enum(['breakfast', 'lunch', 'dinner', 'snacks']),
    name: z.string(),
    macros: nutrientsSchema,
    source: z.string(),
  }),
  mealTemplates: z.looseObject({ ...base, name: z.string(), items: z.array(z.looseObject({ name: z.string(), grams: num })) }),
  exercises: z.looseObject({
    ...base,
    name: z.string().min(1),
    primary: z.array(z.string()),
    secondary: z.array(z.string()),
    equipment: z.string(),
    pattern: z.string(),
    jointStress: z.array(z.string()),
    compound: z.boolean(),
    custom: flag,
  }),
  plans: z.looseObject({ ...base, name: z.string(), split: z.string(), daysPerWeek: num, active: flag, kind: z.enum(['routines', 'generated']) }),
  planDays: z.looseObject({ ...base, planId: z.string(), name: z.string(), order: num }),
  planExercises: z.looseObject({
    ...base,
    planDayId: z.string(),
    exerciseId: z.string(),
    order: num,
    sets: num,
    repMin: num,
    repMax: num,
    targetRir: num,
    restSec: num,
  }),
  sessions: z.looseObject({ ...base, date: day, startedAt: z.string(), name: z.string(), exerciseIds: z.array(z.string()) }),
  setLogs: z.looseObject({
    ...base,
    sessionId: z.string(),
    exerciseId: z.string(),
    date: day,
    kind: z.enum(['warmup', 'work']),
    weightKg: num,
    reps: num,
    setIndex: num,
  }),
  cardioSessions: z.looseObject({ ...base, date: day, type: z.string(), durationMin: num, source: z.enum(['manual', 'health']) }),
  metrics: z.looseObject({
    ...base,
    date: day,
    type: z.enum(['weight', 'bodyFat', 'steps', 'sleepMin', 'sleepScore', 'waist']),
    value: num,
    source: z.enum(['manual', 'health', 'computed']),
  }),
  photos: z.looseObject({
    ...base,
    takenAt: z.string(),
    isoWeek: z.string(),
    pose: z.enum(['front', 'side', 'back']),
    image: fileRefSchema,
    thumbnail: fileRefSchema,
  }),
  imports: z.looseObject({ ...base, source: z.string(), fromDate: z.string(), toDate: z.string(), fileHash: z.string() }),
  settings: z.looseObject({ key: z.string().min(1), value: z.unknown(), updatedAt: z.string() }),
}

export const manifestSchema = z.looseObject({
  app: z.literal('fittrack'),
  format: z.literal(1),
  schemaVersion: z.number().int().positive(),
  exportedAt: z.string(),
  counts: z.record(z.string(), z.number().int().nonnegative()),
  includesPhotos: z.boolean(),
})

export type BackupManifest = z.infer<typeof manifestSchema>
