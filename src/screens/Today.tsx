// Today answers two questions: what training is due (or that it is a rest day), and how
// much food is left. Weight, steps and sleep sit below in one row. Logging food lives
// in the Food tab, so this screen stays short.

import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db'
import { useNow, useSetting, useTarget, useToday } from '../hooks'
import { addDays, daysBetween, formatDayLong, formatDayShort, localDay, relativeDay, weekStart } from '../lib/dates'
import { count, fmt1, fmtDuration, fmtInt, fmtSleep } from '../lib/format'
import { sumNutrients } from '../lib/macros'
import { sessionStats } from '../lib/training'
import { ema, ratePctPerWeek } from '../lib/trends'
import { WEEKDAY_LONG } from '../lib/volume'
import { burnedKcal } from '../store/cardio'
import { metricSeries } from '../store/metrics'
import { activePlan, dayPreview, deloadActive, homeOn, planWeek, setHomeFor, startPlanDay, type PlanDayFull } from '../store/plans'
import { dismissReview, mondayReview } from '../store/progress'
import { activeSession, startSession } from '../store/training'
import { IconCheck, IconChevronRight, IconFood, IconHome, IconMoon, IconPlay, IconShield, IconTrain } from '../ui/icons'
import { AnimatedNumber, Button, Card, MacroBar, Ring, Screen, Segmented } from '../ui/kit'
import { haptic } from '../ui/motion'
import { useToast } from '../ui/toast'
import { AdaptiveCard } from './shared/AdaptiveCard'
import { WeekDots } from './shared/WeekDots'
import { WeeklyReviewCard } from './shared/WeeklyReviewCard'
import { WeightSheet } from './shared/WeightSheet'

function BackupReminder() {
  const navigate = useNavigate()
  const lastBackupAt = useSetting('lastBackupAt')
  const firstRunAt = useSetting('firstRunAt')
  if (lastBackupAt === undefined || firstRunAt === undefined) return null
  const since = lastBackupAt ?? firstRunAt
  if (!since) return null
  const days = daysBetween(localDay(new Date(since)), localDay())
  if (days < 7) return null
  return (
    <button type="button" onClick={() => navigate('/more/backup')} className="press mb-3 flex w-full items-center gap-3 rounded-[18px] bg-warn-soft px-4 py-3 text-left text-warn-ink">
      <IconShield size={20} className="shrink-0" />
      <span className="min-w-0 flex-1 text-[14px]">
        <span className="block font-semibold">{lastBackupAt ? `Letztes Backup vor ${days} Tagen` : 'Noch kein Backup'}</span>
        <span className="block opacity-80">Deine Daten liegen nur auf diesem iPhone.</span>
      </span>
      <IconChevronRight size={18} className="shrink-0 opacity-70" />
    </button>
  )
}

function CardLabel({ icon, children, right }: { icon: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex min-h-7 items-center justify-between gap-2">
      <p className="flex items-center gap-1.5 text-[15px] font-semibold text-ink-2">
        {icon}
        {children}
      </p>
      {right}
    </div>
  )
}

const repsText = (r: { repMin: number; repMax: number; unit?: string }) => (r.unit === 'seconds' ? `${r.repMin}–${r.repMax} s` : r.repMin === r.repMax ? `${r.repMin}` : `${r.repMin}–${r.repMax}`)

