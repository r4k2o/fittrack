// A generated plan before it is used: the week's rhythm, what the engine had to leave
// out, sets per muscle against the 10–20 band, and every session's exercises.

import type { CSSProperties, ReactNode } from 'react'
import type { Exercise } from '../../../db'
import { splitFor, type GeneratedPlan, type PlanNote } from '../../../lib/planner'
import { WEEKDAY_LONG, WEEKDAY_SHORT } from '../../../lib/volume'
import { IconRepeat } from '../../../ui/icons'
import { Card, cx, Notice } from '../../../ui/kit'
import { VolumeBars } from './VolumeBars'
import { fmtRest, groupPairs, prescriptionText } from './planFormat'

/** Seven circles, Monday first: filled on training days. */
export function WeekRhythm({ weekdays, done = [], today }: { weekdays: readonly (number | null | undefined)[]; done?: readonly number[]; today?: number }) {
  const on = new Set(weekdays.filter((d): d is number => d != null))
  return (
    <div className="flex justify-between gap-1" aria-label={`Training am ${[...on].sort().map((d) => WEEKDAY_LONG[d]).join(', ')}`}>
      {WEEKDAY_SHORT.map((label, d) => (
        <span key={label} className="flex flex-1 flex-col items-center gap-1">
          <span
            className={cx(
              'flex size-9 items-center justify-center rounded-full text-[13px] font-bold',
              on.has(d) ? (done.includes(d) ? 'btn-accent' : 'btn-primary') : 'bg-fill text-ink-3',
              today === d && 'ring-2 ring-ink ring-offset-2 ring-offset-[var(--surface)]',
            )}
          >
            {label.slice(0, 1)}
          </span>
          <span className="text-[11px] font-semibold text-ink-3">{label}</span>
        </span>
      ))}
    </div>
  )
}

/** One exercise in a session list: name, sets × reps and rest. */
export function ExerciseLine({ ex, x, trailing }: { ex?: Exercise; x: { sets: number; repMin: number; repMax: number; restSec: number }; trailing?: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold">{ex?.name ?? 'Übung'}</p>
        <p className="text-[13px] tabular-nums text-ink-2">
          {prescriptionText(x, ex?.unit === 'seconds')} · Pause {fmtRest(x.restSec)}
        </p>
      </div>
      {trailing}
    </div>
  )
}

export function SupersetFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative my-1 rounded-[18px] bg-fill pl-3 pr-2">
      <span className="absolute -top-2 left-3 inline-flex items-center gap-1 rounded-full bg-ink px-2 py-0.5 text-[11px] font-bold text-page">
        <IconRepeat size={11} strokeWidth={2.6} /> Superset
      </span>
      <div className="divide-y divide-line pt-1.5">{children}</div>
    </div>
  )
}

function NoteList({ notes }: { notes: PlanNote[] }) {
  const injury = notes.filter((n) => n.kind === 'injury')
  const short = notes.filter((n) => n.kind === 'shortfall')
  const info = notes.filter((n) => n.kind !== 'injury' && n.kind !== 'shortfall')
  return (
    <div className="space-y-2">
      {injury.map((n) => (
        <Notice key={n.text} tone="warn">
          {n.text}
        </Notice>
      ))}
      {short.length > 0 && (
        <Notice tone="warn">
          <p className="font-semibold">Unter dem Wochenziel</p>
          <ul className="mt-1 space-y-1">
            {short.map((n) => (
              <li key={n.text}>{n.text}</li>
            ))}
          </ul>
        </Notice>
      )}
      {info.map((n) => (
        <Notice key={n.text}>{n.text}</Notice>
      ))}
    </div>
  )
}

export function PlanPreview({ plan, exercises }: { plan: GeneratedPlan; exercises: ReadonlyMap<string, Exercise> }) {
  const longest = Math.max(...plan.days.map((d) => d.minutes))
  return (
    <div className="space-y-3">
      <Card className="!p-5">
        <p className="text-title2">{splitFor(plan.answers).label}</p>
        <p className="mt-0.5 text-[15px] text-ink-2">
          {plan.days.length} Tage pro Woche · bis {longest} Min pro Einheit
        </p>
        <div className="mt-4">
          <WeekRhythm weekdays={plan.days.map((d) => d.weekday)} />
        </div>
      </Card>

      {plan.notes.length > 0 && <NoteList notes={plan.notes} />}

      <Card className="!p-4">
        <VolumeBars volume={plan.volume} targets={plan.targets} />
      </Card>

      {plan.days.map((d, i) => (
        <Card key={d.name} className="animate-rise !p-4" style={{ '--i': i } as CSSProperties}>
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-[18px] font-bold tracking-tight">
              <span className="text-ink-2">{WEEKDAY_SHORT[d.weekday]} · </span>
              {d.name}
            </h3>
            <span className="text-[13px] font-semibold tabular-nums text-ink-2">ca. {d.minutes} Min</span>
          </div>
          <div className="mt-1 divide-y divide-line">
            {groupPairs(d.exercises.map((x) => ({ ...x, id: x.key }))).map((group) =>
              group.length === 2 ? (
                <SupersetFrame key={group[0].id}>
                  {group.map((x) => (
                    <ExerciseLine key={x.id} ex={exercises.get(x.exerciseId)} x={x} />
                  ))}
                </SupersetFrame>
              ) : (
                <ExerciseLine key={group[0].id} ex={exercises.get(group[0].exerciseId)} x={group[0]} />
              ),
            )}
          </div>
        </Card>
      ))}
    </div>
  )
}
