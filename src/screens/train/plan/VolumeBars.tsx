// Weekly sets per muscle group against the 10–20 band: one bar per group on a shared
// scale, the band shaded behind it and the plan's target as a tick. Values and labels
// stay in text colours; out-of-band groups carry an icon and a word.

import { GROUP_LABEL, GROUPS, VOLUME_CEILING, VOLUME_FLOOR, type Group, type Volume } from '../../../lib/volume'
import { IconAlert } from '../../../ui/icons'

const SCALE = 24
const pct = (v: number) => `${(Math.min(Math.max(v, 0), SCALE) / SCALE) * 100}%`
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','))

export function VolumeBars({ volume, targets, caption }: { volume: Volume; targets?: Volume; caption?: string }) {
  // groups the plan leaves out on purpose (target 0, e.g. "no legs") are not shown
  const shown = GROUPS.filter((g) => !targets || targets[g] > 0 || volume[g] > 0)
  const low = shown.filter((g) => volume[g] < VOLUME_FLOOR && (!targets || targets[g] > 0))
  const high = shown.filter((g) => volume[g] > VOLUME_CEILING)
  const list = (gs: Group[]) => gs.map((g) => GROUP_LABEL[g]).join(', ')
  return (
    <figure className="m-0">
      <figcaption className="text-[13px] font-semibold text-ink-2">{caption ?? 'Harte Sätze pro Muskelgruppe und Woche'}</figcaption>
      <div className="relative ml-[5.75rem] mr-11 mt-2 h-4 text-[11px] font-semibold tabular-nums text-ink-3" aria-hidden>
        <span className="absolute -translate-x-1/2" style={{ left: pct(VOLUME_FLOOR) }}>
          {VOLUME_FLOOR}
        </span>
        <span className="absolute -translate-x-1/2" style={{ left: pct(VOLUME_CEILING) }}>
          {VOLUME_CEILING}
        </span>
      </div>
      <ul className="mt-1 space-y-2">
        {shown.map((g) => {
          const v = volume[g]
          const out = (v < VOLUME_FLOOR && (!targets || targets[g] > 0)) || v > VOLUME_CEILING
          const t = targets?.[g]
          return (
            <li key={g} className="flex items-center gap-2" aria-label={`${GROUP_LABEL[g]}: ${fmt(v)} Sätze${t ? `, Ziel ${t}` : ''}`}>
              <span className="w-[5.25rem] shrink-0 truncate text-[14px] font-medium">{GROUP_LABEL[g]}</span>
              <span className="relative h-3 flex-1 rounded-full bg-fill" aria-hidden>
                <span className="absolute inset-y-0 rounded-[3px] bg-[var(--brand-track)]" style={{ left: pct(VOLUME_FLOOR), width: `${((VOLUME_CEILING - VOLUME_FLOOR) / SCALE) * 100}%` }} />
                <span className="absolute inset-y-0 left-0 rounded-full bg-train transition-[width] duration-500 ease-[var(--ease-out)]" style={{ width: pct(v) }} />
                {t != null && <span className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-ink" style={{ left: pct(t) }} />}
              </span>
              <span className="flex w-9 shrink-0 items-center justify-end gap-0.5 text-[14px] font-semibold tabular-nums">
                {out && <IconAlert size={13} className="text-warn-ink" />}
                {fmt(v)}
              </span>
            </li>
          )
        })}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-2" aria-hidden>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-full bg-train" /> Sätze
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-[3px] bg-[var(--brand-track)]" /> Bereich 10–20
        </span>
        {targets && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-0.5 rounded-full bg-ink" /> Ziel
          </span>
        )}
      </div>
      {(low.length > 0 || high.length > 0) && (
        <p className="mt-2 flex items-start gap-1.5 text-[13px] text-ink-2">
          <IconAlert size={15} className="mt-0.5 shrink-0 text-warn-ink" />
          <span>
            {low.length > 0 && <>Unter 10: {list(low)}. </>}
            {high.length > 0 && <>Über 20: {list(high)}.</>}
          </span>
        </p>
      )}
    </figure>
  )
}
