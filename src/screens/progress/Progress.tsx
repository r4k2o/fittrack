// Progress, phase 1: body weight as daily readings, a smoothed trend, weekly
// averages and the weekly rate against the goal's band. No chart presents a single
// noisy day as progress. Training, nutrition and photo trends follow in phase 4.

import { CategoryScale, Chart, Filler, LinearScale, LineController, LineElement, PointElement, Tooltip, type Plugin } from 'chart.js'
import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Line } from 'react-chartjs-2'
import { db, type Metric } from '../../db'
import { useColorScheme, useToday } from '../../hooks'
import { addDays, daysBetween, formatDate, formatDayShort } from '../../lib/dates'
import { fmt1, fmt2 } from '../../lib/format'
import { GOALS } from '../../lib/nutrition'
import { ema, ratePctPerWeek, weeklyAverages } from '../../lib/trends'
import { deleteMetric, reduceDaily } from '../../store/metrics'
import { getActiveGoal } from '../../store/profile'
import { IconAlert, IconCheckCircle, IconPlus, IconScale, IconTrendDown, IconTrendFlat, IconTrendUp } from '../../ui/icons'
import { Button, Card, EmptyState, Group, ListRow, Screen, SectionTitle, Segmented, Sheet } from '../../ui/kit'
import { useToast } from '../../ui/toast'
import { WeightSheet } from '../shared/WeightSheet'

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler)

type Range = 28 | 84 | 365 | 0

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

