// Food-list import: a CSV (or JSON) export of a food table such as BLS 4.0 or USDA
// FoodData Central becomes the built-in list. Columns are guessed from English and
// German headers and common nutrient codes; the import screen shows the guess and
// lets every column be changed before anything is written.

import type { Nutrients } from '../db'
import type { ListFood } from '../store/foods'
import { parseDelimited } from './csv'
import { checkEnergy } from './macros'
import { normalizeTerm } from './foodSearch'

export type FieldKey = 'key' | 'name' | 'kcal' | 'kj' | 'protein' | 'carbs' | 'fat' | 'fibre' | 'sugar' | 'satFat' | 'salt' | 'sodium'

export const FIELDS: readonly FieldKey[] = ['name', 'kcal', 'kj', 'protein', 'carbs', 'fat', 'fibre', 'sugar', 'satFat', 'salt', 'sodium', 'key']

export const FIELD_LABEL: Record<FieldKey, string> = {
  key: 'Code (optional)',
  name: 'Name',
  kcal: 'Energy, kcal',
  kj: 'Energy, kJ (if no kcal)',
  protein: 'Protein, g',
  carbs: 'Carbohydrate, g',
  fat: 'Fat, g',
  fibre: 'Fibre, g',
  sugar: 'Sugar, g',
  satFat: 'Saturated fat, g',
  salt: 'Salt, g',
  sodium: 'Sodium (if no salt)',
}

const ALIASES: Record<FieldKey, string[]> = {
  key: ['code', 'id', 'key', 'sbls', 'bls code', 'bls-code', 'blscode', 'bls', 'fdc_id', 'fdc id', 'ndb_no', 'nummer', 'schluessel', 'schlussel'],
  name: ['name', 'food', 'food name', 'bezeichnung', 'lebensmittel', 'lebensmittelbezeichnung', 'description', 'st', 'name deutsch', 'name de', 'produkt', 'text'],
  kcal: ['kcal', 'energy kcal', 'energy (kcal)', 'energie kcal', 'energie (kcal)', 'enercc', 'gcal', 'calories', 'energy_kcal', 'kalorien', 'brennwert kcal', 'energie in kcal'],
  kj: ['kj', 'energy kj', 'energy (kj)', 'energie kj', 'energie (kj)', 'enercj', 'gj', 'energy_kj', 'brennwert kj', 'energie in kj'],
  protein: ['protein', 'proteins', 'eiweiss', 'eiweis', 'prot', 'ze', 'protein (g)', 'eiweiss (g)'],
  carbs: ['carbohydrate', 'carbohydrates', 'carbs', 'kohlenhydrate', 'cho', 'choavl', 'zk', 'carbohydrate, by difference', 'kohlenhydrate, verfugbar', 'kohlenhydrate verfugbar'],
  fat: ['fat', 'fett', 'fat total', 'total fat', 'total lipid (fat)', 'zf', 'fett gesamt'],
  fibre: ['fibre', 'fiber', 'ballaststoffe', 'fibt', 'zb', 'fiber, total dietary', 'dietary fiber', 'ballaststoffe gesamt'],
  sugar: ['sugar', 'sugars', 'zucker', 'sugars, total', 'zucker gesamt', 'sugar total'],
  satFat: ['saturated fat', 'saturated', 'satfat', 'sat fat', 'gesattigte fettsauren', 'fasat', 'fatty acids, total saturated', 'davon gesattigte fettsauren', 'gesattigte fs'],
  salt: ['salt', 'salz', 'nacl', 'kochsalz', 'speisesalz'],
  sodium: ['sodium', 'natrium', 'na', 'mna', 'sodium, na'],
}

export type ColumnMap = Partial<Record<FieldKey, number>>

const clean = (h: string) => normalizeTerm(h).replace(/\s+/g, ' ').trim()
const stripUnit = (h: string) => clean(h).replace(/\s*[[(].*?[\])]\s*/g, ' ').replace(/\b(in )?(g|mg|kcal|kj)\s*(\/|je|per|pro)?\s*100\s*g\b/g, '').trim()

/** Guesses which column holds which value. Exact header matches win over prefix matches. */
export function detectColumns(header: readonly string[]): ColumnMap {
  const map: ColumnMap = {}
  const used = new Set<number>()
  const variants = header.map((h) => [clean(h), stripUnit(h)])
  for (const pass of ['exact', 'prefix'] as const) {
    for (const field of FIELDS) {
      if (map[field] != null) continue
      const aliases = ALIASES[field].map(clean)
      const idx = variants.findIndex(([full, bare], i) => {
        if (used.has(i)) return false
        return aliases.some((a) =>
          pass === 'exact' ? full === a || bare === a : (full.startsWith(`${a} `) || full.startsWith(`${a}(`) || full.startsWith(`${a},`)) && a.length >= 3,
        )
      })
      if (idx >= 0) {
        map[field] = idx
        used.add(idx)
      }
    }
  }
  // a kcal column makes the kJ column unnecessary, and salt makes sodium unnecessary
  if (map.kcal != null) delete map.kj
  if (map.salt != null) delete map.sodium
  return map
}

