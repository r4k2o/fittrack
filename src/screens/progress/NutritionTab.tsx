// Nutrition: the share of logged days on target each week (calories within 10% and
// protein at 90% or more), weekly averages against the target, and expenditure
// measured from intake and the weight trend.

import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { useToday } from '../../hooks'
import { addDays, formatDayShort, weekStart } from '../../lib/dates'
import { fmtInt } from '../../lib/format'
import { adherenceByWeek, targetLookup } from '../../lib/progress'
import { allTargets, dayIntakes } from '../../store/progress'
import { IconFood } from '../../ui/icons'
import { Button, Card, EmptyState, Group, ListRow, SectionTitle } from '../../ui/kit'
import { AdaptiveCard } from '../shared/AdaptiveCard'
import { ChartCard, Legend, WeekBars } from './charts'

const WEEKS = 12

export default function NutritionTab() {
  const navigate = useNavigate()
  const today = useToday()
  const monday = weekStart(today)
  const from = addDays(monday, -7 * (WEEKS - 1))
  const intakes = useLiveQuery(() => dayIntakes(from, today), [from, today])
  const targets = useLiveQuery(() => allTargets(), [])
  if (!intakes || !targets) return null
  const lookup = targetLookup(targets)
  const adherence = adherenceByWeek(intakes, lookup)
  const weeks = Array.from({ length: WEEKS }, (_, i) => addDays(from, i * 7))
  const bars = weeks.map((w) => {
    const a = adherence.find((x) => x.week === w)
    return { week: w, value: a && a.logged ? (a.onTarget / a.logged) * 100 : null }
  })
  const thisWeek = adherence.find((a) => a.week === monday)
  const perWeek = weeks
    .map((w) => {
      const days = intakes.filter((d) => d.kcal > 0 && weekStart(d.date) === w)
      if (!days.length) return null
      const t = lookup(addDays(w, 6) > today ? today : addDays(w, 6))
      return {
        week: w,
        days: days.length,
        kcal: days.reduce((n, d) => n + d.kcal, 0) / days.length,
        protein: days.reduce((n, d) => n + d.protein, 0) / days.length,
        target: t,
      }
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .reverse()

  if (intakes.length === 0)
    return (
      <EmptyState icon={<IconFood size={30} />} title="Noch nichts gegessen erfasst">
        Trefferquote und Wochenschnitte erscheinen, sobald du Mahlzeiten einträgst.
        <div className="mt-5">
          <Button onClick={() => navigate('/food')}>Zum Essen</Button>
        </div>
      </EmptyState>
    )

  return (
    <>
      <Card className="animate-rise !p-5">
        <p className="text-[13px] font-semibold text-ink-2">Diese Woche im Ziel</p>
        <p className="mt-1 flex items-baseline gap-2">
          <span className="text-[52px] font-bold leading-none tracking-[-0.045em] tabular-nums">{thisWeek?.onTarget ?? 0}</span>
          <span className="text-[17px] font-semibold text-ink-2">von {thisWeek?.logged ?? 0} erfassten Tagen</span>
        </p>
        <p className="mt-2 text-[14px] text-ink-2">Ein Tag zählt, wenn die Kalorien höchstens 10 % vom Ziel abweichen und Eiweiß 90 % erreicht.</p>
      </Card>

      <ChartCard title="Tage im Ziel, % pro Woche">
        <div className="mt-2">
          <Legend items={[{ label: 'Anteil der erfassten Tage im Ziel', colorVar: '--food', kind: 'bar' }]} />
        </div>
        <div className="mt-3">
          <WeekBars weeks={bars} max={100} format={(n) => `${Math.round(n)} %`} colorVar="--food" unit="der erfassten Tage im Ziel" />
        </div>
      </ChartCard>

      <div className="mt-3">
        <AdaptiveCard showProgress />
      </div>

      <SectionTitle>Wochenschnitt</SectionTitle>
      <Group>
        {perWeek.map((w) => (
          <ListRow
            key={w.week}
            title={`Woche ab ${formatDayShort(w.week)}`}
            subtitle={`${w.days} von 7 Tagen erfasst`}
            detail={
              <span className="block text-right">
                <span className="block font-semibold text-ink tabular-nums">
                  {fmtInt(w.kcal)}
                  {w.target ? ` / ${fmtInt(w.target.kcal)}` : ''} kcal
                </span>
                <span className="block text-[12px] tabular-nums">
                  {fmtInt(w.protein)}
                  {w.target ? ` / ${fmtInt(w.target.proteinG)}` : ''} g Eiweiß
                </span>
              </span>
            }
          />
        ))}
      </Group>
    </>
  )
}
