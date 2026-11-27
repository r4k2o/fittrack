// Apple Health arrives as a file: an Apple Shortcut writes plain lines, one per sample
// or day, and the app parses them. The parser is tolerant: ";", "," or tab between
// fields, ISO or day-first dates, decimal commas, units after the numbers, English or
// German sleep stages. It returns one value per day and metric, sleep nights filed
// under the wake-up date, workouts, and every line it could not use with a reason.
//
//   steps;2026-11-16;8423[;source]       daily total (per-source totals: the largest wins)
//   weight;2026-11-16 07:02;80.4         first reading of the day; "lb" is converted
//   bodyfat;2026-11-16;0.182             fraction or percent; latest reading of the day
//   sleep;2026-11-15 23:41;2026-11-16 07:02;Core     one line per stage segment
//   workout;2026-11-16 07:00;2026-11-16 07:45;Running;420;8.1    kcal and km optional
//   sleepscore;2026-11-16;84             a score typed in from the Health app

import type { CardioType } from '../db'
import { addDays, localDay } from './dates'
import { parseLocaleNumber } from './foodImport'

export type HealthMetric = 'steps' | 'weight' | 'bodyFat' | 'sleepMin' | 'sleepScore'

export interface DayMetric {
  type: HealthMetric
  date: string
  value: number
}

export type SleepStage = 'inBed' | 'awake' | 'core' | 'deep' | 'rem' | 'asleep'

export interface SleepSegment {
  start: Date
  end: Date
  stage: SleepStage
}

export interface Night {
  /** The wake-up date the night is filed under. */
  date: string
  asleepMin: number
  /** First asleep moment and last one, for bedtime regularity. */
  sleepStart: Date
  sleepEnd: Date
  /** Awake stretches between the first and last asleep moment. */
  interruptions: number
}

export interface HealthWorkout {
  externalId: string
  date: string
  startedAt: string
  durationMin: number
  type: CardioType
  kcal: number | null
  distanceKm: number | null
}

export interface ParsedHealth {
  metrics: DayMetric[]
  nights: Night[]
  workouts: HealthWorkout[]
  skipped: { line: number; text: string; reason: string }[]
  /** Strength workouts are logged in the app itself, so the import leaves them out. */
  strengthWorkouts: number
  fromDate: string | null
  toDate: string | null
}

// ---- dates and numbers -----------------------------------------------------------------

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, mär: 3, mrz: 3, apr: 4, may: 5, mai: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, okt: 10, nov: 11, dec: 12, dez: 12,
}

/**
 * Reads the date (and time, if any) in an ISO string, "16.11.2026, 07:02",
 * "16/11/2026 07:02", "2026-11-16 07:02:11 +0100" or "16 Nov 2026 at 07:02".
 * Without an offset the time is local.
 */
export function parseHealthDate(raw: string): Date | null {
  const s = raw.trim().replace(/\s+at\s+|\s+um\s+|,\s*/gi, ' ')
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/)
  if (m) {
    const [, y, mo, d, h = '0', mi = '0', se = '0', tz] = m
    if (tz) {
      const off = tz === 'Z' ? 'Z' : `${tz.slice(0, 3)}:${tz.slice(-2)}`
      const iso = `${y}-${mo}-${d}T${h.padStart(2, '0')}:${mi}:${se.padStart(2, '0')}${off}`
      const dt = new Date(iso)
      return Number.isNaN(dt.getTime()) ? null : dt
    }
    return validLocal(+y, +mo, +d, +h, +mi, +se)
  }
  m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (m) return validLocal(+m[3], +m[2], +m[1], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0))
  m = s.match(/^(\d{1,2})\.?\s+([A-Za-zäÄ]{3})[a-zäÄ]*\.?\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?)?$/)
  if (m) {
    const mo = MONTHS[m[2].toLowerCase()]
    if (mo) return validLocal(+m[3], mo, +m[1], hour24(+(m[4] ?? 0), m[6]), +(m[5] ?? 0), 0)
  }
  // US order: "Nov 16 2026 7:02 AM" (the comma is already gone)
  m = s.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?)?$/)
  if (m) {
    const mo = MONTHS[m[1].toLowerCase()]
    if (mo) return validLocal(+m[3], mo, +m[2], hour24(+(m[4] ?? 0), m[6]), +(m[5] ?? 0), 0)
  }
  return null
}

