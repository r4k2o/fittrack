// Barcode checks: GTIN check digits and UPC normalisation, so a misread never
// triggers a lookup and the same product always gets the same code.

/** GTIN-8/12/13/14 check digit: weights 3 and 1 alternating from the right. */
export function isValidGtin(code: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false
  const digits = code.split('').map(Number)
  const check = digits.pop() as number
  let sum = 0
  digits.reverse().forEach((d, i) => {
    sum += d * (i % 2 === 0 ? 3 : 1)
  })
  return (10 - (sum % 10)) % 10 === check
}

/** Expands an 8-digit UPC-E code to its 12-digit UPC-A form. */
export function upcEToUpcA(upce: string): string | null {
  if (!/^[01]\d{7}$/.test(upce)) return null
  const ns = upce[0]
  const d = upce.slice(1, 7)
  const check = upce[7]
  const last = Number(d[5])
  let body: string
  if (last <= 2) body = `${d[0]}${d[1]}${d[5]}0000${d[2]}${d[3]}${d[4]}`
  else if (last === 3) body = `${d[0]}${d[1]}${d[2]}00000${d[3]}${d[4]}`
  else if (last === 4) body = `${d[0]}${d[1]}${d[2]}${d[3]}00000${d[4]}`
  else body = `${d[0]}${d[1]}${d[2]}${d[3]}${d[4]}0000${d[5]}`
  return `${ns}${body}${check}`
}

/**
 * One canonical form per product: EAN-13 for UPC-A and UPC-E (leading zero), EAN-8 as
 * is. Returns null when the code fails its check digit.
 */
export function normalizeBarcode(raw: string, format?: string): string | null {
  const code = raw.replace(/\D/g, '')
  if (format === 'upc_e' || (code.length === 8 && format !== 'ean_8' && /^[01]/.test(code) && !isValidGtin(code))) {
    const a = upcEToUpcA(code)
    if (a && isValidGtin(a)) return `0${a}`
  }
  if (code.length === 12) return isValidGtin(code) ? `0${code}` : null
  if (code.length === 8 || code.length === 13) return isValidGtin(code) ? code : null
  if (code.length === 14) return isValidGtin(code) ? code : null
  return null
}
