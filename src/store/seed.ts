import { db, type Equipment, type Exercise, type Joint, type Muscle, type Pattern } from '../db'
import { getSetting, setSetting } from './settings'

interface LibraryExercise {
  id: string
  name: string
  nameEn?: string
  primary: Muscle[]
  secondary: Muscle[]
  equipment: Equipment
  pattern: Pattern
  joints: Joint[]
  compound: boolean
  unit?: 'reps' | 'seconds'
  level?: string
  instructions?: string[]
}

/**
 * Loads the bundled exercise library into IndexedDB on first launch and whenever its
 * version changes. Library rows keep stable ids, so logged sets stay linked after a
 * restore on another phone; a load step the user changed survives a re-seed.
 */
export async function seedExercises(): Promise<void> {
  const { default: library } = (await import('../data/exercises.json')) as {
    default: { version: number; exercises: LibraryExercise[] }
  }
  const current = await getSetting('exerciseLibraryVersion')
  if (current >= library.version && (await db.exercises.where('custom').equals(0).count()) > 0) return
  const now = new Date().toISOString()
  await db.transaction('rw', db.exercises, db.settings, async () => {
    const existing = new Map((await db.exercises.where('custom').equals(0).toArray()).map((e) => [e.id, e]))
    const rows: Exercise[] = library.exercises.map((x) => {
      const prev = existing.get(x.id)
      return {
        id: x.id,
        name: x.name,
        ...(x.nameEn ? { nameEn: x.nameEn } : {}),
        primary: x.primary,
        secondary: x.secondary,
        equipment: x.equipment,
        pattern: x.pattern,
        jointStress: x.joints,
        compound: x.compound,
        custom: 0,
        ...(x.unit ? { unit: x.unit } : {}),
        ...(x.level ? { level: x.level } : {}),
        instructions: x.instructions ?? [],
        ...(prev?.loadStepKg != null ? { loadStepKg: prev.loadStepKg } : {}),
        createdAt: prev?.createdAt ?? now,
        updatedAt: now,
      }
    })
    await db.exercises.bulkPut(rows)
    await setSetting('exerciseLibraryVersion', library.version)
  })
}

// ---- names from the English version ---------------------------------------------------

const DAY_NAMES: Record<string, string> = {
  'Full body A': 'Ganzkörper A',
  'Full body B': 'Ganzkörper B',
  'Full body C': 'Ganzkörper C',
  'Upper A': 'Oberkörper A',
  'Upper B': 'Oberkörper B',
  'Lower A': 'Unterkörper A',
  'Lower B': 'Unterkörper B',
  'Legs A': 'Beine A',
  'Legs B': 'Beine B',
  Upper: 'Oberkörper',
  Lower: 'Unterkörper',
  Legs: 'Beine',
  Workout: 'Training',
}

const SPLIT_NAMES: Record<string, string> = {
  'Full body': 'Ganzkörper',
  'Upper / lower': 'Ober- / Unterkörper',
  'Upper, lower, push, pull, legs': 'Ober-, Unterkörper, Push, Pull, Beine',
  'Push, pull, legs': 'Push, Pull, Beine',
}

/** "Upper / lower, 4 days" → "Ober- / Unterkörper, 4 Tage"; other names stay as they are. */
export function germanPlanName(name: string): string {
  const m = name.match(/^(.*), (\d) days$/)
  return m && SPLIT_NAMES[m[1]] ? `${SPLIT_NAMES[m[1]]}, ${m[2]} Tage` : name
}

export function germanDayName(name: string): string {
  return DAY_NAMES[name] ?? name
}

/** Once: plans, plan days and workouts named by the English version get their German names. */
export async function migrateNames(): Promise<void> {
  if ((await getSetting('namesVersion')) >= 1) return
  await db.transaction('rw', db.plans, db.planDays, db.sessions, db.settings, async () => {
    const t = new Date().toISOString()
    await db.plans.toCollection().modify((p) => {
      const n = germanPlanName(p.name)
      if (n !== p.name) Object.assign(p, { name: n, updatedAt: t })
    })
    await db.planDays.toCollection().modify((d) => {
      const n = germanDayName(d.name)
      if (n !== d.name) Object.assign(d, { name: n, updatedAt: t })
    })
    await db.sessions.toCollection().modify((x) => {
      const n = germanDayName(x.name)
      if (n !== x.name) Object.assign(x, { name: n, updatedAt: t })
    })
    await setSetting('namesVersion', 1)
  })
}
