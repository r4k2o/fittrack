// Days are local YYYY-MM-DD strings; timestamps are UTC ISO strings.

const pad = (n: number) => String(n).padStart(2, '0')

export function localDay(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(day: string, n: number): string {
  const d = parseDay(day)
  d.setDate(d.getDate() + n)
  return localDay(d)
}

/** Whole days from a to b (b − a). Uses noon to stay clear of DST shifts. */
export function daysBetween(a: string, b: string): number {
  const da = parseDay(a)
  const db = parseDay(b)
  da.setHours(12)
  db.setHours(12)
  return Math.round((db.getTime() - da.getTime()) / 86_400_000)
}

/** Monday of the ISO week containing `day`. */
export function weekStart(day: string): string {
  const d = parseDay(day)
  const dow = (d.getDay() + 6) % 7 // Monday = 0
  return addDays(day, -dow)
}

/** ISO 8601 week label such as 2026-W48. */
export function isoWeek(day: string): string {
  const d = parseDay(day)
  // The Thursday of a week decides which year the week belongs to.
  const thursday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 3 - ((d.getDay() + 6) % 7), 12)
  const year = thursday.getFullYear()
  const jan4 = new Date(year, 0, 4, 12)
  const week1Thursday = new Date(year, 0, 4 + 3 - ((jan4.getDay() + 6) % 7), 12)
  const week = 1 + Math.round((thursday.getTime() - week1Thursday.getTime()) / (7 * 86_400_000))
  return `${year}-W${pad(week)}`
}

export function ageOn(birthDate: string, onDay: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number)
  const [y, m, d] = onDay.split('-').map(Number)
  let age = y - by
  if (m < bm || (m === bm && d < bd)) age -= 1
  return age
}

export function nowIso(): string {
  return new Date().toISOString()
}

const longFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })
const shortFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })
const dayMonthFmt = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short' })
const dateFmt = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })

/** "Freitag, 27. November" */
export function formatDayLong(day: string): string {
  return longFmt.format(parseDay(day))
}

/** "Fr., 27. Nov." */
export function formatDayShort(day: string): string {
  return shortFmt.format(parseDay(day))
}

/** "27. Nov." */
export function formatDayMonth(day: string): string {
  return dayMonthFmt.format(parseDay(day))
}

/** "27. Nov. 2026" */
export function formatDate(day: string): string {
  return dateFmt.format(parseDay(day))
}

/** "Heute", "Gestern", "Morgen" or a short date. */
export function relativeDay(day: string, today: string = localDay()): string {
  const diff = daysBetween(today, day)
  if (diff === 0) return 'Heute'
  if (diff === -1) return 'Gestern'
  if (diff === 1) return 'Morgen'
  return formatDayShort(day)
}
