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
      { label: '7-Tage-Schnitt', colorVar: '--indigo', points: sleepMa.map((p) => ({ date: p.date, value: p.value / 60 })), mode: 'line' as const, endDot: true },
      { label: 'Nacht', colorVar: '--ink-3', points: (sleep ?? []).map((p) => ({ date: p.date, value: p.value / 60 })), mode: 'points' as const },
    ],
    [sleep, sleepMa],
  )
  const scoreSeries = useMemo(() => [{ label: '7-Tage-Schnitt', colorVar: '--indigo', points: scoreMa, mode: 'line' as const, endDot: true }], [scoreMa])

  if (sleep && steps && sleep.length === 0 && steps.length === 0)
    return (
      <EmptyState icon={<IconMoon size={30} />} title="Noch kein Schlaf und keine Schritte">
        Beides kommt über den Apple-Health-Import: Ein Kurzbefehl schreibt die Daten in eine Datei, die App liest sie mit zwei Tippern.
        <div className="mt-5">
          <Button onClick={() => navigate('/more/health')}>Import einrichten</Button>
        </div>
      </EmptyState>
    )

  const lastAvg = sleepMa.at(-1)
  return (
    <>
      <RangePicker value={range} onChange={setRange} />
      {sleep && sleep.length > 0 && (
        <ChartCard title="Schlaf pro Nacht, 7-Tage-Schnitt">
          <p className="mt-1 text-[13px] text-ink-2">{lastAvg ? `Im Schnitt ${fmtSleep(lastAvg.value)} in den 7 Tagen bis ${formatDate(lastAvg.date)}` : 'Der Schnitt erscheint nach 4 Nächten in einer Woche.'}</p>
          <div className="mt-2">
            <Legend
              items={[
                { label: 'Nacht', colorVar: '--ink-3', kind: 'dot' },
                { label: '7-Tage-Schnitt', colorVar: '--indigo', kind: 'line' },
              ]}
            />
          </div>
          <div className="mt-3">
            <TimeChart series={sleepSeries} from={from} to={today} format={(n) => fmtSleep(n * 60)} height={200} label="Schlaf pro Nacht mit 7-Tage-Schnitt" />
          </div>
        </ChartCard>
      )}
      {scorePoints.length > 0 && (
        <ChartCard title={`Schlafscore, 7-Tage-Schnitt (${scoreSource === 'typed' ? 'aus Health eingetragen' : 'von der App'})`}>
          <p className="mt-1 text-[13px] text-ink-2">
            {scoreSource === 'typed'
              ? 'Scores, die du aus der Health-App eingetragen hast.'
              : 'Berechnet aus Dauer (60 Punkte für 7,5 Stunden), Regelmäßigkeit der Schlafenszeit (20) und Unterbrechungen (20). Apples Score hat keine Schnittstelle.'}
          </p>
          <div className="mt-3">
            <TimeChart series={scoreSeries} from={from} to={today} format={(n) => fmtInt(n)} height={180} label="Schlafscore, 7-Tage-Schnitt" />
          </div>
        </ChartCard>
      )}
      {steps && steps.length > 0 && (
        <ChartCard title="Schritte, Tagesschnitt pro Woche">
          <div className="mt-3">
            <WeekBars weeks={stepBars} max={Math.max(0, ...stepBars.map((w) => w.value ?? 0))} format={fmtInt} colorVar="--indigo" unit="Schritte am Tag" />
          </div>
        </ChartCard>
      )}
    </>
  )
}
