export type Cell = string | number | boolean | null | undefined

function cell(v: Cell): string {
  if (v == null) return ''
  const s = typeof v === 'number' ? (Number.isFinite(v) ? String(v) : '') : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** RFC 4180 CSV with a byte-order mark, so Excel reads umlauts correctly. */
export function toCsv(header: readonly string[], rows: readonly (readonly Cell[])[]): string {
  return '﻿' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
}

/**
 * Parses delimited text. The delimiter is detected from the first line (semicolon,
 * comma or tab); quoted fields may contain delimiters, quotes ("") and line breaks.
 */
export function parseDelimited(text: string): { rows: string[][]; lines: number[]; delimiter: string } {
  const src = text.replace(/^﻿/, '')
  const firstLine = src.slice(0, src.search(/\r?\n/) === -1 ? src.length : src.search(/\r?\n/))
  const counts = [';', ',', '\t'].map((d) => ({ d, n: countOutsideQuotes(firstLine, d) }))
  const delimiter = counts.sort((a, b) => b.n - a.n)[0].n > 0 ? counts[0].d : ','

  const rows: string[][] = []
  const lines: number[] = [] // 1-based line on which each row starts; blank rows are skipped
  let row: string[] = []
  let field = ''
  let quoted = false
  let line = 1
  let rowLine = 1
  const endRow = () => {
    row.push(field)
    field = ''
    if (row.some((c) => c.trim() !== '')) {
      rows.push(row)
      lines.push(rowLine)
    }
    row = []
  }
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i += 1
        } else quoted = false
      } else {
        if (ch === '\n') line += 1
        field += ch
      }
    } else if (ch === '"' && field === '') quoted = true
    else if (ch === delimiter) {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1
      endRow()
      line += 1
      rowLine = line
    } else field += ch
  }
  endRow()
  return { rows, lines, delimiter }
}

function countOutsideQuotes(line: string, d: string): number {
  let n = 0
  let q = false
  for (const ch of line) {
    if (ch === '"') q = !q
    else if (ch === d && !q) n += 1
  }
  return n
}