/** The due workout, a workout in progress, today's finished one, or the rest day. */
function TrainingCard({ today }: { today: string }) {
  const navigate = useNavigate()
  const toast = useToast()
  const now = useNow(30_000)
  const active = useLiveQuery(async () => (await activeSession()) ?? null)
  const data = useLiveQuery(async () => {
    const monday = weekStart(today)
    const [plan, sessions, home, deload] = await Promise.all([activePlan(), db.sessions.where('date').between(monday, addDays(monday, 6), true, true).toArray(), homeOn(today), deloadActive(today)])
    const finished = sessions.filter((s) => !!s.endedAt)
    const week = plan ? planWeek(plan, finished, today) : null
    // Plan days without weekdays have no rest days: the next one is always due.
    const flexible = !!week && week.length > 0 && week.every((w) => w.day.weekday == null)
    const due = week?.find((w) => w.status === 'today') ?? (flexible ? (week?.find((w) => w.status === 'next') ?? null) : null)
    const preview = due ? await dayPreview(due.day, { home, deload }) : null
    const doneToday = finished.filter((s) => s.date === today)
    const doneStats = doneToday.length ? sessionStats(await db.setLogs.where('sessionId').anyOf(doneToday.map((s) => s.id)).toArray()) : null
    const later = week?.find((w) => w.date && w.date > today && w.status !== 'done')?.day
    const firstDay = plan?.days.filter((d) => d.weekday != null).sort((a, b) => (a.weekday ?? 0) - (b.weekday ?? 0))[0]
    const missed = week?.find((w) => w.date && w.date < today && w.status !== 'done') ?? null
    return { plan, week, finished, due, preview, home, deload, doneToday, doneStats, next: later ?? firstDay ?? null, missed }
  }, [today])

  if (!data || active === undefined) return <div className="card h-56" />

  const start = async (day: PlanDayFull | null, home = data.home) => {
    haptic()
    if (active) {
      navigate(`/train/session/${active.id}`)
      return
    }
    const s = day ? await startPlanDay(day, { home }) : await startSession('Training')
    navigate(`/train/session/${s.id}`)
  }

  const switchHome = async (home: boolean) => {
    haptic()
    const { planWasHome } = await setHomeFor(today, home)
    if (!home && planWasHome)
      toast({
        message: 'Ganzer Plan wieder im Studio',
        action: { label: 'Rückgängig', onClick: () => void db.settings.put({ key: 'homeMode', value: true, updatedAt: new Date().toISOString() }) },
      })
  }

  const dots = <WeekDots today={today} week={data.week} sessions={data.finished} className="mt-4 border-t border-line px-1 pt-3.5" />

  if (active)
    return (
      <Card onClick={() => navigate(`/train/session/${active.id}`)} className="animate-rise">
        <CardLabel
          icon={<span className="relative mx-1 flex size-2.5"><span className="absolute inset-0 animate-ping rounded-full bg-brand opacity-60" /><span className="relative size-2.5 rounded-full bg-brand" /></span>}
          right={<span className="text-[15px] font-semibold tabular-nums text-ink-2">{fmtDuration((now - new Date(active.startedAt).getTime()) / 1000)}</span>}
        >
          Läuft
        </CardLabel>
        <h2 className="mt-1.5 truncate text-[24px] font-bold tracking-tight">{active.name}</h2>
        <span className="btn-primary mt-4 flex min-h-12 items-center justify-center gap-2 rounded-full text-[16px] font-semibold">
          <IconPlay size={16} /> Weiter trainieren
        </span>
      </Card>
    )

  if (data.due && data.preview) {
    const { day } = data.due
    const { rows, minutes, dropped } = data.preview
    const shown = rows.slice(0, 6)
    const sets = rows.reduce((n, r) => n + r.sets, 0)
    return (
      <Card className="animate-rise">
        <CardLabel icon={<IconTrain size={18} />} right={<span className="text-[13px] font-semibold text-ink-3">{data.due.status === 'today' ? 'Heute' : 'Als Nächstes'}</span>}>
          Training
        </CardLabel>
        <h2 className="mt-1.5 text-[24px] font-bold leading-tight tracking-tight">{day.name}</h2>
        <p className="mt-0.5 text-[15px] text-ink-2">
          {count(rows.length, 'Übung', 'Übungen')} · {count(sets, 'Satz', 'Sätze')} · ca. {minutes} Min{data.deload ? ' · leichtere Woche' : ''}
        </p>
        <Segmented
          size="sm"
          className="mt-4"
          value={data.home ? 'home' : 'gym'}
          onChange={(v) => void switchHome(v === 'home')}
          options={[
            { value: 'gym', label: 'Studio' },
            {
              value: 'home',
              label: (
                <>
                  <IconHome size={15} /> Zuhause
                </>
              ),
            },
          ]}
        />
        <ul key={data.home ? 'home' : 'gym'} className="mt-3 divide-y divide-line">
          {shown.map((r, i) => (
            <li key={r.id} className="animate-in flex items-baseline justify-between gap-3 py-2" style={{ animationDelay: `${i * 30}ms` }}>
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-medium">{r.name}</span>
                {r.replaces && <span className="block truncate text-[12px] text-ink-3">statt {r.replaces}</span>}
              </span>
              <span className="shrink-0 text-[14px] tabular-nums text-ink-2">
                {r.sets} × {repsText(r)}
              </span>
            </li>
          ))}
          {rows.length > shown.length && <li className="py-2 text-[14px] text-ink-3">+ {rows.length - shown.length} weitere</li>}
        </ul>
        {dropped.length > 0 && <p className="mt-1 text-[13px] text-ink-3">Zuhause ohne Ersatz: {dropped.join(', ')}</p>}
        <Button block size="lg" className="mt-3" disabled={rows.length === 0} onClick={() => void start(day)}>
          <IconPlay size={16} /> Training starten
        </Button>
        {dots}
      </Card>
    )
  }

  if (data.doneToday.length) {
    const last = data.doneToday[data.doneToday.length - 1]
    const secs = data.doneToday.reduce((n, s) => n + (new Date(s.endedAt ?? s.startedAt).getTime() - new Date(s.startedAt).getTime()) / 1000, 0)
    return (
      <Card onClick={() => navigate(`/train/summary/${last.id}`)} className="animate-rise">
        <CardLabel icon={<IconCheck size={18} strokeWidth={2.6} />} right={<IconChevronRight size={17} className="text-ink-3" />}>
          Erledigt
        </CardLabel>
        <h2 className="mt-1.5 truncate text-[24px] font-bold tracking-tight">{data.doneToday.map((s) => s.name).join(', ')}</h2>
        <p className="mt-0.5 text-[15px] text-ink-2">
          {fmtDuration(secs)} · {count(data.doneStats?.workSets ?? 0, 'Satz', 'Sätze')}{data.doneStats?.volumeKg ? ` · ${fmtInt(data.doneStats.volumeKg)} kg` : ''}
        </p>
        {dots}
      </Card>
    )
  }

  if (!data.plan)
    return (
      <Card className="animate-rise">
        <CardLabel icon={<IconTrain size={18} />}>Training</CardLabel>
        <h2 className="mt-1.5 text-[24px] font-bold tracking-tight">Noch kein Plan</h2>
        <p className="mt-0.5 text-[15px] text-ink-2">Sieben Fragen, dann steht deine Trainingswoche.</p>
        <div className="mt-4 flex gap-2">
          <Button size="lg" className="flex-1" onClick={() => navigate('/train/plan/new')}>
            Plan erstellen
          </Button>
          <Button size="lg" variant="secondary" onClick={() => void start(null)}>
            Freies Training
          </Button>
        </div>
      </Card>
    )

  const next = data.next
  const missed = data.missed
  const allDone = !!data.week?.length && data.week.every((w) => w.status === 'done')
  return (
    <Card className="animate-rise">
      <CardLabel icon={<IconMoon size={18} />}>Training</CardLabel>
      <h2 className="mt-1.5 text-[24px] font-bold tracking-tight">Ruhetag</h2>
      <p className="mt-0.5 text-[15px] text-ink-2">
        {allDone ? 'Alle Einheiten dieser Woche erledigt. ' : ''}
        {next ? `Nächstes Training: ${next.weekday != null ? WEEKDAY_LONG[next.weekday] : ''}, ${next.name}` : ''}
      </p>
      {missed && (
        <button type="button" onClick={() => void start(missed.day)} className="press-row -mx-2 mt-3 flex w-[calc(100%+1rem)] items-center gap-3 rounded-2xl px-2 py-2 text-left">
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] text-ink-3">{missed.day.weekday != null ? WEEKDAY_LONG[missed.day.weekday] : ''} verpasst</span>
            <span className="block truncate text-[15px] font-semibold">{missed.day.name}</span>
          </span>
          <span className="rounded-full bg-fill px-3.5 py-2 text-[14px] font-semibold">Nachholen</span>
        </button>
      )}
      {dots}
    </Card>
  )
}