function hour24(h: number, ampm?: string): number {
  if (!ampm) return h
  const pm = ampm.toLowerCase() === 'pm'
  return h === 12 ? (pm ? 12 : 0) : pm ? h + 12 : h
}

function validLocal(y: number, mo: number, d: number, h: number, mi: number, s: number): Date | null {
  const dt = new Date(y, mo - 1, d, h, mi, s)
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d ? dt : null
}

/** "80,4 kg" → 80.4; "8 423" → 8423; "176 lb" → 79.8 when `lbToKg`; "8.423" → 8423 for counts. */
function parseValue(raw: string, opts: { lbToKg?: boolean; count?: boolean } = {}): number | null {
  const text = raw.trim().toLowerCase()
  const lb = /\b(lb|lbs|pound|pounds)\b/.test(text)
  let digits = text.replace(/[^\d.,\-\s]/g, '').trim().replace(/\s+/g, '')
  if (opts.count && /^\d{1,3}([.,]\d{3})+$/.test(digits)) digits = digits.replace(/[.,]/g, '')
  const num = parseLocaleNumber(digits)
  if (num == null || !Number.isFinite(num)) return null
  return lb && opts.lbToKg ? num * 0.45359237 : num
}

const STAGES: [RegExp, SleepStage][] = [
  [/^(inbed|imbett)$/, 'inBed'],
  [/^(awake|wach|hkcategoryvaluesleepanalysisawake)$/, 'awake'],
  [/^(core|kern|asleepcore|kernschlaf|hkcategoryvaluesleepanalysisasleepcore)$/, 'core'],
  [/^(deep|tief|asleepdeep|tiefschlaf|hkcategoryvaluesleepanalysisasleepdeep)$/, 'deep'],
  [/^(rem|asleeprem|remschlaf|hkcategoryvaluesleepanalysisasleeprem)$/, 'rem'],
  [/^(asleep|schlafend|schlaf|asleepunspecified|unspecified|hkcategoryvaluesleepanalysisasleep|hkcategoryvaluesleepanalysisasleepunspecified)$/, 'asleep'],
  [/^(hkcategoryvaluesleepanalysisinbed)$/, 'inBed'],
]

export function sleepStage(raw: string): SleepStage | null {
  const k = raw.toLowerCase().replace(/[^a-zäöü]/g, '')
  for (const [re, stage] of STAGES) if (re.test(k)) return stage
  return null
}

const WORKOUT_TYPES: [RegExp, CardioType | 'strength'][] = [
  [/strength|kraft|weightlifting|gewichtheben/, 'strength'],
  [/run|lauf|jog/, 'run'],
  [/cycl|bik|rad|spin/, 'cycle'],
  [/row|rud/, 'row'],
  [/swim|schwimm/, 'swim'],
  [/walk|hik|geh|wander/, 'walk'],
  [/ellipt|crosstrainer/, 'elliptical'],
  [/stair|trepp|step/, 'stairs'],
  [/soccer|football|fußball|fussball|basketball|tennis|squash|badminton|volley|handball|hockey|rugby|padel|sport/, 'sport'],
]

export function workoutType(raw: string): CardioType | 'strength' {
  const k = raw.toLowerCase().replace(/^hkworkoutactivitytype/, '')
  for (const [re, t] of WORKOUT_TYPES) if (re.test(k)) return t
  return 'other'
}

// ---- parsing ---------------------------------------------------------------------------

const KIND: Record<string, 'steps' | 'weight' | 'bodyFat' | 'sleep' | 'workout' | 'sleepScore'> = {
  steps: 'steps', schritte: 'steps', stepcount: 'steps',
  weight: 'weight', gewicht: 'weight', bodymass: 'weight',
  bodyfat: 'bodyFat', körperfett: 'bodyFat', korperfett: 'bodyFat', bodyfatpercentage: 'bodyFat', fat: 'bodyFat',
  sleep: 'sleep', schlaf: 'sleep', sleepanalysis: 'sleep',
  workout: 'workout', training: 'workout',
  sleepscore: 'sleepScore', schlafwert: 'sleepScore',
}

function splitLine(line: string): string[] {
  const sep = line.includes(';') ? ';' : line.includes('\t') ? '\t' : ','
  return line.split(sep).map((x) => x.trim().replace(/^"(.*)"$/, '$1'))
}

/** A stable id for a workout, so importing the same period twice adds nothing. */
function workoutId(start: Date, type: string): string {
  return `health:${start.toISOString().slice(0, 16)}:${type}`
}