/** "3,5", "1.234,5", "1,234.5", "<0,1", "Sp." (trace) → numbers; "", "-", "n.a." → undefined. */
export function parseLocaleNumber(raw: string | undefined): number | undefined {
  if (raw == null) return undefined
  let s = raw.trim().toLowerCase()
  if (s === '' || s === '-' || s === '–' || s === 'n.a.' || s === 'na' || s === 'n/a') return undefined
  if (s === 'tr' || s === 'sp.' || s === 'sp' || s.startsWith('<')) return 0
  s = s.replace(/\s/g, '')
  if (s.includes(',') && s.includes('.')) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (s.includes(',')) s = s.replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}

export interface FoodTable {
  header: string[]
  rows: string[][]
  /** Line (CSV) or item number (JSON) of each row, for messages about skipped rows. */
  lines: number[]
  kind: 'csv' | 'json'
}

/** Reads a CSV/TSV text or a JSON array of objects into a header and rows. */
export function readFoodTable(text: string): FoodTable {
  const trimmed = text.replace(/^﻿/, '').trim()
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const parsed: unknown = JSON.parse(trimmed)
    const list = Array.isArray(parsed) ? parsed : (parsed as { foods?: unknown[] }).foods
    if (!Array.isArray(list)) throw new Error('The JSON file must hold a list of foods.')
    const flat = list.map((item) => flatten(item as Record<string, unknown>))
    const header = [...new Set(flat.flatMap((o) => Object.keys(o)))]
    return {
      kind: 'json',
      header,
      rows: flat.map((o) => header.map((h) => (o[h] == null ? '' : String(o[h])))),
      lines: flat.map((_, i) => i + 1),
    }
  }
  const { rows, lines } = parseDelimited(trimmed)
  if (rows.length < 2) throw new Error('The file needs a header row and at least one food.')
  return { kind: 'csv', header: rows[0].map((h) => h.trim()), rows: rows.slice(1), lines: lines.slice(1) }
}

/** Lifts nested objects such as per100 to the top level: { name, per100: { kcal } } → { name, kcal }. */
function flatten(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v as Record<string, unknown>))
    else out[k] = Array.isArray(v) ? v.join(' ') : v
  }
  return out
}

export interface MappedTable {
  foods: ListFood[]
  skipped: { row: number; reason: string }[]
  flagged: number
}

const slug = (s: string) =>
  normalizeTerm(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'food'

/** Turns rows into foods with values per 100 g, using the column map. */
export function mapFoodRows(table: FoodTable, map: ColumnMap): MappedTable {
  const foods: ListFood[] = []
  const skipped: MappedTable['skipped'] = []
  const keys = new Map<string, number>()
  let flagged = 0
  const mg = (field: FieldKey) => map[field] != null && /\bmg\b/i.test(table.header[map[field] as number] ?? '')
  const val = (row: string[], field: FieldKey) => {
    const i = map[field]
    if (i == null) return undefined
    const n = parseLocaleNumber(row[i])
    return n != null && mg(field) ? n / 1000 : n
  }

  table.rows.forEach((row, i) => {
    const line = table.lines[i] ?? i + 2
    const name = map.name != null ? (row[map.name] ?? '').trim() : ''
    if (!name) {
      skipped.push({ row: line, reason: 'no name' })
      return
    }
    let kcal = val(row, 'kcal')
    if (kcal == null) {
      const kj = val(row, 'kj')
      if (kj != null) kcal = kj / 4.184
    }
    const protein = val(row, 'protein')
    const carbs = val(row, 'carbs')
    const fat = val(row, 'fat')
    if (kcal == null || protein == null || carbs == null || fat == null) {
      skipped.push({ row: line, reason: 'energy, protein, carbohydrate or fat missing' })
      return
    }
    const r1 = (n: number) => Math.round(n * 10) / 10
    const per100: Nutrients = { kcal: Math.round(kcal), protein: r1(protein), carbs: r1(carbs), fat: r1(fat) }
    const fibre = val(row, 'fibre')
    const sugar = val(row, 'sugar')
    const satFat = val(row, 'satFat')
    let salt = val(row, 'salt')
    if (salt == null) {
      const sodium = val(row, 'sodium')
      if (sodium != null) salt = sodium * 2.5
    }
    if (fibre != null) per100.fibre = r1(fibre)
    if (sugar != null) per100.sugar = r1(sugar)
    if (satFat != null) per100.satFat = r1(satFat)
    if (salt != null) per100.salt = Math.round(salt * 100) / 100
    if (!checkEnergy(per100).ok) flagged += 1

    const rawKey = map.key != null ? (row[map.key] ?? '').trim() : ''
    let key = rawKey ? rawKey.replace(/[^\w.-]+/g, '_') : slug(name)
    const seen = keys.get(key) ?? 0
    keys.set(key, seen + 1)
    if (seen > 0) key = `${key}-${seen + 1}`
    foods.push({ key, name, per100 })
  })
  return { foods, skipped, flagged }
}

export function missingRequired(map: ColumnMap): FieldKey[] {
  const missing: FieldKey[] = []
  if (map.name == null) missing.push('name')
  if (map.kcal == null && map.kj == null) missing.push('kcal')
  for (const f of ['protein', 'carbs', 'fat'] as const) if (map[f] == null) missing.push(f)
  return missing
}
