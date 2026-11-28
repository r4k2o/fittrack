// How regularly you train: a calendar of the last 16 weeks (one cell per day, darker
// for more hard sets), this week against the plan, the weekly average and the run of
// weeks with training. Tap or hover a day for what was done.

import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type CSSProperties, type ReactNode } from 'react'
import { useToday } from '../../hooks'
import { consistency, heatGrid, type DayLoad, type HeatLevel } from '../../lib/consistency'
import { addDays, formatDayLong, weekStart } from '../../lib/dates'
import { fmt1 } from '../../lib/format'
import { activePlan } from '../../store/plans'
import { dayLoads } from '../../store/progress'
import { cx } from '../../ui/kit'
import { haptic } from '../../ui/motion'

const WEEKS = 16
const ROW_LABEL = ['Mo', '', 'Mi', '', 'Fr', '', 'So']
const FILL: Record<HeatLevel, string> = { 0: 'var(--fill)', 1: 'var(--heat-1)', 2: 'var(--heat-2)', 3: 'var(--heat-3)', 4: 'var(--heat-4)' }

function describe(date: string, d: DayLoad | undefined, today: string): string {
  const day = date === today ? 'Heute' : formatDayLong(date)
  if (!d || (!d.sessions && !d.cardioMin)) return `${day}: kein Training`
  const parts: string[] = []
  if (d.names.length) parts.push(d.names.join(', '))
  if (d.sets) parts.push(`${d.sets} Sätze`)
  if (d.cardioMin) parts.push(`${Math.round(d.cardioMin)} Min Cardio`)
  return `${day}: ${parts.join(' · ')}`
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[13px] font-semibold text-ink-2">{label}</p>
      <p className="mt-0.5 text-[22px] font-bold leading-tight tabular-nums tracking-tight">
        {value}
        {sub && <span className="ml-1 text-[14px] font-medium tracking-normal text-ink-3">{sub}</span>}
      </p>
    </div>
  )
}

export function ConsistencyCard() {
  const today = useToday()
  const from = addDays(weekStart(today), -7 * (WEEKS - 1))
  const loads = useLiveQuery(() => dayLoads(from, today), [from, today])
  const planDays = useLiveQuery(async () => (await activePlan())?.days.length ?? null, [])
  const [picked, setPicked] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)

  if (!loads) return <div className="card mt-3 h-[22rem]" />
  const grid = heatGrid(loads, today, WEEKS)
  const c = consistency(loads, today, WEEKS)
  const shown = hovered ?? picked ?? today

  return (
    <section className="card mt-3 p-4">
      <h2 className="text-[16px] font-bold">Trainingskalender</h2>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <Stat label="Diese Woche" value={String(c.thisWeek)} sub={planDays ? `von ${planDays}` : c.thisWeek === 1 ? 'Tag' : 'Tage'} />
        <Stat label="Ø pro Woche" value={c.perWeek == null ? '–' : fmt1(Math.round(c.perWeek * 10) / 10)} sub={c.perWeek == null ? undefined : 'Tage'} />
        <Stat label="In Folge" value={String(c.streakWeeks)} sub={c.streakWeeks === 1 ? 'Woche' : 'Wochen'} />
      </div>

      <div
        className="mt-4 grid gap-[3px]"
        style={{ gridTemplateColumns: `1.5rem repeat(${WEEKS}, minmax(0, 1fr))` }}
        onPointerLeave={() => setHovered(null)}
      >
        {/* month labels */}
        <span />
        {grid.weeks.map((w, col) => {
          const m = grid.months.find((x) => x.col === col)
          return (
            <span key={w.monday} className="relative h-4 text-[11px] font-semibold text-ink-3" aria-hidden>
              {m && <span className="absolute left-0 top-0 whitespace-nowrap">{m.label}</span>}
            </span>
          )
        })}
        {ROW_LABEL.map((label, row) => (
          <Row key={row} label={label}>
            {grid.weeks.map((w, col) => {
              const cell = w.days[row]
              if (cell.future) return <span key={cell.date} aria-hidden className="aspect-square" />
              const isToday = cell.date === today
              const isShown = cell.date === shown && (picked != null || hovered != null)
              return (
                <button
                  key={cell.date}
                  type="button"
                  aria-label={describe(cell.date, loads.get(cell.date), today)}
                  aria-pressed={cell.date === picked}
                  onPointerEnter={(e) => e.pointerType === 'mouse' && setHovered(cell.date)}
                  onClick={() => {
                    haptic()
                    setPicked(cell.date === picked ? null : cell.date)
                  }}
                  className={cx(
                    'heat-cell aspect-square rounded-[4px] outline-offset-1 transition-transform duration-150',
                    isShown && 'scale-110 outline-2 outline-ink',
                    isToday && !isShown && 'outline-2 outline-ink-3',
                  )}
                  style={{ background: FILL[cell.level], animationDelay: `${col * 18}ms`, outlineStyle: isShown || isToday ? 'solid' : undefined } as CSSProperties}
                />
              )
            })}
          </Row>
        ))}
      </div>

      <p className="mt-3 min-h-10 text-[14px] text-ink-2" aria-live="polite">
        {describe(shown, loads.get(shown), today)}
      </p>

      <div className="mt-1 flex items-center justify-between gap-3 border-t border-line pt-3">
        <p className="text-[13px] text-ink-2">
          {c.weeksCounted ? `${c.activeWeeks} von ${c.weeksCounted} Wochen mit Training` : 'Noch kein Training'}
        </p>
        <div className="flex items-center gap-1 text-[12px] text-ink-3" aria-hidden>
          weniger
          {([0, 1, 2, 3, 4] as HeatLevel[]).map((l) => (
            <span key={l} className="size-3 rounded-[3px]" style={{ background: FILL[l] }} />
          ))}
          mehr
        </div>
      </div>
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <span className="flex items-center text-[11px] font-semibold text-ink-3" aria-hidden>
        {label}
      </span>
      {children}
    </>
  )
}
