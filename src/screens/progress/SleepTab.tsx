// Sleep and steps from the Health import: nightly sleep with a 7-day moving average,
// the sleep score (saying whether it is typed in or the app's own), and weekly average
// steps.

import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../../db'
import { useToday } from '../../hooks'
import { addDays, formatDate, weekStart } from '../../lib/dates'
import { fmtInt, fmtSleep } from '../../lib/format'
import { movingAverage, weeklyMeans } from '../../lib/progress'
import { metricSeries } from '../../store/metrics'
import { IconMoon } from '../../ui/icons'
import { Button, EmptyState } from '../../ui/kit'
import { ChartCard, Legend, RangePicker, TimeChart, WeekBars, type Range } from './charts'

const WEEKS = 12

export default function SleepTab() {
  const navigate = useNavigate()
  const today = useToday()
  const [range, setRange] = useState<Range>(84)
  const sleep = useLiveQuery(() => metricSeries('sleepMin'), [])
  const steps = useLiveQuery(() => metricSeries('steps'), [])
  const scores = useLiveQuery(() => db.metrics.where('[type+date]').between(['sleepScore', ''], ['sleepScore', '￿']).toArray(), [])

  const from = range ? addDays(today, -range + 1) : ([sleep?.[0]?.date, steps?.[0]?.date].filter(Boolean).sort()[0] ?? today)
  const sleepMa = useMemo(() => movingAverage(sleep ?? []), [sleep])
  const typed = (scores ?? []).filter((s) => s.source !== 'computed')
  const scoreSource = typed.length ? 'typed' : 'computed'
  const scorePoints = useMemo(() => (scores ?? []).filter((s) => (scoreSource === 'typed' ? s.source !== 'computed' : s.source === 'computed')).map((s) => ({ date: s.date, value: s.value })), [scores, scoreSource])
  const scoreMa = useMemo(() => movingAverage(scorePoints), [scorePoints])
  const monday = weekStart(today)
  const weeks = Array.from({ length: WEEKS }, (_, i) => addDays(monday, -7 * (WEEKS - 1 - i)))
  const stepMeans = weeklyMeans(steps ?? [])
  const stepBars = weeks.map((w) => ({ week: w, value: stepMeans.find((m) => m.week === w)?.mean ?? null }))

  const sleepSeries = useMemo(
    () => [
      { label: '7-day average', colorVar: '--indigo', points: sleepMa.map((p) => ({ date: p.date, value: p.value / 60 })), mode: 'line' as const, endDot: true },
      { label: 'Night', colorVar: '--ink-3', points: (sleep ?? []).map((p) => ({ date: p.date, value: p.value / 60 })), mode: 'points' as const },
    ],
    [sleep, sleepMa],
  )
  const scoreSeries = useMemo(() => [{ label: '7-day average', colorVar: '--indigo', points: scoreMa, mode: 'line' as const, endDot: true }], [scoreMa])

  if (sleep && steps && sleep.length === 0 && steps.length === 0)
    return (
      <EmptyState icon={<IconMoon size={30} />} title="No sleep or steps yet">
        Both arrive through the Apple Health import: a Shortcut writes them to a file, and the app reads it in two taps.
        <div className="mt-5">
          <Button onClick={() => navigate('/more/health')}>Set up the import</Button>
        </div>
      </EmptyState>
    )

  const lastAvg = sleepMa.at(-1)
  return (
    <>
      <RangePicker value={range} onChange={setRange} />
      {sleep && sleep.length > 0 && (
        <ChartCard title="Sleep, hours a night, 7-day average">
          <p className="mt-1 text-[13px] text-ink-2">{lastAvg ? `${fmtSleep(lastAvg.value)} on average in the 7 days to ${formatDate(lastAvg.date)}` : 'The average appears after 4 nights in a week.'}</p>
          <div className="mt-2">
            <Legend
              items={[
                { label: 'Night', colorVar: '--ink-3', kind: 'dot' },
                { label: '7-day average', colorVar: '--indigo', kind: 'line' },
              ]}
            />
          </div>
          <div className="mt-3">
            <TimeChart series={sleepSeries} from={from} to={today} format={(n) => fmtSleep(n * 60)} height={200} label="Sleep per night with a 7-day average" />
          </div>
        </ChartCard>
      )}
      {scorePoints.length > 0 && (
        <ChartCard title={`Sleep score, 7-day average (${scoreSource === 'typed' ? 'typed in from Health' : "the app's own"})`}>
          <p className="mt-1 text-[13px] text-ink-2">
            {scoreSource === 'typed'
              ? 'Scores you entered from the Health app.'
              : "Computed from duration (60 points for 7.5 hours), bedtime regularity (20) and interruptions (20). Apple's score has no API."}
          </p>
          <div className="mt-3">
            <TimeChart series={scoreSeries} from={from} to={today} format={(n) => fmtInt(n)} height={180} label="Sleep score, 7-day average" />
          </div>
        </ChartCard>
      )}
      {steps && steps.length > 0 && (
        <ChartCard title="Steps, daily average per week">
          <div className="mt-3">
            <WeekBars weeks={stepBars} max={Math.max(0, ...stepBars.map((w) => w.value ?? 0))} format={fmtInt} colorVar="--indigo" unit="steps a day" />
          </div>
        </ChartCard>
      )}
    </>
  )
}
