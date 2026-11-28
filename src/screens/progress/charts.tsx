// Chart building blocks for the Progress tabs: a time-series chart (Chart.js) with a
// hairline crosshair that can be shared between charts on one time axis, and weekly
// bars in plain HTML with an optional reference line. Values and labels stay in text
// colours; every chart states its unit and averaging window in its title.

import { CategoryScale, Chart, Filler, LinearScale, LineController, LineElement, PointElement, Tooltip, type ChartEvent, type Plugin } from 'chart.js'
import { useMemo, type ReactNode } from 'react'
import { Line } from 'react-chartjs-2'
import { useColorScheme } from '../../hooks'
import { addDays, daysBetween, formatDayMonth, formatDayShort, parseDay } from '../../lib/dates'
import type { DayValue } from '../../lib/trends'
import { cx, Segmented } from '../../ui/kit'
import { css, withAlpha } from './chartUtils'

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler)

const MONTH = new Intl.DateTimeFormat('de-DE', { month: 'short' })

export interface Series {
  label: string
  /** A CSS custom property such as "--body", read at draw time so both themes work. */
  colorVar: string
  points: readonly DayValue[]
  mode: 'line' | 'area' | 'points'
  endDot?: boolean
}

interface Props {
  series: Series[]
  from: string
  to: string
  format: (n: number) => string
  height?: number
  /** A shared crosshair date, for charts that sit on one time axis. */
  hover?: string | null
  onHover?: (date: string | null) => void
  label: string
}

export function TimeChart({ series, from, to, format, height = 220, hover, onHover, label }: Props) {
  const scheme = useColorScheme()
  const span = Math.max(1, daysBetween(from, to))
  const x = (d: string) => daysBetween(from, d)

  const data = useMemo(() => {
    const surface = css('--surface')
    return {
      datasets: series.map((s, i) => {
        const color = css(s.colorVar) || css('--ink-3')
        const pts = s.points.filter((p) => p.date >= from && p.date <= to).map((p) => ({ x: x(p.date), y: Math.round(p.value * 100) / 100 }))
        const n = pts.length
        if (s.mode === 'points')
          return {
            label: s.label,
            data: pts,
            showLine: false,
            pointRadius: n > 120 ? 2.5 : 4,
            pointHoverRadius: 5,
            pointBackgroundColor: color,
            pointBorderColor: surface,
            pointBorderWidth: 2,
            order: 2 + i,
          }
        return {
          label: s.label,
          data: pts,
          borderColor: color,
          borderWidth: 2,
          borderCapStyle: 'round' as const,
          borderJoinStyle: 'round' as const,
          backgroundColor: withAlpha(color, 0.1),
          fill: s.mode === 'area' ? ('start' as const) : false,
          tension: 0.35,
          pointRadius: pts.map((_, j) => (s.endDot && j === n - 1 ? 4 : 0)),
          pointHoverRadius: 5,
          pointBackgroundColor: color,
          pointBorderColor: surface,
          pointBorderWidth: 2,
          order: 1 + i,
        }
      }),
    }
  }, [series, from, to, scheme]) // eslint-disable-line

  const plugin = useMemo<Plugin<'line'>>(
    () => ({
      id: 'crosshair',
      afterDatasetsDraw(chart) {
        let px: number | null = null
        const active = chart.tooltip?.getActiveElements()
        if (active?.length) px = active[0].element.x
        else if (hover && hover >= from && hover <= to) px = chart.scales.x.getPixelForValue(daysBetween(from, hover))
        if (px == null) return
        const { top, bottom } = chart.chartArea
        const ctx = chart.ctx
        ctx.save()
        ctx.strokeStyle = css('--ink-3')
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(px, top)
        ctx.lineTo(px, bottom)
        ctx.stroke()
        ctx.restore()
      },
    }),
    [hover, from, to],
  )

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 350 },
      interaction: { mode: 'nearest' as const, axis: 'x' as const, intersect: false },
      layout: { padding: { top: 6, right: 6 } },
      onHover: onHover
        ? (e: ChartEvent, _els: unknown, chart: Chart) => {
            if (e.x == null) return
            const v = Math.round(chart.scales.x.getValueForPixel(e.x) ?? NaN)
            onHover(Number.isFinite(v) ? addDays(from, Math.min(span, Math.max(0, v))) : null)
          }
        : undefined,
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
            label: (item: { dataset: { label?: string }; parsed: { y: number | null } }) => `${item.dataset.label}: ${format(item.parsed.y ?? 0)}`,
          },
        },
      },
      scales: {
        x: {
          type: 'linear' as const,
          min: 0,
          max: span,
          grid: { display: false },
          border: { color: css('--line') },
          ticks: { color: css('--ink-3'), maxTicksLimit: 5, font: { size: 11 }, callback: (v: number | string) => formatDayMonth(addDays(from, Number(v))) },
        },
        y: {
          grid: { color: css('--grid'), lineWidth: 1 },
          border: { display: false },
          ticks: { color: css('--ink-3'), maxTicksLimit: 5, font: { size: 11 }, callback: (v: number | string) => format(Number(v)) },
        },
      },
    }),
    [from, span, format, onHover, scheme], // eslint-disable-line
  )

  return (
    <div style={{ height }} role="img" aria-label={label} onMouseLeave={() => onHover?.(null)} onTouchEnd={() => onHover?.(null)}>
      <Line data={data} options={options} plugins={[plugin]} />
    </div>
  )
}

