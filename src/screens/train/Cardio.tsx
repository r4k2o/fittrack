// Cardio minutes per week by intensity against the WHO's 150 minutes, the sessions
// themselves, and the switch that adds burned calories to the food budget.

import { useLiveQuery } from 'dexie-react-hooks'
import type { CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSetting, useToday } from '../../hooks'
import { addDays, formatDayShort, parseDay, weekStart } from '../../lib/dates'
import { CARDIO_LABEL, paceText, weekMinutes, WHO_WEEKLY_MIN, type WeekMinutes } from '../../lib/cardio'
import { fmt1, fmtInt } from '../../lib/format'
import { cardioBetween } from '../../store/cardio'
import { setSetting } from '../../store/settings'
import { IconPlus, IconTimer } from '../../ui/icons'
import { Button, Card, EmptyState, Group, ListRow, Screen, SectionTitle, Toggle } from '../../ui/kit'

const SHADES = { light: 'color-mix(in oklab, var(--train) 32%, transparent)', moderate: 'color-mix(in oklab, var(--train) 64%, transparent)', vigorous: 'var(--train)' }
const WEEKS = 8

function Stack({ m, scale, vertical }: { m: WeekMinutes; scale: number; vertical?: boolean }) {
  const parts = (['vigorous', 'moderate', 'light'] as const).filter((k) => m[k] > 0)
  return (
    <>
      {parts.map((k) => (
        <span
          key={k}
          style={{ [vertical ? 'height' : 'width']: `${(m[k] / scale) * 100}%`, background: SHADES[k] } as CSSProperties}
          className={vertical ? 'block w-full' : 'block h-full'}
        />
      ))}
    </>
  )
}

export function Legend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-2" aria-hidden>
      {(['light', 'moderate', 'vigorous'] as const).map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5 capitalize">
          <span className="size-2.5 rounded-[3px]" style={{ background: SHADES[k] }} />
          {k}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="h-0 w-4 border-t-2 border-dashed border-ink" /> 150 min
      </span>
    </div>
  )
}

export default function Cardio() {
  const navigate = useNavigate()
  const today = useToday()
  const monday = weekStart(today)
  const from = addDays(monday, -7 * (WEEKS - 1))
  const sessions = useLiveQuery(() => cardioBetween(from, addDays(monday, 6)), [from, monday])
  const addBurned = useSetting('addBurnedCalories')
  const weeks = Array.from({ length: WEEKS }, (_, i) => {
    const start = addDays(from, i * 7)
    return { start, m: weekMinutes((sessions ?? []).filter((s) => weekStart(s.date) === start)) }
  })
  const now = weeks[weeks.length - 1].m
  const scale = Math.max(WHO_WEEKLY_MIN * 1.25, ...weeks.map((w) => w.m.total))
  const label = (d: string) => parseDay(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

  return (
    <Screen
      back="/train"
      title="Cardio"
      tone="train"
      actions={
        <Button size="sm" onClick={() => navigate('/train/cardio/new')}>
          <IconPlus size={16} strokeWidth={2.6} /> Log
        </Button>
      }
    >
      <Card tone="train" className="!p-5">
        <p className="text-[13px] font-semibold text-ink-2">This week, minutes by intensity</p>
        <p className="mt-0.5 flex items-baseline gap-1.5">
          <span className="text-[52px] font-bold leading-none tracking-[-0.045em] tabular-nums">{fmtInt(now.total)}</span>
          <span className="text-[15px] font-semibold text-ink-2">min</span>
        </p>
        <div className="relative mt-4 h-4 rounded-full bg-fill">
          <div className="flex h-full overflow-hidden rounded-full">
            <Stack m={now} scale={scale} />
          </div>
          <span className="absolute -inset-y-1.5 border-l-2 border-dashed border-ink" style={{ left: `${(WHO_WEEKLY_MIN / scale) * 100}%` }} />
        </div>
        <p className="mt-3 text-[14px] text-ink-2">
          {now.moderateEquivalent >= WHO_WEEKLY_MIN
            ? `${fmtInt(now.moderateEquivalent)} moderate-equivalent minutes: at or above the WHO's 150.`
            : `${fmtInt(now.moderateEquivalent)} of the WHO's 150 moderate minutes a week; a vigorous minute counts as two.`}
        </p>
        <div className="mt-3">
          <Legend />
        </div>
      </Card>

      <Card className="mt-3 !p-4">
        <p className="text-[13px] font-semibold text-ink-2">Minutes per week, last {WEEKS} weeks</p>
        <div className="relative mt-3 h-40">
          <span className="absolute inset-x-0 border-t-2 border-dashed border-ink/60" style={{ bottom: `${(WHO_WEEKLY_MIN / scale) * 100}%` }} />
          <span className="absolute right-0 -translate-y-full pb-0.5 text-[11px] font-semibold text-ink-2" style={{ bottom: `${(WHO_WEEKLY_MIN / scale) * 100}%` }}>
            150
          </span>
          <div className="absolute inset-0 flex items-end gap-2">
            {weeks.map((w) => (
              <div key={w.start} className="flex h-full flex-1 flex-col justify-end" aria-label={`Week of ${label(w.start)}: ${fmtInt(w.m.total)} minutes`} role="img">
                <div className="flex w-full flex-col-reverse overflow-hidden rounded-t-[6px]" style={{ height: `${(w.m.total / scale) * 100}%` }}>
                  <Stack m={w.m} scale={w.m.total || 1} vertical />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-1.5 flex gap-2 text-center text-[11px] font-semibold text-ink-3">
          {weeks.map((w, i) => {
            const d = parseDay(w.start)
            const newMonth = i === 0 || parseDay(weeks[i - 1].start).getMonth() !== d.getMonth()
            return (
              <span key={w.start} className="flex-1 truncate">
                {i === weeks.length - 1 ? 'Now' : newMonth ? label(w.start) : d.getDate()}
              </span>
            )
          })}
        </div>
      </Card>

      <Group className="mt-3">
        <Toggle
          checked={!!addBurned}
          onChange={(v) => void setSetting('addBurnedCalories', v)}
          label="Add burned calories to the food budget"
          hint="Off by default: your activity level already counts training, so adding them again counts it twice."
        />
      </Group>

      <SectionTitle>Sessions</SectionTitle>
      {sessions && sessions.length > 0 ? (
        <Group>
          {sessions.map((s) => {
            const pace = paceText(s.type, s.durationMin, s.distanceKm)
            return (
              <ListRow
                key={s.id}
                title={`${CARDIO_LABEL[s.type]} · ${s.durationMin} min`}
                subtitle={[formatDayShort(s.date), s.distanceKm ? `${fmt1(s.distanceKm)} km` : null, pace, s.rpe ? `effort ${s.rpe}` : null].filter(Boolean).join(' · ')}
                detail={s.kcal ? `${s.kcalEstimated ? '≈ ' : ''}${fmtInt(s.kcal)} kcal` : undefined}
                onClick={() => navigate(`/train/cardio/${s.id}`)}
              />
            )
          })}
        </Group>
      ) : (
        <EmptyState icon={<IconTimer size={28} />} title="No cardio in the last 8 weeks">
          Runs, rides and other sessions logged here count toward the weekly minutes. Sessions from a watch can arrive through the Health import.
        </EmptyState>
      )}
    </Screen>
  )
}
