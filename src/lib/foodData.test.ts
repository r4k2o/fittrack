import { describe, expect, it } from 'vitest'
import { isValidGtin, normalizeBarcode, upcEToUpcA } from './barcode'
import { detectColumns, mapFoodRows, missingRequired, parseLocaleNumber, readFoodTable } from './foodImport'
import { buildFoodIndex, normalizeTerm, searchFoods } from './foodSearch'

describe('barcodes', () => {
  it('checks GTIN check digits', () => {
    expect(isValidGtin('3017624010701')).toBe(true)
    expect(isValidGtin('3017624010702')).toBe(false)
    expect(isValidGtin('96385074')).toBe(true) // EAN-8
    expect(isValidGtin('036000291452')).toBe(true) // UPC-A
    expect(isValidGtin('12345')).toBe(false)
  })

  it('normalises UPC-A and UPC-E to EAN-13 and rejects misreads', () => {
    expect(upcEToUpcA('04252614')).toBe('042100005264')
    expect(normalizeBarcode('04252614', 'upc_e')).toBe('0042100005264')
    expect(normalizeBarcode('036000291452', 'upc_a')).toBe('0036000291452')
    expect(normalizeBarcode('3017624010701', 'ean_13')).toBe('3017624010701')
    expect(normalizeBarcode('3017624010702', 'ean_13')).toBeNull()
  })
})

describe('food list import', () => {
  it('reads a German semicolon CSV with decimal commas and finds the columns', () => {
    const csv = [
      'Code;Lebensmittel;Energie (kcal);Eiweiß (g);Kohlenhydrate, verfügbar (g);Fett (g);Ballaststoffe (g);Zucker (g);Gesättigte Fettsäuren (g);Natrium (mg)',
      'B100;"Haferflocken, Vollkorn";372;13,5;58,7;7,0;10,0;0,7;1,3;5',
      'B200;Magerquark;67;12,0;4,0;0,2;0;4,0;0,1;40',
      ';;;;;;;;;',
      'B300;Unvollständig;100;;;;;;;',
    ].join('\r\n')
    const table = readFoodTable(csv)
    const map = detectColumns(table.header)
    expect(map).toEqual({ key: 0, name: 1, kcal: 2, protein: 3, carbs: 4, fat: 5, fibre: 6, sugar: 7, satFat: 8, sodium: 9 })
    expect(missingRequired(map)).toEqual([])
    const { foods, skipped } = mapFoodRows(table, map)
    expect(foods[0]).toEqual({
      key: 'B100',
      name: 'Haferflocken, Vollkorn',
      per100: { kcal: 372, protein: 13.5, carbs: 58.7, fat: 7, fibre: 10, sugar: 0.7, satFat: 1.3, salt: 0.01 },
    })
    expect(foods[1].per100.salt).toBe(0.1) // 40 mg sodium → 0.1 g salt
    expect(skipped).toEqual([{ row: 5, reason: 'Energie, Eiweiß, Kohlenhydrate oder Fett fehlt' }])
  })

  it('converts kJ when there is no kcal column and makes keys unique', () => {
    const table = readFoodTable('name,energy (kJ),protein,carbohydrate,fat\nRice,1527,7,79,0.6\nRice,1527,7,79,0.6\n')
    const map = detectColumns(table.header)
    expect(map.kj).toBe(1)
    const { foods } = mapFoodRows(table, map)
    expect(foods.map((f) => [f.key, f.per100.kcal])).toEqual([
      ['rice', 365],
      ['rice-2', 365],
    ])
  })

  it('reads a JSON list, flat or with per100 values', () => {
    const table = readFoodTable(JSON.stringify([{ name: 'Apple', per100: { kcal: 52, protein: 0.3, carbs: 13.8, fat: 0.2 } }, { name: 'Pear', kcal: 57, protein: 0.4, carbs: 15, fat: 0.1 }]))
    const { foods } = mapFoodRows(table, detectColumns(table.header))
    expect(foods.map((f) => [f.name, f.per100.kcal])).toEqual([
      ['Apple', 52],
      ['Pear', 57],
    ])
  })

  it('parses locale numbers and trace markers', () => {
    expect(parseLocaleNumber('1.234,5')).toBe(1234.5)
    expect(parseLocaleNumber('1,234.5')).toBe(1234.5)
    expect(parseLocaleNumber('<0,1')).toBe(0)
    expect(parseLocaleNumber('Sp.')).toBe(0)
    expect(parseLocaleNumber('-')).toBeUndefined()
  })
})

describe('food search', () => {
  const foods = [
    { id: 'a', name: 'Käse, Gouda' },
    { id: 'b', name: 'Haferflocken' },
    { id: 'c', name: 'Hafermilch', brand: 'Oatly' },
    { id: 'd', name: 'Hähnchenbrust', synonyms: ['Chicken breast'] },
  ]
  const index = buildFoodIndex(foods)

  it('matches prefixes without accents and through synonyms', () => {
    expect(normalizeTerm('Käse Straße')).toBe('kase strasse')
    expect(searchFoods(index, 'kase', new Map())).toEqual(['a'])
    expect(searchFoods(index, 'chick', new Map())).toEqual(['d'])
    expect(searchFoods(index, 'oatly', new Map())).toEqual(['c'])
  })

  it('tolerates typos and ranks recent and frequent foods first', () => {
    expect(searchFoods(index, 'haferflokcen', new Map())).toContain('b')
    const plain = searchFoods(index, 'hafer', new Map())
    const boosted = searchFoods(index, 'hafer', new Map([['c', { count: 10, daysAgo: 1 }]]))
    expect(plain).toHaveLength(2)
    expect(boosted[0]).toBe('c')
  })
})
