// Colour helpers for Chart.js, which draws on a canvas and cannot read CSS variables itself.

export const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

/** "#0891b2" → "rgba(8,145,178,a)" for Chart.js, which cannot parse CSS colour functions. */
export function withAlpha(hex: string, a: number): string {
  const h = hex.replace('#', '')
  if (h.length !== 6) return hex
  const n = parseInt(h, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}
