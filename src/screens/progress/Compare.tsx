// Any two series on one time axis, as two charts stacked with a shared crosshair rather
// than one chart with two y-axes. The app shows the overlap and makes no causal claim.

import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { db } from '../../db'
import { useToday } from '../../hooks'
import { weekMinutes } from '../../lib/cardio'
import { addDays, weekStart } from '../../lib/dates'
import { fmt1, fmtInt, fmtSleep } from '../../lib/format'
import { movingAverage, weeklyMeans } from '../../lib/progress'
import { ema, type DayValue } from '../../lib/trends'
import { metricSeries } from '../../store/metrics'
import { dayIntakes, liftHistory, topLifts } from '../../store/progress'
import { Notice, Screen } from '../../ui/kit'
import { ChartCard, RangePicker, TimeChart, type Range } from './charts'

type Key = 'weight' | 'bodyFat' | 'steps' | 'sleep' | 'sleepScore' | 'kcal' | 'protein' | 'strength' | 'cardio'

const OPTIONS: { key: Key; label: string; unit: string; format: (n: number) => string }[] = [
  { key: 'weight', label: 'Weight trend', unit: 'kg', format: (n) => `${fmt1(n)} kg` },
  { key: 'bodyFat', label: 'Body fat, weekly average', unit: '%', format: (n) => `${fmt1(n)}%` },
  { key: 'steps', label: 'Steps, 7-day average', unit: 'steps', format: fmtInt },
  { key: 'sleep', label: 'Sleep, 7-day average', unit: 'h', format: (n) => fmtSleep(n * 60) },
  { key: 'sleepScore', label: 'Sleep score, 7-day average', unit: '', format: fmtInt },
  { key: 'kcal', label: 'Calories eaten, 7-day average', unit: 'kcal', format: (n) => `${fmtInt(n)} kcal` },
  { key: 'protein', label: 'Protein, 7-day average', unit: 'g', format: (n) => `${fmtInt(n)} g` },
  { key: 'strength', label: 'Estimated 1RM, top lift, weekly best', unit: 'kg', format: (n) => `${fmt1(n)} kg` },
  { key: 'cardio', label: 'Cardio minutes per week', unit: 'min', format: (n) => `${fmtInt(n)} min` },
]

async function load(key: Key, from: string, to: string): Promise<{ points: DayValue[]; note?: string }> {
  switch (key) {
    case 'weight':
      return { points: ema(await metricSeries('weight')) }
    case 'bodyFat':
      return { points: weeklyMeans(await metricSeries('bodyFat')).map((w) => ({ date: w.week, value: w.mean })) }
    case 'steps':
      return { points: movingAverage(await metricSeries('steps')) }
    case 'sleep':
      return { points: movingAverage(await metricSeries('sleepMin')).map((p) => ({ date: p.date, value: p.value / 60 })) }
    case 'sleepScore':
      return { points: movingAverage(await metricSeries('sleepScore')) }
    case 'kcal':
    case 'protein': {
      const days = await dayIntakes(addDays(from, -7), to)
      return { points: movingAverage(days.filter((d) => d.kcal > 0).map((d) => ({ date: d.date, value: key === 'kcal' ? d.kcal : d.protein }))) }
    }
    case 'strength': {
      const [top] = await topLifts(addDays(to, -365), 1)
      return top ? { points: await liftHistory(top.id), note: top.name } : { points: [] }
    }
    case 'cardio': {
      const rows = await db.cardioSessions.where('date').between(addDays(from, -7), to, true, true).toArray()
      const weeks = new Map<string, typeof rows>()
      for (const r of rows) weeks.set(weekStart(r.date), [...(weeks.get(weekStart(r.date)) ?? []), r])
      return { points: [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, list]) => ({ date, value: weekMinutes(list).moderateEquivalent })) }
    }
  }
}

function Select({ value, onChange, label }: { value: Key; onChange: (k: Key) => void; label: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block px-1 text-[13px] font-semibold text-ink-2">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as Key)} className="min-h-12 w-full rounded-2xl bg-fill px-4 text-[17px] outline-none focus:ring-2 focus:ring-accent">
        {OPTIONS.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export default function Compare() {
  const today = useToday()
  const [a, setA] = useState<Key>('sleep')
  const [b, setB] = useState<Key>('strength')
  const [range, setRange] = useState<Range>(84)
  const [hover, setHover] = useState<string | null>(null)
  const from = range ? addDays(today, -range + 1) : addDays(today, -730)
  const dataA = useLiveQuery(() => load(a, from, today), [a, from, today])
  const dataB = useLiveQuery(() => load(b, from, today), [b, from, today])
  const optA = OPTIONS.find((o) => o.key === a)!
  const optB = OPTIONS.find((o) => o.key === b)!
  const seriesA = useMemo(() => [{ label: optA.label, colorVar: '--body', points: dataA?.points ?? [], mode: 'line' as const, endDot: true }], [dataA, optA])
  const seriesB = useMemo(() => [{ label: optB.label, colorVar: '--train', points: dataB?.points ?? [], mode: 'line' as const, endDot: true }], [dataB, optB])
  const empty = (d?: { points: DayValue[] }) => !!d && !d.points.some((p) => p.date >= from)

  return (
    <Screen back="/progress" title="Compare" tone="body">
      <div className="grid grid-cols-1 gap-3 pt-1">
        <Select label="Top chart" value={a} onChange={setA} />
        <Select label="Bottom chart" value={b} onChange={setB} />
      </div>
      <RangePicker value={range} onChange={setRange} />
      <ChartCard title={`${optA.label}${dataA?.note ? ` (${dataA.note})` : ''}`}>
        {empty(dataA) ? (
          <p className="mt-2 text-[14px] text-ink-2">No data in this range.</p>
        ) : (
          <div className="mt-3">
            <TimeChart series={seriesA} from={from} to={today} format={optA.format} height={180} hover={hover} onHover={setHover} label={optA.label} />
          </div>
        )}
      </ChartCard>
      <ChartCard title={`${optB.label}${dataB?.note ? ` (${dataB.note})` : ''}`}>
        {empty(dataB) ? (
          <p className="mt-2 text-[14px] text-ink-2">No data in this range.</p>
        ) : (
          <div className="mt-3">
            <TimeChart series={seriesB} from={from} to={today} format={optB.format} height={180} hover={hover} onHover={setHover} label={optB.label} />
          </div>
        )}
      </ChartCard>
      <Notice className="mt-3">Both charts share one time axis. Lines moving together show an overlap, not that one causes the other.</Notice>
    </Screen>
  )
}
