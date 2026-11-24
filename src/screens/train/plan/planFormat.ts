import { fmtDuration } from '../../../lib/format'

export function fmtRest(sec: number): string {
  return sec < 60 ? `${sec} s` : fmtDuration(sec)
}

export function prescriptionText(x: { sets: number; repMin: number; repMax: number }, seconds?: boolean): string {
  const reps = x.repMin === x.repMax ? `${x.repMin}` : `${x.repMin}–${x.repMax}`
  return `${x.sets} × ${reps}${seconds ? ' s' : ''}`
}

/** Groups consecutive superset partners so the list can draw them together. */
export function groupPairs<T extends { id: string; pairWith: string | null }>(items: readonly T[]): T[][] {
  const out: T[][] = []
  const used = new Set<string>()
  for (const it of items) {
    if (used.has(it.id)) continue
    used.add(it.id)
    const partner = it.pairWith ? items.find((o) => o.id === it.pairWith && !used.has(o.id)) : undefined
    if (partner) {
      used.add(partner.id)
      out.push([it, partner])
    } else out.push([it])
  }
  return out
}

