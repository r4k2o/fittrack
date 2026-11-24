import { db, type Equipment, type Exercise, type Joint, type Muscle, type Pattern } from '../db'
import { getSetting, setSetting } from './settings'

interface LibraryExercise {
  id: string
  name: string
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
