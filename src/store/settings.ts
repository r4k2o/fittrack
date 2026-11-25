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
  /** First and last day of a lighter week (half the sets), as local dates. */
  deloadFrom: string | null
  deloadUntil: string | null
  /** The lighter-week offer stays hidden until this date after "Not now". */
  deloadSnoozedUntil: string | null
  /** Monday of the week whose review card was closed on Today. */
  reviewDismissedWeek: string | null
  /** "Ignore" on the target correction hides it until this date. */
  adaptiveSnoozedUntil: string | null
  /** The capture guide for progress photos has been shown. */
  photoGuideSeen: boolean
  /** Optional vision/language model. The key stays on this phone and never goes into a backup. */
  aiProvider: 'gemini' | 'openrouter' | 'mistral'
  aiModel: string | null
  aiApiKey: string | null
  aiDailyLimit: number | null
  aiUsage: { date: string; count: number } | null
  /** How far confirmed grams were from the model's guesses, to learn its error. */
  aiStats: { meals: number; items: number; aiGrams: number; finalGrams: number; absDiffGrams: number } | null
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
  deloadFrom: null,
  deloadUntil: null,
  deloadSnoozedUntil: null,
  reviewDismissedWeek: null,
  adaptiveSnoozedUntil: null,
  photoGuideSeen: false,
  aiProvider: 'gemini',
  aiModel: null,
  aiApiKey: null,
  aiDailyLimit: null,
  aiUsage: null,
  aiStats: null,
}

/** Keys that never go into a backup file (secrets and per-device state). */
export const LOCAL_ONLY_SETTINGS: ReadonlySet<string> = new Set(['deviceCheck', 'aiApiKey', 'aiUsage'])

export async function getSetting<K extends keyof SettingsMap>(key: K): Promise<SettingsMap[K]> {
  const row = await db.settings.get(key)
  return row ? (row.value as SettingsMap[K]) : SETTING_DEFAULTS[key]
}

export async function setSetting<K extends keyof SettingsMap>(key: K, value: SettingsMap[K]): Promise<void> {
  await db.settings.put({ key, value, updatedAt: new Date().toISOString() })
}