export function parseHealthLines(text: string): ParsedHealth {
  const skipped: ParsedHealth['skipped'] = []
  const steps = new Map<string, Map<string, number>>() // date → source → sum
  const weights = new Map<string, { at: number; order: number; value: number }>()
  const fats = new Map<string, { at: number; order: number; value: number }>()
  const scores = new Map<string, number>()
  const segments: SleepSegment[] = []
  const workouts = new Map<string, HealthWorkout>()
  let strength = 0
  let order = 0

  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  lines.forEach((raw, i) => {
    const line = raw.trim()
    if (!line || line.startsWith('#')) return
    const parts = splitLine(line)
    const kind = KIND[parts[0].toLowerCase().replace(/[^a-zäöü]/g, '')]
    const skip = (reason: string) => skipped.push({ line: i + 1, text: line.slice(0, 80), reason })
    if (!kind) {
      if (i === 0 && /type|metric|typ/i.test(parts[0])) return // a header row
      return skip('unbekannter Wert')
    }
    order++
    if (kind === 'sleep') {
      const start = parseHealthDate(parts[1] ?? '')
      const end = parseHealthDate(parts[2] ?? '')
      const stage = sleepStage(parts[3] ?? 'asleep')
      if (!start || !end) return skip('Datum nicht lesbar')
      if (!stage) return skip('Schlafphase unbekannt')
      if (end <= start || end.getTime() - start.getTime() > 24 * 3600e3) return skip('Schlafabschnitt endet vor dem Start oder dauert über 24 h')
      segments.push({ start, end, stage })
      return
    }
    if (kind === 'workout') {
      const start = parseHealthDate(parts[1] ?? '')
      const end = parseHealthDate(parts[2] ?? '')
      if (!start || !end || end <= start) return skip('Trainingszeiten nicht lesbar')
      const t = workoutType(parts[3] ?? '')
      if (t === 'strength') {
        strength++
        return
      }
      const kcal = parts[4] ? parseValue(parts[4]) : null
      const km = parts[5] ? parseValue(parts[5]) : null
      const id = workoutId(start, t)
      workouts.set(id, {
        externalId: id,
        date: localDay(start),
        startedAt: start.toISOString(),
        durationMin: Math.round((end.getTime() - start.getTime()) / 60000),
        type: t,
        kcal: kcal != null && kcal > 0 ? Math.round(kcal) : null,
        distanceKm: km != null && km > 0 ? Math.round(km * 100) / 100 : null,
      })
      return
    }
    const at = parseHealthDate(parts[1] ?? '')
    if (!at) return skip('Datum nicht lesbar')
    const date = localDay(at)
    const value = parseValue(parts[2] ?? '', { lbToKg: kind === 'weight', count: kind === 'steps' })
    if (value == null) return skip('Wert nicht lesbar')
    if (kind === 'steps') {
      if (value < 0 || value > 200000) return skip('Schritte außerhalb des Bereichs')
      const source = parts[3] ?? ''
      const bySource = steps.get(date) ?? new Map<string, number>()
      bySource.set(source, (bySource.get(source) ?? 0) + value)
      steps.set(date, bySource)
    } else if (kind === 'weight') {
      if (value < 20 || value > 400) return skip('Gewicht außerhalb des Bereichs')
      const prev = weights.get(date)
      // first reading of the day: earliest time, or the first line when times tie
      if (!prev || at.getTime() < prev.at) weights.set(date, { at: at.getTime(), order, value })
    } else if (kind === 'bodyFat') {
      const pct = value <= 1 ? value * 100 : value
      if (pct < 2 || pct > 70) return skip('Körperfett außerhalb des Bereichs')
      const prev = fats.get(date)
      if (!prev || at.getTime() >= prev.at) fats.set(date, { at: at.getTime(), order, value: pct })
    } else if (kind === 'sleepScore') {
      if (value < 0 || value > 100) return skip('Wert außerhalb des Bereichs')
      scores.set(date, value)
    }
  })

  const metrics: DayMetric[] = []
  for (const [date, bySource] of steps) metrics.push({ type: 'steps', date, value: Math.round(Math.max(...bySource.values())) })
  for (const [date, w] of weights) metrics.push({ type: 'weight', date, value: Math.round(w.value * 100) / 100 })
  for (const [date, f] of fats) metrics.push({ type: 'bodyFat', date, value: Math.round(f.value * 10) / 10 })
  for (const [date, v] of scores) metrics.push({ type: 'sleepScore', date, value: Math.round(v) })
  const nights = sleepNights(segments)
  for (const n of nights) metrics.push({ type: 'sleepMin', date: n.date, value: Math.round(n.asleepMin) })
  metrics.sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type))

  const dates = [...metrics.map((m) => m.date), ...[...workouts.values()].map((w) => w.date)].sort()
  return {
    metrics,
    nights,
    workouts: [...workouts.values()].sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
    skipped,
    strengthWorkouts: strength,
    fromDate: dates[0] ?? null,
    toDate: dates.at(-1) ?? null,
  }
}