export function Legend({ items }: { items: { label: string; colorVar: string; kind: 'line' | 'dot' | 'bar' | 'dash' }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] font-medium text-ink-2" aria-hidden>
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5">
          {it.kind === 'dot' && <span className="size-2.5 rounded-full" style={{ background: `var(${it.colorVar})` }} />}
          {it.kind === 'line' && <span className="h-0.5 w-4 rounded-full" style={{ background: `var(${it.colorVar})` }} />}
          {it.kind === 'bar' && <span className="h-2.5 w-3 rounded-[3px]" style={{ background: `var(${it.colorVar})` }} />}
          {it.kind === 'dash' && <span className="w-4 border-t-2 border-dashed" style={{ borderColor: `var(${it.colorVar})` }} />}
          {it.label}
        </span>
      ))}
    </div>
  )
}

/** Weekly bars in HTML: one per week, an optional dashed reference line, month labels. */
export function WeekBars({
  weeks,
  max,
  reference,
  format,
  colorVar = '--body',
  unit,
  height = 140,
}: {
  weeks: { week: string; value: number | null }[]
  max: number
  reference?: { value: number; label: string }
  format: (n: number) => string
  colorVar?: string
  unit: string
  height?: number
}) {
  const scale = Math.max(max, reference ? reference.value * 1.15 : 0, 1)
  return (
    <div>
      <div className="relative" style={{ height }}>
        {reference && (
          <>
            <span className="absolute inset-x-0 border-t-2 border-dashed border-ink/50" style={{ bottom: `${(reference.value / scale) * 100}%` }} />
            <span className="absolute right-0 -translate-y-full pb-0.5 text-[11px] font-semibold text-ink-2" style={{ bottom: `${(reference.value / scale) * 100}%` }}>
              {reference.label}
            </span>
          </>
        )}
        <div className="absolute inset-0 flex items-end gap-1.5">
          {weeks.map((w) => (
            <div key={w.week} className="flex h-full flex-1 flex-col justify-end" role="img" aria-label={`Woche ab ${formatDayShort(w.week)}: ${w.value == null ? 'keine Daten' : `${format(w.value)} ${unit}`}`}>
              {w.value != null ? (
                <div className="w-full rounded-t-[6px] transition-[height] duration-500" style={{ height: `${Math.max(2, (w.value / scale) * 100)}%`, background: `var(${colorVar})` }} />
              ) : (
                <div className="h-[2px] w-full rounded-full bg-fill" />
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex gap-1.5 text-center text-[11px] font-semibold text-ink-3" aria-hidden>
        {weeks.map((w, i) => {
          const d = parseDay(w.week)
          const newMonth = i === 0 || parseDay(weeks[i - 1].week).getMonth() !== d.getMonth()
          return (
            <span key={w.week} className="flex-1 truncate">
              {newMonth ? MONTH.format(d).replace('.', '') : d.getDate()}
            </span>
          )
        })}
      </div>
    </div>
  )
}

export function ChartCard({ title, children, className, action }: { title: ReactNode; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={cx('card mt-3 p-4', className)}>
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-[16px] font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export type Range = 28 | 84 | 365 | 0

export function RangePicker({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return (
    <Segmented
      className="mt-4"
      size="sm"
      value={value}
      options={[
        { value: 28 as Range, label: '4 Wo.' },
        { value: 84 as Range, label: '12 Wo.' },
        { value: 365 as Range, label: '1 Jahr' },
        { value: 0 as Range, label: 'Alles' },
      ]}
      onChange={onChange}
    />
  )
}

