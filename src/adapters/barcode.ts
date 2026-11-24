// Barcode decoding with ZXing compiled to WebAssembly, behind the standard
// BarcodeDetector interface (Safari ships its native one switched off).
// By default the library downloads its .wasm from a public CDN at runtime, which
// breaks offline scanning, so it is pointed at the copy Vite bundles instead.
// Keep zxing-wasm pinned to the version barcode-detector depends on.

import { BarcodeDetector, prepareZXingModule } from 'barcode-detector/ponyfill'
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'
import { normalizeBarcode } from '../lib/barcode'

prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path),
  },
})

let detector: BarcodeDetector | null = null

export function getDetector(): BarcodeDetector {
  detector ??= new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] })
  return detector
}

export interface Detected {
  code: string
  raw: string
  format: string
}

/** Decodes the first valid product barcode in a video frame, image or bitmap. */
export async function detectBarcode(source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap | Blob): Promise<Detected | null> {
  const found = await getDetector().detect(source)
  for (const b of found) {
    const code = normalizeBarcode(b.rawValue, b.format)
    if (code) return { code, raw: b.rawValue, format: b.format }
  }
  return null
}

/** Decodes a still photo, e.g. one taken through the file picker when the live camera is unavailable. */
export async function detectInFile(file: Blob): Promise<Detected | null> {
  const bitmap = await createImageBitmap(file)
  try {
    return await detectBarcode(bitmap)
  } finally {
    bitmap.close()
  }
}
