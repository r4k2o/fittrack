// Apple's "Export All Health Data" gives one very large XML file (inside a zip). This
// reduces it, streaming, to the same plain lines the Shortcut writes: daily steps per
// source, weight and body-fat readings, sleep stage segments and workouts. It runs in
// a desktop browser for a one-time backfill; the phone then imports the small result.

import { Unzip, UnzipInflate } from 'fflate'

export interface ReduceCounts {
  stepDays: number
  weights: number
  bodyFat: number
  sleepSegments: number
  workouts: number
}

const TAG = /<(Record|Workout|WorkoutStatistics)\s([^>]*?)(\/?)>|<\/Workout>/g
const ATTR = /(\w+)="([^"]*)"/g

function attrs(s: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of s.matchAll(ATTR)) out[m[1]] = m[2].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  return out
}

const clean = (s: string) => s.replace(/[;\r\n]/g, ',')

/** "2026-11-16 07:02:11 +0100" → "2026-11-16" (the date as written, which is local time). */
const datePart = (s: string) => s.slice(0, 10)

function toKm(value: number, unit: string | undefined): number | null {
  if (!Number.isFinite(value)) return null
  switch ((unit ?? 'km').toLowerCase()) {
    case 'km':
      return value
    case 'm':
      return value / 1000
    case 'mi':
      return value * 1.609344
    case 'yd':
      return value * 0.0009144
    default:
      return null
  }
}

function toKcal(value: number, unit: string | undefined): number | null {
  if (!Number.isFinite(value)) return null
  const u = (unit ?? 'kcal').toLowerCase()
  if (u === 'kcal' || u === 'cal') return value
  if (u === 'kj') return value / 4.184
  return null
}

export class AppleExportReducer {
  private buffer = ''
  private steps = new Map<string, Map<string, number>>()
  private workout: { a: Record<string, string>; kcal: number | null; km: number | null } | null = null
  readonly lines: string[] = []
  readonly counts: ReduceCounts = { stepDays: 0, weights: 0, bodyFat: 0, sleepSegments: 0, workouts: 0 }

  /** Only records that start on or after this date (YYYY-MM-DD) are kept. */
  private readonly since: string

  constructor(since = '0000-00-00') {
    this.since = since
  }

  feed(chunk: string): void {
    this.buffer += chunk
    const lastLt = this.buffer.lastIndexOf('<')
    const open = lastLt >= 0 && this.buffer.indexOf('>', lastLt) === -1
    const end = open ? lastLt : this.buffer.length
    const work = this.buffer.slice(0, end)
    for (const m of work.matchAll(TAG)) {
      if (m[0] === '</Workout>') this.closeWorkout()
      else this.tag(m[1], attrs(m[2]), m[3] === '/')
    }
    this.buffer = this.buffer.slice(end)
  }

