import { db } from '../db'

export interface DeviceCheckResult {
  ranAt: string
  results: Record<string, { ok: boolean; detail: string }>
}

export interface FoodListMeta {
  name: string
  count: number
  importedAt: string
}

/** Every key the app stores in the settings table, with its type and default. */
export interface SettingsMap {
  onboardingDone: boolean
  adultConfirmedAt: string | null
  firstRunAt: string | null
  lastBackupAt: string | null
  exerciseLibraryVersion: number
  foodList: FoodListMeta | null
  addBurnedCalories: boolean
  restCompoundSec: number
  restIsolationSec: number
  deviceCheck: DeviceCheckResult | null
}

export const SETTING_DEFAULTS: SettingsMap = {
  onboardingDone: false,
  adultConfirmedAt: null,
  firstRunAt: null,
  lastBackupAt: null,
  exerciseLibraryVersion: 0,
  foodList: null,
  addBurnedCalories: false,
  restCompoundSec: 150,
  restIsolationSec: 90,
  deviceCheck: null,
}

/** Keys that never go into a backup file (secrets and per-device state). */
export const LOCAL_ONLY_SETTINGS: ReadonlySet<string> = new Set(['deviceCheck', 'aiApiKey'])

export async function getSetting<K extends keyof SettingsMap>(key: K): Promise<SettingsMap[K]> {
  const row = await db.settings.get(key)
  return row ? (row.value as SettingsMap[K]) : SETTING_DEFAULTS[key]
}

export async function setSetting<K extends keyof SettingsMap>(key: K, value: SettingsMap[K]): Promise<void> {
  await db.settings.put({ key, value, updatedAt: new Date().toISOString() })
}