function NutritionCard({ today }: { today: string }) {
  const navigate = useNavigate()
  const target = useTarget(today)
  const entries = useLiveQuery(() => db.diaryEntries.where('date').equals(today).toArray(), [today])
  const addBurned = useSetting('addBurnedCalories')
  const burned = useLiveQuery(async () => (addBurned ? burnedKcal(today) : 0), [addBurned, today])
  const totals = sumNutrients(entries?.map((e) => e.macros) ?? [])
  const kcalTarget = (target?.kcal ?? 0) + (burned ?? 0)
  const left = kcalTarget - totals.kcal
  const over = left < 0
  return (
    <Card onClick={() => navigate('/food')} className="animate-rise mt-3" style={{ '--i': 1 } as CSSProperties}>
      <CardLabel
        icon={<IconFood size={18} />}
        right={
          <span className="flex items-center gap-1 text-[13px] tabular-nums text-ink-3">
            {fmtInt(totals.kcal)} / {fmtInt(kcalTarget)} kcal
            <IconChevronRight size={16} />
          </span>
        }
      >
        Ernährung
      </CardLabel>
      <div className="mt-3 flex items-center gap-5">
        <Ring fraction={kcalTarget ? totals.kcal / kcalTarget : 0} over={over} size={108} stroke={11}>
          <AnimatedNumber value={Math.abs(left)} className="text-[25px] font-bold leading-none tracking-[-0.03em]" />
          <span className="mt-1 text-[11px] font-semibold text-ink-2">{over ? 'kcal drüber' : 'kcal übrig'}</span>
        </Ring>
        <div className="min-w-0 flex-1 space-y-2.5">
          <MacroBar label="Eiweiß" value={totals.protein} target={target?.proteinG ?? 0} color="var(--protein)" track="var(--protein-track)" />
          <MacroBar label="Kohlenhydrate" value={totals.carbs} target={target?.carbsG ?? 0} color="var(--carbs)" track="var(--carbs-track)" />
          <MacroBar label="Fett" value={totals.fat} target={target?.fatG ?? 0} color="var(--fat)" track="var(--fat-track)" />
        </div>
      </div>
      {burned ? <p className="mt-3 text-[13px] text-ink-3">inkl. {fmtInt(burned)} kcal aus Cardio</p> : null}
    </Card>
  )
}

