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
      { label: 'Tageswert', colorVar: '--ink-3', points: all, mode: 'points' as const },
    ],
    [trend, all],
  )

  const remove = async (m: Metric) => {
    await deleteMetric(m.id)
    setEntry(null)
    toast({ message: `Wert vom ${formatDate(m.date)} gelöscht`, action: { label: 'Rückgängig', onClick: () => void db.metrics.put(m) } })
  }

  const recent = (rows ?? []).slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30)

  if (all.length === 0)
    return (
      <EmptyState icon={<IconScale size={30} />} title="Noch keine Gewichtswerte">
        Wieg dich morgens nach der Toilette und vor dem Frühstück. Tageswerte schwanken um ein Kilo und mehr; der Trend glättet das.
        <div className="mt-5">
          <Button onClick={onLog}>Gewicht eintragen</Button>
        </div>
      </EmptyState>
    )

  return (
    <>
      <Card className="animate-rise !p-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[13px] font-semibold text-ink-2">Trendgewicht</p>
            <p className="mt-1 text-[56px] font-bold leading-none tracking-[-0.045em]">
              {latestTrend ? fmt1(latestTrend.value) : '–'}
              <span className="ml-1 text-[20px] font-semibold tracking-normal text-ink-2">kg</span>
            </p>
          </div>
          <div className="text-right">
            <p className="flex items-center justify-end gap-1 text-[22px] font-bold tracking-tight">
              <TrendIcon size={20} strokeWidth={2.4} />
              {rate == null ? '–' : `${rate > 0 ? '+' : ''}${fmt2(Math.round(rate * 100) / 100)} %`}
            </p>
            <p className="text-[13px] text-ink-2">pro Woche, 14 Tage</p>
          </div>
        </div>
        {band && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px]">
            <span className="text-ink-2">
              Ziel {band[0] > 0 ? '+' : ''}
              {fmt2(band[0])} bis {band[1] > 0 ? '+' : ''}
              {fmt2(band[1])} % pro Woche
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
                {status === 'on' ? 'Im Zielbereich' : status === 'fast' ? 'Schneller als empfohlen' : status === 'below' ? 'Unter dem Zielbereich' : 'Über dem Zielbereich'}
              </span>
            )}
          </div>
        )}
        {rate == null && <p className="mt-3 text-[13px] text-ink-2">Die Rate erscheint, sobald Werte 14 Tage zurückreichen.</p>}
      </Card>

      <RangePicker value={range} onChange={setRange} />

      <ChartCard title="Körpergewicht, kg">
        <div className="mt-1.5">
          <Legend
            items={[
              { label: 'Tageswert', colorVar: '--ink-3', kind: 'dot' },
              { label: 'Trend (jeder Wert zählt 10 %)', colorVar: '--body', kind: 'line' },
            ]}
          />
        </div>
        <div className="mt-3">
          <TimeChart series={series} from={from} to={today} format={(n) => `${fmt1(n)} kg`} height={240} label={`Körpergewicht seit ${formatDate(from)}: Trend ${latestTrend ? fmt1(latestTrend.value) : '–'} kg`} />
        </div>
      </ChartCard>

      <SectionTitle>Wochenschnitt</SectionTitle>
      <Group>
        {weeks.map((w, i) => {
          const prev = weeks[i + 1]?.avg
          const diff = w.avg != null && prev != null ? w.avg - prev : null
          return (
            <ListRow
              key={w.week}
              title={`Woche ab ${formatDayShort(w.week)}`}
              subtitle={`${w.days} von 7 Tagen${w.avg == null ? ' · 4 nötig für einen Schnitt' : ''}`}
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
          <SectionTitle>Körperfett, Wochenschnitt</SectionTitle>
          <Group>
            {fatWeeks.map((w) => (
              <ListRow key={w.week} title={`Woche ab ${formatDayShort(w.week)}`} subtitle={`${w.days} ${w.days === 1 ? 'Wert' : 'Werte'}`} detail={<span className="font-semibold text-ink tabular-nums">{fmt1(w.mean)} %</span>} />
            ))}
          </Group>
          <p className="mt-2 px-1 text-[13px] text-ink-2">Waagen schätzen Körperfett über den Widerstand, der mit dem Wasserhaushalt schwankt; daher nur Wochenschnitte.</p>
        </>
      )}

      <SectionTitle>Werte</SectionTitle>
      <Group>
        {recent.map((m) => (
          <ListRow key={m.id} title={<span className="tabular-nums">{fmt2(m.value)} kg</span>} subtitle={`${formatDate(m.date)}${m.source !== 'manual' ? ` · ${m.source === 'health' ? 'Apple Health' : m.source}` : ''}`} onClick={() => setEntry(m)} />
        ))}
      </Group>

      <Sheet open={!!entry} onClose={() => setEntry(null)} title={entry ? `${fmt2(entry.value)} kg am ${formatDate(entry.date)}` : ''}>
        {entry && (
          <div className="space-y-3 pb-2">
            <p className="text-[15px] text-ink-2">Zum Ändern das Gewicht für denselben Tag nochmal eintragen; es ersetzt diesen Wert.</p>
            <Button block size="lg" variant="danger" onClick={() => void remove(entry)}>
              Wert löschen
            </Button>
          </div>
        )}
      </Sheet>
    </>
  )
}
