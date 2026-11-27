// Open Food Facts, asked only by barcode (its documentation warns against
// search-as-you-type). No key is needed; reads are limited to 15 a minute per IP.

import { z } from 'zod'
import type { Nutrients, Serving } from '../db'
import type { NewFood } from '../store/foods'

const FIELDS = [
  'code',
  'product_name',
  'product_name_de',
  'product_name_en',
  'generic_name',
  'brands',
  'quantity',
  'serving_size',
  'serving_quantity',
  'nutriments',
].join(',')

export const productUrl = (barcode: string) => `https://world.openfoodfacts.org/api/v3/product/${barcode}.json?fields=${FIELDS}`

const numberish = z.union([z.number(), z.string()]).optional().nullable()

const productSchema = z.looseObject({
  code: z.string().optional(),
  product_name: z.string().optional().nullable(),
  product_name_de: z.string().optional().nullable(),
  product_name_en: z.string().optional().nullable(),
  generic_name: z.string().optional().nullable(),
  brands: z.string().optional().nullable(),
  quantity: z.string().optional().nullable(),
  serving_size: z.string().optional().nullable(),
  serving_quantity: numberish,
  nutriments: z.record(z.string(), z.unknown()).optional().nullable(),
})

const responseSchema = z.looseObject({
  status: z.string().optional(),
  product: productSchema.optional().nullable(),
  result: z.looseObject({ id: z.string().optional() }).optional().nullable(),
})

export type OffResult =
  | { status: 'found'; food: NewFood }
  | { status: 'incomplete'; partial: { barcode: string; name?: string; brand?: string } }
  | { status: 'notFound' }
  | { status: 'error'; message: string }

function toNumber(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(',', '.'))
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d

/** Maps an Open Food Facts product to a food. Returns null without usable energy and macros. */
export function mapProduct(raw: unknown, barcode: string): { food: NewFood | null; name?: string; brand?: string } {
  const parsed = productSchema.safeParse(raw)
  if (!parsed.success) return { food: null }
  const p = parsed.data
  const name = [p.product_name, p.product_name_de, p.product_name_en, p.generic_name].map((s) => s?.trim()).find((s) => s) ?? undefined
  const brand = p.brands?.split(',')[0]?.trim() || undefined
  const n = p.nutriments ?? {}
  const get = (key: string) => toNumber(n[`${key}_100g`])

  let kcal = get('energy-kcal')
  if (kcal == null) {
    const kj = get('energy-kj') ?? get('energy')
    if (kj != null) kcal = kj / 4.184
  }
  const protein = get('proteins')
  const carbs = get('carbohydrates')
  const fat = get('fat')
  if (kcal == null || protein == null || carbs == null || fat == null) return { food: null, name, brand }

  const per100: Nutrients = { kcal: Math.round(kcal), protein: round(protein), carbs: round(carbs), fat: round(fat) }
  const fibre = get('fiber')
  const sugar = get('sugars')
  const satFat = get('saturated-fat')
  let salt = get('salt')
  if (salt == null) {
    const sodium = get('sodium')
    if (sodium != null) salt = sodium * 2.5
  }
  if (fibre != null) per100.fibre = round(fibre)
  if (sugar != null) per100.sugar = round(sugar)
  if (satFat != null) per100.satFat = round(satFat)
  if (salt != null) per100.salt = round(salt, 2)

  const servings: Serving[] = []
  const servingG = toNumber(p.serving_quantity)
  if (servingG && servingG > 0) servings.push({ name: p.serving_size?.trim() || '1 serving', grams: round(servingG) })
  const pack = p.quantity?.match(/(\d+(?:[.,]\d+)?)\s*(g|ml)\b/i)
  if (pack) {
    const grams = Number(pack[1].replace(',', '.'))
    if (grams > 0 && !servings.some((s) => s.grams === grams)) servings.push({ name: `Whole pack (${p.quantity?.trim()})`, grams })
  }

  return {
    name,
    brand,
    food: {
      name: name ?? `Product ${barcode}`,
      ...(brand ? { brand } : {}),
      barcode,
      source: 'off',
      per100,
      servings,
    },
  }
}

export async function fetchProduct(barcode: string, fetchImpl: typeof fetch = fetch, signal?: AbortSignal): Promise<OffResult> {
  let res: Response
  try {
    res = await fetchImpl(productUrl(barcode), { headers: { Accept: 'application/json' }, signal })
  } catch (e) {
    if ((e as Error).name === 'AbortError') return { status: 'error', message: 'Abfrage abgebrochen.' }
    return { status: 'error', message: 'Keine Verbindung zu Open Food Facts. Netz prüfen oder das Produkt vom Etikett eintragen.' }
  }
  if (res.status === 404) return { status: 'notFound' }
  if (res.status === 429) return { status: 'error', message: 'Open Food Facts bremst gerade Anfragen. In einer Minute nochmal versuchen.' }
  if (!res.ok) return { status: 'error', message: `Open Food Facts antwortet mit HTTP ${res.status}.` }

  let body: unknown
  try {
    body = await res.json()
  } catch {
    return { status: 'error', message: 'Open Food Facts hat unlesbar geantwortet.' }
  }
  const parsed = responseSchema.safeParse(body)
  if (!parsed.success) return { status: 'error', message: 'Open Food Facts hat unerwartet geantwortet.' }
  const { product, result, status } = parsed.data
  if (!product || result?.id === 'product_not_found' || status === 'failure') return { status: 'notFound' }
  const mapped = mapProduct(product, barcode)
  if (!mapped.food) return { status: 'incomplete', partial: { barcode, name: mapped.name, brand: mapped.brand } }
  return { status: 'found', food: mapped.food }
}