// ---- sleep -----------------------------------------------------------------------------

const ASLEEP: ReadonlySet<SleepStage> = new Set(['core', 'deep', 'rem', 'asleep'])

/** Merges overlapping intervals (iPhone and Watch can both record the same night). */
function merge(intervals: [number, number][]): [number, number][] {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0])
  const out: [number, number][] = []
  for (const iv of sorted) {
    const last = out.at(-1)
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1])
    else out.push([iv[0], iv[1]])
  }
  return out
}

/**
 * Groups segments into nights, each filed under its wake-up date: a segment belongs
 * to the day its end falls on six hours later, so a night that ends before midnight
 * still counts for the next morning and an afternoon nap for its own day.
 */
export function sleepNights(segments: readonly SleepSegment[]): Night[] {
  const byDay = new Map<string, SleepSegment[]>()
  for (const s of segments) {
    const day = localDay(new Date(s.end.getTime() + 6 * 3600e3))
    byDay.set(day, [...(byDay.get(day) ?? []), s])
  }
  const nights: Night[] = []
  for (const [date, list] of byDay) {
    // Nights recorded by an iPhone alone may only have "in bed"; use that when nothing else is there.
    const sleepStages = list.some((s) => ASLEEP.has(s.stage)) ? list.filter((s) => ASLEEP.has(s.stage)) : list.filter((s) => s.stage === 'inBed')
    const asleep = merge(sleepStages.map((s) => [s.start.getTime(), s.end.getTime()]))
    if (!asleep.length) continue
    const minutes = asleep.reduce((n, [a, b]) => n + (b - a) / 60000, 0)
    const first = asleep[0][0]
    const last = asleep[asleep.length - 1][1]
    const awake = merge(list.filter((s) => s.stage === 'awake').map((s) => [s.start.getTime(), s.end.getTime()])).filter(([a, b]) => a >= first && b <= last)
    // gaps between asleep stretches count as interruptions when no awake stage covers them
    const gaps = asleep.slice(1).filter((iv, i) => iv[0] - asleep[i][1] >= 60000 && !awake.some(([a, b]) => a <= iv[0] && b >= asleep[i][1]))
    nights.push({ date, asleepMin: minutes, sleepStart: new Date(first), sleepEnd: new Date(last), interruptions: awake.length + gaps.length })
  }
  return nights.sort((a, b) => a.date.localeCompare(b.date))
}

/** Minutes after 18:00 of the evening before, so bedtimes around midnight compare well. */
function bedtimeMinutes(d: Date): number {
  const m = d.getHours() * 60 + d.getMinutes()
  return m >= 18 * 60 ? m - 18 * 60 : m + 6 * 60
}

/**
 * The app's own sleep score, 0–100: duration up to 60 points (7.5 hours or more is
 * full marks), bedtime regularity up to 20 (against the median of the previous seven
 * nights; 90 minutes off is zero) and interruptions up to 20 (5 off for each).
 * Apple's score has no API, so charts say which score they show.
 */
export function sleepScore(night: Night, previous: readonly Night[]): number {
  const duration = 60 * Math.min(1, night.asleepMin / 450)
  const prior = previous
    .filter((n) => n.date < night.date && n.date >= addDays(night.date, -7))
    .map((n) => bedtimeMinutes(n.sleepStart))
    .sort((a, b) => a - b)
  let regularity = 20
  if (prior.length >= 3) {
    const median = prior[Math.floor(prior.length / 2)]
    regularity = 20 * Math.max(0, 1 - Math.abs(bedtimeMinutes(night.sleepStart) - median) / 90)
  }
  const interruptions = Math.max(0, 20 - 5 * night.interruptions)
  return Math.round(duration + regularity + interruptions)
}
