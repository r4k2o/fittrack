import type { Sex } from '../db'
import { ageOn, localDay } from './dates'

export interface AboutDraft {
  sex: Sex | null
  birthDate: string
  heightCm: number | null
  weightKg: number | null
  bodyFatPct: number | null
}

export function validateAbout(a: AboutDraft, today = localDay()): { ok: boolean; errors: Partial<Record<keyof AboutDraft, string>> } {
  const errors: Partial<Record<keyof AboutDraft, string>> = {}
  if (!a.sex) errors.sex = 'Bitte wählen, die Formel unterscheidet sich.'
  if (!a.birthDate) errors.birthDate = 'Bitte Geburtsdatum eingeben.'
  else {
    const age = ageOn(a.birthDate, today)
    if (age < 13 || age > 100) errors.birthDate = 'Bitte Datum prüfen.'
  }
  if (a.heightCm == null || a.heightCm < 100 || a.heightCm > 250) errors.heightCm = 'Zwischen 100 und 250 cm.'
  if (a.weightKg == null || a.weightKg < 30 || a.weightKg > 300) errors.weightKg = 'Zwischen 30 und 300 kg.'
  if (a.bodyFatPct != null && (a.bodyFatPct < 3 || a.bodyFatPct > 70)) errors.bodyFatPct = 'Zwischen 3 und 70 % oder leer lassen.'
  return { ok: Object.keys(errors).length === 0, errors }
}
