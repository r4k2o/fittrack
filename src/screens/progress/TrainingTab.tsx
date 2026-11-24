// Training: hard sets per muscle group against the 10–20 band, strength as the weekly
// best estimated 1RM per lift, and cardio minutes per week against the WHO's 150.

import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToday } from '../../hooks'
import { weekMinutes, WHO_WEEKLY_MIN } from '../../lib/cardio'
import { addDays, formatDayShort, weekStart } from '../../lib/dates'
import { fmt1, fmtInt } from '../../lib/format'
import { weeklyTargets } from '../../lib/planner'
import { emptyVolume } from '../../lib/volume'
import { cardioBetween } from '../../store/cardio'
import { activePlan, planAnswers } from '../../store/plans'
import { liftHistory, setsByWeek, topLifts } from '../../store/progress'
import { IconTrain } from '../../ui/icons'
import { Button, Chip, EmptyState, Group, ListRow, Segmented } from '../../ui/kit'
import { VolumeBars } from '../train/plan/VolumeBars'
import { ChartCard, Legend, TimeChart, WeekBars } from './charts'

const WEEKS = 12

export default function TrainingTab() {
  const navigate = useNavigate()
  const today = useToday()
  const monday = weekStart(today)
  const from = addDays(monday, -7 * (WEEKS - 1))
  const [which, setWhich] = useState<'this' | 'last'>('this')
  const byWeek = useLiveQuery(() => setsByWeek(from, addDays(monday, 6)), [from, monday])
  const plan = useLiveQuery(async () => (await activePlan()) ?? null, [])
  const lifts = useLiveQuery(() => topLifts(addDays(today, -365)), [today])
  const [lift, setLift] = useState<string | null>(null)
  const liftId = lift ?? lifts?.[0]?.id ?? null
  const history = useLiveQuery(async () => (liftId ? liftHistory(liftId) : []), [liftId])
  const cardio = useLiveQuery(() => cardioBetween(from, addDays(monday, 6)), [from, monday])

  const answers = plan ? planAnswers(plan.plan) : null
  const shown = which === 'this' ? monday : addDays(monday, -7)
  const volume = byWeek?.get(shown) ?? emptyVolume()
  const weeks = Array.from({ length: WEEKS }, (_, i) => addDays(from, i * 7))
  const cardioWeeks = weeks.map((w) => ({ week: w, value: weekMinutes((cardio ?? []).filter((s) => weekStart(s.date) === w)).moderateEquivalent }))
  const liftName = lifts?.find((l) => l.id === liftId)?.name ?? ''
  const series = useMemo(
    () => [
      { label: 'Weekly best', colorVar: '--train', points: history ?? [], mode: 'line' as const, endDot: true },
      { label: 'Week', colorVar: '--train', points: history ?? [], mode: 'points' as const },
    ],
    [history],
  )
  const liftFrom = history?.length ? [history[0].date, addDays(today, -365)].sort().at(-1)! : addDays(today, -84)

  if (byWeek && byWeek.size === 0 && cardio?.length === 0)
    return (
      <EmptyState icon={<IconTrain size={30} />} title="No training logged yet">
        Weekly sets per muscle, strength per lift and cardio minutes appear here once you log workouts.
        <div className="mt-5">
          <Button onClick={() => navigate('/train')}>Go to Train</Button>
        </div>
      </EmptyState>
    )

  return (
    <>
      <ChartCard
        title="Hard sets per muscle group"
        action={
          <Segmented
            size="sm"
            className="w-44"
            value={which}
            options={[
              { value: 'this' as const, label: 'This week' },
              { value: 'last' as const, label: 'Last' },
            ]}
            onChange={setWhich}
          />
        }
      >
        <div className="mt-3">
          <VolumeBars volume={volume} targets={answers ? weeklyTargets(answers) : undefined} caption={`Week of ${formatDayShort(shown)}: work sets, assisting muscles counted half`} />
        </div>
      </ChartCard>

      <ChartCard title="Strength: weekly best estimated 1RM, kg">
        {lifts && lifts.length > 0 ? (
          <>
            <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
              {lifts.map((l) => (
                <Chip key={l.id} active={l.id === liftId} onClick={() => setLift(l.id)}>
                  {l.name}
                </Chip>
              ))}
            </div>
            <div className="mt-2">
              <Legend items={[{ label: `${liftName}: best set each week, weight × (1 + reps ÷ 30)`, colorVar: '--train', kind: 'line' }]} />
            </div>
            <div className="mt-3">
              <TimeChart series={series} from={liftFrom} to={today} format={(n) => `${fmt1(n)} kg`} height={200} label={`${liftName}, weekly best estimated one-rep max`} />
            </div>
            {history && history.length > 0 && (
              <Group className="mt-3 !shadow-none">
                {history
                  .slice(-6)
                  .reverse()
                  .map((p) => (
                    <ListRow key={p.date} title={`Week of ${formatDayShort(p.date)}`} detail={<span className="font-semibold text-ink tabular-nums">{fmt1(p.value)} kg</span>} chevron={false} />
                  ))}
              </Group>
            )}
          </>
        ) : (
          <p className="mt-2 text-[14px] text-ink-2">Lifts appear once they have sets of 10 reps or fewer with a weight.</p>
        )}
      </ChartCard>

      <ChartCard
        title="Cardio, moderate-equivalent minutes a week"
        action={
          <Button size="sm" variant="ghost" onClick={() => navigate('/train/cardio')}>
            Details
          </Button>
        }
      >
        <div className="mt-2">
          <Legend
            items={[
              { label: 'Minutes (vigorous count double)', colorVar: '--train', kind: 'bar' },
              { label: "WHO's 150", colorVar: '--ink', kind: 'dash' },
            ]}
          />
        </div>
        <div className="mt-3">
          <WeekBars weeks={cardioWeeks} max={Math.max(...cardioWeeks.map((w) => w.value))} reference={{ value: WHO_WEEKLY_MIN, label: '150' }} format={fmtInt} colorVar="--train" unit="minutes" />
        </div>
      </ChartCard>
    </>
  )
}
