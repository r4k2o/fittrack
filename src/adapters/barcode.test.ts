import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader'
import { normalizeBarcode } from '../lib/barcode'

// The device check decodes this bundled image on the phone; here the same
// WebAssembly decoder reads it in Node, so a broken image never ships.
describe('device-check barcode image', () => {
  it('decodes to the EAN-13 the check expects', async () => {
    const wasm = readFileSync(fileURLToPath(import.meta.resolve('zxing-wasm/reader/zxing_reader.wasm')))
    prepareZXingModule({ overrides: { wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer } })
    const png = readFileSync(new URL('../../public/check-barcode.png', import.meta.url))
    const results = await readBarcodes(new Uint8Array(png), { formats: ['EAN13'] })
    expect(results.map((r) => r.text)).toEqual(['3017624010701'])
    expect(normalizeBarcode(results[0].text, 'ean_13')).toBe('3017624010701')
  })
})
