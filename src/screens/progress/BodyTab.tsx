// Body: weight as daily readings and a smoothed trend, weekly averages and the weekly
// rate against the goal's band; body fat as weekly averages only, since single
// readings are too noisy.

import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { db, type Metric } from '../../db'
import { useToday } from '../../hooks'
import { addDays, formatDate, formatDayShort } from '../../lib/dates'
import { fmt1, fmt2 } from '../../lib/format'
import { GOALS } from '../../lib/nutrition'
import { weeklyMeans } from '../../lib/progress'
import { rateStatus } from '../../lib/review'
import { ema, ratePctPerWeek, weeklyAverages } from '../../lib/trends'
import { deleteMetric, metricSeries, reduceDaily } from '../../store/metrics'
import { getActiveGoal } from '../../store/profile'
import { IconAlert, IconCheckCircle, IconScale, IconTrendDown, IconTrendFlat, IconTrendUp } from '../../ui/icons'
import { Button, Card, EmptyState, Group, ListRow, SectionTitle, Sheet } from '../../ui/kit'
import { useToast } from '../../ui/toast'
import { ChartCard, Legend, RangePicker, TimeChart, type Range } from './charts'

export default function BodyTab({ onLog }: { onLog: () => void }) {
  const toast = useToast()
  const today = useToday()
  const [range, setRange] = useState<Range>(84)
  const [entry, setEntry] = useState<Metric | null>(null)
  const rows = useLiveQuery(() => db.metrics.where('[type+date]').between(['weight', ''], ['weight', '￿']).toArray())
  const fat = useLiveQuery(() => metricSeries('bodyFat'), [])
  const goal = useLiveQuery(() => getActiveGoal())

  const all = useMemo(() => reduceDaily(rows ?? []), [rows])
  const trend = useMemo(() => ema(all), [all])
  const from = range ? addDays(today, -range + 1) : (all[0]?.date ?? today)
  const rate = ratePctPerWeek(trend, today)
  const band = goal ? GOALS[goal.type].rateBand : null
  const weeks = weeklyAverages(all).slice(-8).reverse()
  const fatWeeks = weeklyMeans(fat ?? []).slice(-8).reverse()
  const latestTrend = trend.at(-1)
  const status = rateStatus(rate, band)
  const TrendIcon = rate == null || Math.abs(rate) < 0.05 ? IconTrendFlat : rate > 0 ? IconTrendUp : IconTrendDown
  const series = useMemo(
    () => [
      { label: 'Trend', colorVar: '--body', points: trend, mode: 'area' as const, endDot: true },
      { label: 'Daily reading', colorVar: '--ink-3', points: all, mode: 'points' as const },
    ],
    [trend, all],
  )

  const remove = async (m: Metric) => {
    await deleteMetric(m.id)
    setEntry(null)
    toast({ message: `Reading of ${formatDate(m.date)} deleted`, action: { label: 'Undo', onClick: () => void db.metrics.put(m) } })
  }

  const recent = (rows ?? []).slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30)

  if (all.length === 0)
    return (
      <EmptyState icon={<IconScale size={30} />} title="No weight readings yet">
        Weigh yourself in the morning, after the bathroom and before eating. Daily readings swing by a kilo or more; the trend smooths that out.
        <div className="mt-5">
          <Button onClick={onLog}>Log weight</Button>
        </div>
      </EmptyState>
    )

  return (
    <>
      <Card tone="body" className="animate-rise !p-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[13px] font-semibold text-ink-2">Trend weight</p>
            <p className="mt-1 text-[56px] font-bold leading-none tracking-[-0.045em]">
              {latestTrend ? fmt1(latestTrend.value) : '–'}
              <span className="ml-1 text-[20px] font-semibold tracking-normal text-ink-2">kg</span>
            </p>
          </div>
          <div className="text-right">
            <p className="flex items-center justify-end gap-1 text-[22px] font-bold tracking-tight">
              <TrendIcon size={20} strokeWidth={2.4} />
              {rate == null ? '–' : `${rate > 0 ? '+' : ''}${fmt2(Math.round(rate * 100) / 100)}%`}
            </p>
            <p className="text-[13px] text-ink-2">per week, 14 days</p>
          </div>
        </div>
        {band && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px]">
            <span className="text-ink-2">
              Goal {band[0] > 0 ? '+' : ''}
              {fmt2(band[0])} to {band[1] > 0 ? '+' : ''}
              {fmt2(band[1])}% a week
            </span>
            {status && (
              <span
                className={
                  status === 'on'
                    ? 'inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 font-semibold text-brand-ink'
                    : 'inline-flex items-center gap-1 rounded-full bg-warn-soft px-2.5 py-1 font-semibold text-warn-ink'
                }
              >
                {status === 'on' ? <IconCheckCircle size={14} /> : <IconAlert size={14} />}
                {status === 'on' ? 'On track' : status === 'fast' ? 'Faster than advised' : status === 'below' ? 'Below the range' : 'Above the range'}
              </span>
            )}
          </div>
        )}
        {rate == null && <p className="mt-3 text-[13px] text-ink-2">The rate appears once readings reach back 14 days.</p>}
      </Card>

      <RangePicker value={range} onChange={setRange} />

      <ChartCard title="Body weight, kg">
        <div className="mt-1.5">
          <Legend
            items={[
              { label: 'Daily reading', colorVar: '--ink-3', kind: 'dot' },
              { label: 'Trend (each reading moves it 10%)', colorVar: '--body', kind: 'line' },
            ]}
          />
        </div>
        <div className="mt-3">
          <TimeChart series={series} from={from} to={today} format={(n) => `${fmt1(n)} kg`} height={240} label={`Body weight from ${formatDate(from)}: trend ${latestTrend ? fmt1(latestTrend.value) : '–'} kg`} />
        </div>
      </ChartCard>

      <SectionTitle>Weekly averages</SectionTitle>
      <Group>
        {weeks.map((w, i) => {
          const prev = weeks[i + 1]?.avg
          const diff = w.avg != null && prev != null ? w.avg - prev : null
          return (
            <ListRow
              key={w.week}
              title={`Week of ${formatDayShort(w.week)}`}
              subtitle={`${w.days} of 7 days${w.avg == null ? ' · 4 needed for an average' : ''}`}
              detail={
                w.avg != null ? (
                  <span className="block text-right">
                    <span className="block font-semibold text-ink tabular-nums">{fmt2(Math.round(w.avg * 10) / 10)} kg</span>
                    {diff != null && <span className="block text-[12px] tabular-nums">{`${diff > 0 ? '+' : ''}${fmt2(Math.round(diff * 10) / 10)} kg`}</span>}
                  </span>
                ) : (
                  '–'
                )
              }
            />
          )
        })}
      </Group>

      {fatWeeks.length > 0 && (
        <>
          <SectionTitle>Body fat, weekly average</SectionTitle>
          <Group>
            {fatWeeks.map((w) => (
              <ListRow key={w.week} title={`Week of ${formatDayShort(w.week)}`} subtitle={`${w.days} ${w.days === 1 ? 'reading' : 'readings'}`} detail={<span className="font-semibold text-ink tabular-nums">{fmt1(w.mean)}%</span>} />
            ))}
          </Group>
          <p className="mt-2 px-1 text-[13px] text-ink-2">Scales estimate body fat from electrical resistance, which shifts with water; only weekly averages are shown.</p>
        </>
      )}

      <SectionTitle>Readings</SectionTitle>
      <Group>
        {recent.map((m) => (
          <ListRow key={m.id} title={<span className="tabular-nums">{fmt2(m.value)} kg</span>} subtitle={`${formatDate(m.date)}${m.source !== 'manual' ? ` · ${m.source === 'health' ? 'Apple Health' : m.source}` : ''}`} onClick={() => setEntry(m)} />
        ))}
      </Group>

      <Sheet open={!!entry} onClose={() => setEntry(null)} title={entry ? `${fmt2(entry.value)} kg on ${formatDate(entry.date)}` : ''}>
        {entry && (
          <div className="space-y-3 pb-2">
            <p className="text-[15px] text-ink-2">To change a reading, log the weight again for the same day; it replaces this one.</p>
            <Button block size="lg" variant="danger" onClick={() => void remove(entry)}>
              Delete reading
            </Button>
          </div>
        )}
      </Sheet>
    </>
  )
}
