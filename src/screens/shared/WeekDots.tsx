import type { Session } from '../../db'
import { addDays, weekStart } from '../../lib/dates'
import { WEEKDAY_LONG, WEEKDAY_SHORT } from '../../lib/volume'
import type { WeekDay } from '../../store/plans'
import { IconCheck } from '../../ui/icons'
import { cx } from '../../ui/kit'

/**
 * The week at a glance: a filled circle for each day with a finished workout, a ring
 * for a planned day still to come, a dashed ring for a planned day that passed, and a
 * small dot for rest days.
 */
export function WeekDots({ today, week, sessions, className }: { today: string; week: readonly WeekDay[] | null; sessions: readonly Session[]; className?: string }) {
  const monday = weekStart(today)
  const planned = new Map<string, WeekDay>()
  for (const w of week ?? []) if (w.date) planned.set(w.date, w)
  const trained = new Set(sessions.filter((s) => !!s.endedAt).map((s) => s.date))
  return (
    <ol className={cx('grid grid-cols-7', className)} aria-label="Diese Woche">
      {Array.from({ length: 7 }, (_, i) => {
        const d = addDays(monday, i)
        const p = planned.get(d)
        const done = trained.has(d)
        const isToday = d === today
        const past = d < today
        const state = done ? 'trainiert' : p ? (past ? 'verpasst' : isToday ? 'heute geplant' : 'geplant') : 'Ruhetag'
        return (
          <li key={d} aria-label={`${WEEKDAY_LONG[i]}: ${state}`} className="flex flex-col items-center gap-1.5">
            <span className={cx('text-[12px]', isToday ? 'font-bold text-ink' : 'font-medium text-ink-3')}>{WEEKDAY_SHORT[i]}</span>
            <span
              aria-hidden
              className={cx(
                'flex size-7 items-center justify-center rounded-full',
                done && 'btn-accent animate-pop',
                !done && p && !past && (isToday ? 'border-2 border-ink' : 'border-2 border-ink-3'),
                !done && p && past && 'border-2 border-dashed border-fill-strong',
              )}
            >
              {done ? <IconCheck size={14} strokeWidth={3} /> : !p ? <span className="size-1.5 rounded-full bg-fill-strong" /> : null}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
