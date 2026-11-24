import { describe, expect, it } from 'vitest'
import { fetchProduct, mapProduct, productUrl } from './openFoodFacts'

// Shaped like Open Food Facts API v3 answers (fields trimmed to what the app asks for).
const spread = {
  code: '3017624010701',
  product_name: 'Nuss-Nougat-Creme',
  brands: 'Brand A, Brand B',
  quantity: '400 g',
  serving_size: '15 g',
  serving_quantity: 15,
  nutriments: {
    'energy-kcal_100g': 539,
    'energy-kj_100g': 2252,
    proteins_100g: 6.3,
    carbohydrates_100g: 57.5,
    fat_100g: 30.9,
    'saturated-fat_100g': 10.6,
    sugars_100g: 56.3,
    salt_100g: 0.107,
  },
}

const fakeFetch = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

describe('Open Food Facts mapping', () => {
  it('maps per-100 g values, the first brand, a serving and the whole pack', () => {
    const { food } = mapProduct(spread, '3017624010701')
    expect(food).toEqual({
      name: 'Nuss-Nougat-Creme',
      brand: 'Brand A',
      barcode: '3017624010701',
      source: 'off',
      per100: { kcal: 539, protein: 6.3, carbs: 57.5, fat: 30.9, sugar: 56.3, satFat: 10.6, salt: 0.11 },
      servings: [
        { name: '15 g', grams: 15 },
        { name: 'Whole pack (400 g)', grams: 400 },
      ],
    })
  })

  it('converts kJ when kcal is missing and sodium when salt is missing', () => {
    const { food } = mapProduct(
      { product_name_en: 'Crispbread', serving_quantity: '10', nutriments: { energy_100g: '1544', proteins_100g: '9,5', carbohydrates_100g: 66, fat_100g: 1.6, sodium_100g: 0.2 } },
      '7300400118101',
    )
    expect(food?.name).toBe('Crispbread')
    expect(food?.per100).toMatchObject({ kcal: 369, protein: 9.5, salt: 0.5 })
    expect(food?.servings).toEqual([{ name: '1 serving', grams: 10 }])
  })

  it('reports a product without macros as incomplete, keeping its name for the label form', () => {
    expect(mapProduct({ product_name: 'Mystery bar', brands: 'X', nutriments: {} }, '4000000000000')).toEqual({ food: null, name: 'Mystery bar', brand: 'X' })
  })

  it('asks the v3 product endpoint for only the fields it uses', () => {
    expect(productUrl('3017624010701')).toMatch(/^https:\/\/world\.openfoodfacts\.org\/api\/v3\/product\/3017624010701\.json\?fields=code,product_name/)
  })

  it('handles found, not found, rate limits and offline', async () => {
    expect(await fetchProduct('3017624010701', fakeFetch(200, { status: 'success', product: spread, result: { id: 'product_found' } }))).toMatchObject({
      status: 'found',
      food: { name: 'Nuss-Nougat-Creme' },
    })
    expect(await fetchProduct('1', fakeFetch(404, { status: 'failure', result: { id: 'product_not_found' } }))).toEqual({ status: 'notFound' })
    expect((await fetchProduct('1', fakeFetch(429, {}))).status).toBe('error')
    const offline = (async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    expect(await fetchProduct('1', offline)).toMatchObject({ status: 'error', message: expect.stringContaining('No connection') })
    expect(await fetchProduct('1', fakeFetch(200, { status: 'success', product: { product_name: 'Bare' } }))).toMatchObject({ status: 'incomplete' })
  })
})
