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
  if (!a.sex) errors.sex = 'Choose one; the equation differs.'
  if (!a.birthDate) errors.birthDate = 'Enter your birth date.'
  else {
    const age = ageOn(a.birthDate, today)
    if (age < 13 || age > 100) errors.birthDate = 'Check the date.'
  }
  if (a.heightCm == null || a.heightCm < 100 || a.heightCm > 250) errors.heightCm = 'Between 100 and 250 cm.'
  if (a.weightKg == null || a.weightKg < 30 || a.weightKg > 300) errors.weightKg = 'Between 30 and 300 kg.'
  if (a.bodyFatPct != null && (a.bodyFatPct < 3 || a.bodyFatPct > 70)) errors.bodyFatPct = 'Between 3 and 70%, or leave it empty.'
  return { ok: Object.keys(errors).length === 0, errors }
}