/** "#0891b2" → "rgba(8,145,178,a)" for Chart.js, which cannot parse CSS colour functions. */
function withAlpha(hex: string, a: number): string {
  const h = hex.replace('#', '')
  if (h.length !== 6) return hex
  const n = parseInt(h, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

/** A hairline crosshair at the hovered day. */
const crosshair: Plugin<'line'> = {
  id: 'crosshair',
  afterDatasetsDraw(chart) {
    const active = chart.tooltip?.getActiveElements()
    if (!active?.length) return
    const x = active[0].element.x
    const { top, bottom } = chart.chartArea
    const ctx = chart.ctx
    ctx.save()
    ctx.strokeStyle = css('--ink-3')
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x, top)
    ctx.lineTo(x, bottom)
    ctx.stroke()
    ctx.restore()
  },
}

export default function Progress() {
  const toast = useToast()
  const today = useToday()
  const scheme = useColorScheme()
  const [range, setRange] = useState<Range>(84)
  const [logOpen, setLogOpen] = useState(false)
  const [entry, setEntry] = useState<Metric | null>(null)
  const rows = useLiveQuery(() => db.metrics.where('[type+date]').between(['weight', ''], ['weight', '￿']).toArray())
  const goal = useLiveQuery(() => getActiveGoal())

  const all = useMemo(() => reduceDaily(rows ?? []), [rows])
  const trend = useMemo(() => ema(all), [all])
  const from = range ? addDays(today, -range + 1) : (all[0]?.date ?? today)
  const shown = all.filter((p) => p.date >= from)
  const shownTrend = trend.filter((p) => p.date >= from)
  const rate = ratePctPerWeek(trend, today)
  const band = goal ? GOALS[goal.type].rateBand : null
  const weeks = weeklyAverages(all).slice(-8).reverse()
  const latestTrend = trend.at(-1)
  const tooFast = rate != null && (rate < -1 || rate > 0.5)
  const status =
    rate == null || !band ? null : tooFast ? 'fast' : rate < band[0] - 0.05 ? 'below' : rate > band[1] + 0.05 ? 'above' : 'on'
  const TrendIcon = rate == null || Math.abs(rate) < 0.05 ? IconTrendFlat : rate > 0 ? IconTrendUp : IconTrendDown

  const data = useMemo(() => {
    const x = (d: string) => daysBetween(from, d)
    const accent = css('--body')
    const surface = css('--surface')
    const n = shownTrend.length
    return {
      datasets: [
        {
          label: 'Trend',
          data: shownTrend.map((p) => ({ x: x(p.date), y: Math.round(p.value * 100) / 100 })),
          borderColor: accent,
          borderWidth: 2,
          borderCapStyle: 'round' as const,
          borderJoinStyle: 'round' as const,
          backgroundColor: withAlpha(accent, 0.1),
          fill: 'start' as const,
          tension: 0.35,
          pointRadius: shownTrend.map((_, i) => (i === n - 1 ? 4 : 0)),
          pointHoverRadius: 5,
          pointBackgroundColor: accent,
          pointBorderColor: surface,
          pointBorderWidth: 2,
          order: 1,
        },
        {
          label: 'Daily reading',
          data: shown.map((p) => ({ x: x(p.date), y: p.value })),
          showLine: false,
          pointRadius: shown.length > 120 ? 2.5 : 4,
          pointHoverRadius: 5,
          pointBackgroundColor: css('--ink-3'),
          pointBorderColor: surface,
          pointBorderWidth: 2,
          order: 2,
        },
      ],
    }
    // the scheme switch re-reads the CSS colours
  }, [shown, shownTrend, from, scheme]) // eslint-disable-line

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      interaction: { mode: 'nearest' as const, axis: 'x' as const, intersect: false },
      layout: { padding: { top: 6, right: 6 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: css('--ink'),
          titleColor: css('--page'),
          bodyColor: css('--page'),
          padding: 10,
          cornerRadius: 12,
          displayColors: false,
          callbacks: {
            title: (items: { parsed: { x: number | null } }[]) => formatDayShort(addDays(from, items[0]?.parsed.x ?? 0)),
            label: (item: { dataset: { label?: string }; parsed: { y: number | null } }) => `${item.dataset.label}: ${fmt2(item.parsed.y ?? 0)} kg`,
          },
        },
      },
      scales: {
        x: {
          type: 'linear' as const,
          min: 0,
          max: Math.max(1, daysBetween(from, today)),
          grid: { display: false },
          border: { color: css('--line') },
          ticks: { color: css('--ink-3'), maxTicksLimit: 5, font: { size: 11 }, callback: (v: number | string) => formatDayShort(addDays(from, Number(v))).replace(/^\w+ /, '') },
        },
        y: {
          grid: { color: css('--grid'), lineWidth: 1 },
          border: { display: false },
          ticks: { color: css('--ink-3'), maxTicksLimit: 5, font: { size: 11 }, callback: (v: number | string) => fmt1(Number(v)) },
        },
      },
    }),
    [from, today, scheme], // eslint-disable-line
  )

  const remove = async (m: Metric) => {
    await deleteMetric(m.id)
    setEntry(null)
    toast({ message: `Reading of ${formatDate(m.date)} deleted`, action: { label: 'Undo', onClick: () => void db.metrics.put(m) } })
  }

  const recent = (rows ?? []).slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30)

  return (
    <Screen
      tone="body"
      eyebrow="Body weight"
      title="Progress"
      actions={
        <Button size="sm" variant="glass" onClick={() => setLogOpen(true)}>
          <IconPlus size={16} strokeWidth={2.6} /> Log
        </Button>
      }
    >
      {all.length === 0 ? (
        <EmptyState icon={<IconScale size={30} />} title="No weight readings yet">
          Weigh yourself in the morning, after the bathroom and before eating. Daily readings swing by a kilo or more; the trend smooths that out.
          <div className="mt-5">
            <Button onClick={() => setLogOpen(true)}>Log weight</Button>
          </div>
        </EmptyState>
      ) : (
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

          <Segmented
            className="mt-4"
            size="sm"
            value={range}
            options={[
              { value: 28 as Range, label: '4 weeks' },
              { value: 84 as Range, label: '12 weeks' },
              { value: 365 as Range, label: '1 year' },
              { value: 0 as Range, label: 'All' },
            ]}
            onChange={setRange}
          />

          <Card className="mt-3 !p-4">
            <h2 className="text-[16px] font-bold">Body weight, kg</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-4 text-[12px] font-medium text-ink-2">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full" style={{ background: 'var(--ink-3)' }} /> Daily reading
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded-full" style={{ background: 'var(--body)' }} /> Trend (each reading moves it 10%)
              </span>
            </div>
            <div className="mt-3 h-60">
              <Line data={data} options={options} plugins={[crosshair]} />
            </div>
          </Card>

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

          <SectionTitle>Readings</SectionTitle>
          <Group>
            {recent.map((m) => (
              <ListRow
                key={m.id}
                title={<span className="tabular-nums">{fmt2(m.value)} kg</span>}
                subtitle={`${formatDate(m.date)}${m.source !== 'manual' ? ` · ${m.source}` : ''}`}
                onClick={() => setEntry(m)}
              />
            ))}
          </Group>
        </>
      )}

      <WeightSheet open={logOpen} onClose={() => setLogOpen(false)} />
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
    </Screen>
  )
}
