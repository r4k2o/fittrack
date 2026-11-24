// Progress, phase 1: body weight as daily readings, a smoothed trend, weekly
// averages and the weekly rate against the goal's band. No chart presents a single
// noisy day as progress. Training, nutrition and photo trends follow in phase 4.

import { CategoryScale, Chart, Filler, LinearScale, LineController, LineElement, PointElement, ScatterController, Tooltip } from 'chart.js'
import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Line } from 'react-chartjs-2'
import type { Metric } from '../../db'
import { db } from '../../db'
import { useToday } from '../../hooks'
import { addDays, daysBetween, formatDate, formatDayShort } from '../../lib/dates'
import { fmt1, fmt2 } from '../../lib/format'
import { GOALS } from '../../lib/nutrition'
import { ema, ratePctPerWeek, weeklyAverages } from '../../lib/trends'
import { deleteMetric, reduceDaily } from '../../store/metrics'
import { getActiveGoal } from '../../store/profile'
import { IconPlus, IconScale } from '../../ui/icons'
import { Button, Card, cx, EmptyState, Group, ListRow, Screen, SectionTitle, Segmented, Sheet } from '../../ui/kit'
import { useToast } from '../../ui/toast'
import { WeightSheet } from '../shared/WeightSheet'

Chart.register(LineController, ScatterController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler)

type Range = 28 | 84 | 365 | 0

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

export default function Progress() {
  const toast = useToast()
  const today = useToday()
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

  const data = useMemo(() => {
    const x = (d: string) => daysBetween(from, d)
    return {
      datasets: [
        {
          type: 'line' as const,
          label: 'Trend',
          data: shownTrend.map((p) => ({ x: x(p.date), y: Math.round(p.value * 100) / 100 })),
          borderColor: css('--accent'),
          borderWidth: 2.5,
          pointRadius: 0,
          tension: 0.3,
        },
        {
          type: 'line' as const,
          label: 'Reading',
          data: shown.map((p) => ({ x: x(p.date), y: p.value })),
          showLine: false,
          pointRadius: shown.length > 120 ? 1.5 : 3,
          pointBackgroundColor: css('--faint'),
          pointBorderWidth: 0,
        },
      ],
    }
  }, [shown, shownTrend, from])

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: false as const,
      interaction: { mode: 'nearest' as const, intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
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
          border: { display: false },
          ticks: { color: css('--faint'), maxTicksLimit: 5, callback: (v: number | string) => formatDayShort(addDays(from, Number(v))).replace(/^\w+ /, '') },
        },
        y: {
          grid: { color: css('--line') },
          border: { display: false },
          ticks: { color: css('--faint'), maxTicksLimit: 5, callback: (v: number | string) => fmt1(Number(v)) },
        },
      },
    }),
    [from, today],
  )

  const remove = async (m: Metric) => {
    await deleteMetric(m.id)
    setEntry(null)
    toast({ message: `Reading of ${formatDate(m.date)} deleted`, action: { label: 'Undo', onClick: () => void db.metrics.put(m) } })
  }

  const recent = (rows ?? []).slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30)
  const outOfBand = rate != null && band ? rate < band[0] - 0.05 || rate > band[1] + 0.05 : false
  const tooFast = rate != null && (rate < -1 || rate > 0.5)

  return (
    <Screen
      title="Progress"
      subtitle="Body weight"
      actions={
        <Button size="sm" variant="ghost" onClick={() => setLogOpen(true)}>
          <IconPlus size={18} /> Log
        </Button>
      }
    >
      {all.length === 0 ? (
        <EmptyState icon={<IconScale size={36} />} title="No weight readings yet">
          Weigh yourself in the morning, after the bathroom and before eating. Daily readings swing by a kilo or more; the trend below smooths that out.
          <div className="mt-4">
            <Button onClick={() => setLogOpen(true)}>Log weight</Button>
          </div>
        </EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <p className="text-sm text-muted">Trend</p>
              <p className="text-2xl font-bold tabular-nums">{latestTrend ? `${fmt1(latestTrend.value)} kg` : '–'}</p>
            </Card>
            <Card>
              <p className="text-sm text-muted">Rate, last 14 days</p>
              <p className={cx('text-2xl font-bold tabular-nums', tooFast ? 'text-warn' : rate != null && !outOfBand ? 'text-accent' : '')}>
                {rate == null ? '–' : `${rate > 0 ? '+' : ''}${fmt2(Math.round(rate * 100) / 100)}%`}
              </p>
              <p className="text-xs text-muted">{band ? `per week · goal ${band[0] > 0 ? '+' : ''}${fmt2(band[0])} to ${band[1] > 0 ? '+' : ''}${fmt2(band[1])}%` : 'per week'}</p>
            </Card>
          </div>
          {rate == null && <p className="mt-2 px-1 text-sm text-muted">The rate appears once readings reach back 14 days.</p>}
          {tooFast && <p className="mt-2 px-1 text-sm text-warn">The trend moves faster than 1% a week down or 0.5% a week up. Consider adjusting the targets under More.</p>}

          <Card className="mt-3">
            <h2 className="text-sm font-semibold">Body weight, kg</h2>
            <p className="text-xs text-muted">Dots: daily readings. Line: trend, each reading moving it 10% of the way.</p>
            <div className="mt-3 h-56">
              <Line data={data} options={options} />
            </div>
            <Segmented
              className="mt-3"
              size="sm"
              value={range}
              options={[
                { value: 28 as Range, label: '4 wk' },
                { value: 84 as Range, label: '12 wk' },
                { value: 365 as Range, label: '1 yr' },
                { value: 0 as Range, label: 'All' },
              ]}
              onChange={setRange}
            />
          </Card>

          <SectionTitle>Weekly averages, kg</SectionTitle>
          <Group>
            {weeks.map((w, i) => {
              const prev = weeks[i + 1]?.avg
              const diff = w.avg != null && prev != null ? w.avg - prev : null
              return (
                <ListRow
                  key={w.week}
                  title={`Week of ${formatDayShort(w.week)}`}
                  subtitle={`${w.days} of 7 days${w.avg == null ? ' · needs 4 for an average' : ''}`}
                  detail={
                    w.avg != null ? (
                      <span>
                        <span className="font-semibold text-ink">{fmt2(Math.round(w.avg * 10) / 10)}</span>
                        {diff != null && <span className="block text-xs">{`${diff > 0 ? '+' : ''}${fmt2(Math.round(diff * 10) / 10)}`}</span>}
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
              <ListRow key={m.id} title={`${fmt2(m.value)} kg`} subtitle={`${formatDate(m.date)}${m.source !== 'manual' ? ` · ${m.source}` : ''}`} onClick={() => setEntry(m)} />
            ))}
          </Group>
        </>
      )}

      <WeightSheet open={logOpen} onClose={() => setLogOpen(false)} />
      <Sheet open={!!entry} onClose={() => setEntry(null)} title={entry ? `${fmt2(entry.value)} kg on ${formatDate(entry.date)}` : ''}>
        {entry && (
          <div className="space-y-3 pb-2">
            <p className="text-sm text-muted">To change a reading, log the weight again for the same day; it replaces this one.</p>
            <Button block variant="danger" onClick={() => void remove(entry)}>
              Delete reading
            </Button>
          </div>
        )}
      </Sheet>
    </Screen>
  )
}
