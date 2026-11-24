// Numbers follow the phone's locale so they match its decimal keypad
// (a German-language iPhone shows "72,5"); the interface text is English.

const locale = typeof navigator !== 'undefined' ? navigator.language : 'en-GB'

const intFmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 })
const oneFmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
const twoFmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 })

export const fmtInt = (n: number) => intFmt.format(Math.round(n))
export const fmt1 = (n: number) => oneFmt.format(n)
export const fmt2 = (n: number) => twoFmt.format(n)

/** Accepts "72,5", "72.5", " 72 " and returns null for anything that is not a finite number. */
export function parseDecimal(input: string): number | null {
  const s = input.trim().replace(/\s/g, '').replace(',', '.')
  if (s === '' || s === '.' || s === '-') return null
  if (!/^-?\d*\.?\d*$/.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export function fmtDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

export function fmtWeight(kg: number): string {
  return `${fmt2(kg)} kg`
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${fmtInt(n)} ${n === 1 ? one : many}`
}