  private tag(name: string, a: Record<string, string>, selfClosing: boolean) {
    if (name === 'WorkoutStatistics') {
      if (!this.workout) return
      const sum = Number(a.sum)
      if (a.type === 'HKQuantityTypeIdentifierActiveEnergyBurned') this.workout.kcal = toKcal(sum, a.unit) ?? this.workout.kcal
      else if (a.type?.startsWith('HKQuantityTypeIdentifierDistance')) this.workout.km = toKm(sum, a.unit) ?? this.workout.km
      return
    }
    if (!a.startDate || datePart(a.startDate) < this.since) {
      if (name === 'Workout' && !selfClosing) this.workout = null
      return
    }
    if (name === 'Workout') {
      this.workout = {
        a,
        kcal: a.totalEnergyBurned ? toKcal(Number(a.totalEnergyBurned), a.totalEnergyBurnedUnit) : null,
        km: a.totalDistance ? toKm(Number(a.totalDistance), a.totalDistanceUnit) : null,
      }
      if (selfClosing) this.closeWorkout()
      return
    }
    switch (a.type) {
      case 'HKQuantityTypeIdentifierStepCount': {
        const day = datePart(a.startDate)
        const source = clean(a.sourceName ?? '')
        const bySource = this.steps.get(day) ?? new Map<string, number>()
        bySource.set(source, (bySource.get(source) ?? 0) + (Number(a.value) || 0))
        this.steps.set(day, bySource)
        break
      }
      case 'HKQuantityTypeIdentifierBodyMass': {
        const v = Number(a.value)
        if (!Number.isFinite(v)) break
        const kg = (a.unit ?? 'kg').toLowerCase() === 'lb' ? v * 0.45359237 : v
        this.lines.push(`weight;${a.startDate};${Math.round(kg * 100) / 100}`)
        this.counts.weights++
        break
      }
      case 'HKQuantityTypeIdentifierBodyFatPercentage': {
        const v = Number(a.value)
        if (!Number.isFinite(v)) break
        this.lines.push(`bodyfat;${a.startDate};${v}`)
        this.counts.bodyFat++
        break
      }
      case 'HKCategoryTypeIdentifierSleepAnalysis': {
        if (!a.endDate || !a.value) break
        this.lines.push(`sleep;${a.startDate};${a.endDate};${a.value}`)
        this.counts.sleepSegments++
        break
      }
    }
  }

  private closeWorkout() {
    const w = this.workout
    this.workout = null
    if (!w || !w.a.endDate) return
    const kcal = w.kcal != null ? Math.round(w.kcal) : ''
    const km = w.km != null ? Math.round(w.km * 100) / 100 : ''
    this.lines.push(`workout;${w.a.startDate};${w.a.endDate};${clean(w.a.workoutActivityType ?? 'Other')};${kcal};${km}`)
    this.counts.workouts++
  }

  /** The finished line file. */
  finish(): string {
    this.feed('')
    const stepLines: string[] = []
    for (const [day, bySource] of [...this.steps.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      for (const [source, sum] of bySource) stepLines.push(`steps;${day};${Math.round(sum)}${source ? `;${source}` : ''}`)
    }
    this.counts.stepDays = this.steps.size
    return ['# Fittrack Health import, reduced from Apple Health export.xml', ...stepLines, ...this.lines].join('\n') + '\n'
  }
}

/**
 * Streams an export.zip (or a bare export.xml) through the reducer. `onProgress` gets
 * the share of the file read so far.
 */
export async function reduceAppleExport(file: Blob & { name?: string }, opts: { since?: string; onProgress?: (fraction: number) => void } = {}): Promise<{ text: string; counts: ReduceCounts }> {
  const reducer = new AppleExportReducer(opts.since)
  const decoder = new TextDecoder()
  const reader = file.stream().getReader()
  const total = file.size || 1
  let read = 0
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer())
  const isZip = head[0] === 0x50 && head[1] === 0x4b

  if (isZip) {
    let found = false
    let failed: Error | null = null
    const unzip = new Unzip((entry) => {
      if (!/(^|\/)export\.xml$/.test(entry.name)) return
      found = true
      entry.ondata = (err, data, final) => {
        if (err) {
          failed = err
          return
        }
        reducer.feed(decoder.decode(data, { stream: !final }))
      }
      entry.start()
    })
    unzip.register(UnzipInflate)
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      read += value.length
      unzip.push(value, false)
      if (failed) throw failed
      opts.onProgress?.(read / total)
    }
    unzip.push(new Uint8Array(0), true)
    if (failed) throw failed
    if (!found) throw new Error('No export.xml in this zip. Use the export.zip from Health → profile picture → Export All Health Data.')
  } else {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      read += value.length
      reducer.feed(decoder.decode(value, { stream: true }))
      opts.onProgress?.(read / total)
    }
    reducer.feed(decoder.decode())
  }
  const text = reducer.finish()
  return { text, counts: reducer.counts }
}