function Stat({ label, value, sub, onClick }: { label: string; value: string; sub: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="press-row flex min-w-0 flex-col items-start px-4 py-3.5 text-left">
      <span className="text-[13px] font-semibold text-ink-2">{label}</span>
      <span className="mt-0.5 truncate text-[19px] font-bold tabular-nums tracking-tight">{value}</span>
      <span className="truncate text-[12px] text-ink-3">{sub}</span>
    </button>
  )
}

function BodyStats({ today, onWeight }: { today: string; onWeight: () => void }) {
  const navigate = useNavigate()
  const weights = useLiveQuery(() => metricSeries('weight', addDays(today, -120), today), [today])
  const steps = useLiveQuery(() => metricSeries('steps', addDays(today, -6), today), [today])
  const night = useLiveQuery(async () => {
    const mins = await metricSeries('sleepMin', addDays(today, -6), today)
    const last = mins.at(-1)
    if (!last) return null
    const scores = await db.metrics.where('[type+date]').equals(['sleepScore', last.date]).toArray()
    const score = scores.find((s) => s.source !== 'computed') ?? scores.find((s) => s.source === 'computed')
    return { ...last, score: score?.value ?? null }
  }, [today])
  const trend = weights ? ema(weights) : []
  const latest = trend.at(-1)
  const rate = ratePctPerWeek(trend, today)
  const lastSteps = steps?.at(-1)
  const when = (d: string) => (d === today ? 'heute' : d === addDays(today, -1) ? 'gestern' : formatDayShort(d))
  return (
    <div className="card animate-rise mt-3 grid grid-cols-3 divide-x divide-line overflow-hidden" style={{ '--i': 2 } as CSSProperties}>
      <Stat
        label="Gewicht"
        value={latest ? `${fmt1(latest.value)} kg` : '–'}
        sub={rate != null ? `${rate > 0 ? '+' : ''}${fmt1(Math.round(rate * 10) / 10)} % pro Wo.` : latest ? 'Trend folgt' : 'Eintragen'}
        onClick={onWeight}
      />
      <Stat
        label="Schritte"
        value={lastSteps ? fmtInt(lastSteps.value) : '–'}
        sub={lastSteps ? when(lastSteps.date) : 'Aus Health'}
        onClick={() => navigate(lastSteps ? '/progress?tab=sleep' : '/more/health')}
      />
      <Stat
        label="Schlaf"
        value={night ? fmtSleep(night.value) : '–'}
        sub={night ? (night.score != null ? `Score ${fmtInt(night.score)}` : relativeDay(night.date, today) === 'Heute' ? 'letzte Nacht' : when(night.date)) : 'Aus Health'}
        onClick={() => navigate(night ? '/progress?tab=sleep' : '/more/health')}
      />
    </div>
  )
}

function MondayReview({ today }: { today: string }) {
  const review = useLiveQuery(() => mondayReview(today), [today])
  if (!review) return null
  return (
    <div className="mb-3">
      <WeeklyReviewCard review={review} onDismiss={() => void dismissReview(today)} />
    </div>
  )
}

export default function Today() {
  const today = useToday()
  const [weightOpen, setWeightOpen] = useState(false)
  return (
    <Screen eyebrow={formatDayLong(today)} title="Heute">
      <BackupReminder />
      <MondayReview today={today} />
      <TrainingCard today={today} />
      <NutritionCard today={today} />
      <BodyStats today={today} onWeight={() => setWeightOpen(true)} />
      <div className="mt-3">
        <AdaptiveCard />
      </div>
      <WeightSheet open={weightOpen} onClose={() => setWeightOpen(false)} />
    </Screen>
  )
}
