// Today answers "what is left today": calories and macros remaining, each meal,
// the next workout and the weight trend, plus a backup reminder after 7 days.

import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { db, type DiaryEntry, type Meal } from '../db'
import { useNow, useSetting, useTarget, useToday } from '../hooks'
import { addDays, daysBetween, formatDayLong, localDay, weekStart } from '../lib/dates'
import { fmt1, fmt2, fmtDuration, fmtInt } from '../lib/format'
import { sumNutrients } from '../lib/macros'
import { GOALS } from '../lib/nutrition'
import { ema, ratePctPerWeek } from '../lib/trends'
import { MEAL_LABEL, MEALS, mealForNow } from '../store/diary'
import { metricSeries } from '../store/metrics'
import { getActiveGoal } from '../store/profile'
import { activePlan, planWeek, startPlanDay } from '../store/plans'
import { burnedKcal } from '../store/cardio'
import { activeSession, listRoutines, startSession } from '../store/training'
import {
  IconAlert,
  IconBarcode,
  IconCheckCircle,
  IconChevronRight,
  IconFood,
  IconPlay,
  IconPlus,
  IconScale,
  IconSearch,
  IconShield,
  IconTrain,
  IconTrendDown,
  IconTrendFlat,
  IconTrendUp,
  IconTimer,
} from '../ui/icons'
import { AnimatedNumber, Button, Card, cx, IconTile, MacroBar, Ring, Screen, Sheet, Sparkline } from '../ui/kit'
import { haptic } from '../ui/motion'
import { MealIcon } from './shared/WeekStrip'
import { WeightSheet } from './shared/WeightSheet'

function greeting(d = new Date()): string {
  const h = d.getHours()
  if (h < 5) return 'Good night'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

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
    <button
      type="button"
      onClick={() => navigate('/more/backup')}
      className="press mb-3 flex w-full items-center gap-3 rounded-[22px] bg-warn-soft px-4 py-3 text-left text-warn-ink"
    >
      <IconShield size={22} className="shrink-0" />
      <span className="min-w-0 flex-1 text-[14px]">
        <span className="block font-semibold">{lastBackupAt ? `Last backup ${days} days ago` : 'No backup yet'}</span>
        <span className="block opacity-80">Everything lives on this phone. Save a copy to Files.</span>
      </span>
      <IconChevronRight size={18} className="shrink-0 opacity-70" />
    </button>
  )
}

function EnergyCard({ today }: { today: string }) {
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
    <Card onClick={() => navigate('/food')} className="animate-rise !p-5">
      <div className="flex flex-col items-center">
        <Ring fraction={kcalTarget ? totals.kcal / kcalTarget : 0} over={over} size={188} stroke={16}>
          {over && <IconAlert size={18} className="mb-0.5 text-warn-ink" />}
          <AnimatedNumber value={Math.abs(left)} className="text-[48px] font-bold leading-none tracking-[-0.045em]" />
          <span className="mt-1.5 text-[13px] font-semibold text-ink-2">{over ? 'kcal over target' : 'kcal left'}</span>
        </Ring>
        <p className="mt-3 text-[14px] text-ink-2">
          <span className="font-semibold text-ink">{fmtInt(totals.kcal)}</span> eaten of {fmtInt(kcalTarget)} kcal
          {burned ? ` · incl. ${fmtInt(burned)} burned` : ''}
        </p>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3">
        <MacroBar compact label="Protein" value={totals.protein} target={target?.proteinG ?? 0} color="var(--protein)" track="var(--protein-track)" />
        <MacroBar compact label="Carbs" value={totals.carbs} target={target?.carbsG ?? 0} color="var(--carbs)" track="var(--carbs-track)" />
        <MacroBar compact label="Fat" value={totals.fat} target={target?.fatG ?? 0} color="var(--fat)" track="var(--fat-track)" />
      </div>
    </Card>
  )
}

function MealTiles({ today }: { today: string }) {
  const navigate = useNavigate()
  const entries = useLiveQuery(() => db.diaryEntries.where('date').equals(today).toArray(), [today])
  const kcal = (m: Meal) => (entries ?? []).filter((e: DiaryEntry) => e.meal === m).reduce((s, e) => s + e.macros.kcal, 0)
  return (
    <div className="mt-3 grid grid-cols-2 gap-3">
      {MEALS.map((m, i) => {
        const k = kcal(m)
        return (
          <button
            key={m}
            type="button"
            style={{ '--i': i + 1 } as CSSProperties}
            onClick={() => {
              haptic()
              navigate(`/food/add?meal=${m}`)
            }}
            className="card press animate-rise flex flex-col !rounded-[22px] p-3.5 text-left"
          >
            <span className="flex items-start justify-between">
              <MealIcon meal={m} size={36} />
              <span className="flex size-7 items-center justify-center rounded-full bg-fill text-ink-2">
                <IconPlus size={16} strokeWidth={2.6} />
              </span>
            </span>
            <span className="mt-2.5 block truncate text-[15px] font-semibold">{MEAL_LABEL[m]}</span>
            <span className="block text-[13px] text-ink-2">{k > 0 ? `${fmtInt(k)} kcal` : 'Nothing yet'}</span>
          </button>
        )
      })}
    </div>
  )
}

function WorkoutTile({ today }: { today: string }) {
  const navigate = useNavigate()
  const now = useNow(30_000)
  const session = useLiveQuery(() => activeSession())
  const done = useLiveQuery(() => db.sessions.where('date').equals(today).filter((s) => !!s.endedAt).toArray(), [today])
  const doneSets = useLiveQuery(async () => {
    if (!done?.length) return 0
    return db.setLogs.where('sessionId').anyOf(done.map((s) => s.id)).filter((s) => s.kind === 'work').count()
  }, [done])
  const routines = useLiveQuery(() => listRoutines())
  const planned = useLiveQuery(async () => {
    const plan = await activePlan()
    if (!plan) return null
    const monday = weekStart(today)
    const sessions = await db.sessions.where('date').between(monday, addDays(monday, 6), true, true).toArray()
    const week = planWeek(plan, sessions, today)
    return week.find((d) => d.status === 'today') ?? week.find((d) => d.status === 'next') ?? null
  }, [today])
  const routine = routines?.[0]
  const next = planned ? { name: planned.day.name, count: planned.day.exercises.length, today: planned.status === 'today' } : routine ? { name: routine.day.name, count: routine.exercises.length, today: false } : null

  const start = async () => {
    haptic()
    const s = planned
      ? await startPlanDay(planned.day)
      : routine
        ? await startSession(routine.day.name, routine.exercises.map((e) => e.exerciseId), routine.day.id)
        : await startSession('Workout')
    navigate(`/train/session/${s.id}`)
  }

  if (session)
    return (
      <Card tone="train" onClick={() => navigate(`/train/session/${session.id}`)} className="animate-rise flex flex-col !p-4" style={{ '--i': 5 } as CSSProperties}>
        <IconTile tone="train" size={34}>
          <IconTrain size={20} />
        </IconTile>
        <p className="mt-3 text-[13px] font-semibold text-ink-2">In progress</p>
        <p className="truncate text-[17px] font-bold">{session.name}</p>
        <p className="text-[13px] text-ink-2">{fmtDuration((now - new Date(session.startedAt).getTime()) / 1000)}</p>
        <span className="mt-3 inline-flex min-h-9 items-center justify-center rounded-full bg-ink text-[14px] font-semibold text-page">Resume</span>
      </Card>
    )

  return (
    <Card tone="train" className="animate-rise flex flex-col !p-4" style={{ '--i': 5 } as CSSProperties}>
      <IconTile tone="train" size={34}>
        <IconTrain size={20} />
      </IconTile>
      {done?.length ? (
        <>
          <p className="mt-3 flex items-center gap-1 text-[13px] font-semibold text-ink-2">
            <IconCheckCircle size={15} /> Done today
          </p>
          <p className="truncate text-[17px] font-bold">{done.map((s) => s.name).join(', ')}</p>
          <p className="text-[13px] text-ink-2">{doneSets ?? 0} sets logged</p>
        </>
      ) : (
        <>
          <p className="mt-3 text-[13px] font-semibold text-ink-2">{next ? (next.today ? "Today's workout" : 'Next workout') : 'Training'}</p>
          <p className="truncate text-[17px] font-bold">{next ? next.name : 'Free workout'}</p>
          <p className="text-[13px] text-ink-2">{next ? `${next.count} exercises` : 'Log sets as you go'}</p>
        </>
      )}
      <Button size="sm" className="mt-3" onClick={() => void start()}>
        <IconPlay size={14} /> {done?.length ? 'Again' : 'Start'}
      </Button>
    </Card>
  )
}

function WeightTile({ today, onLog }: { today: string; onLog: () => void }) {
  const series = useLiveQuery(() => metricSeries('weight', addDays(today, -120), today), [today])
  const goal = useLiveQuery(() => getActiveGoal())
  const trend = series ? ema(series) : []
  const latest = trend.at(-1)
  const rate = ratePctPerWeek(trend, today)
  const band = goal ? GOALS[goal.type].rateBand : null
  const tooFast = rate != null && (rate < -1 || rate > 0.5)
  const inBand = rate != null && band ? rate >= band[0] - 0.05 && rate <= band[1] + 0.05 : null
  const TrendIcon = rate == null || Math.abs(rate) < 0.05 ? IconTrendFlat : rate > 0 ? IconTrendUp : IconTrendDown
  return (
    <Card tone="body" onClick={onLog} className="animate-rise flex flex-col !p-4" style={{ '--i': 6 } as CSSProperties}>
      <div className="flex items-start justify-between">
        <IconTile tone="body" size={34}>
          <IconScale size={20} />
        </IconTile>
        <Sparkline values={trend.slice(-30).map((p) => p.value)} width={78} height={34} />
      </div>
      <p className="mt-3 text-[13px] font-semibold text-ink-2">Weight trend</p>
      <p className="text-[17px] font-bold">{latest ? `${fmt1(latest.value)} kg` : 'No readings'}</p>
      <p className="flex items-center gap-1 text-[13px] text-ink-2">
        {rate != null ? (
          <>
            {tooFast ? <IconAlert size={14} className="text-warn-ink" /> : <TrendIcon size={14} />}
            {`${rate > 0 ? '+' : ''}${fmt2(Math.round(rate * 100) / 100)}% a week`}
            {inBand && !tooFast && <span className="sr-only">, within the goal's range</span>}
          </>
        ) : (
          'Rate after 14 days'
        )}
      </p>
      <span className="mt-3 inline-flex min-h-9 items-center justify-center rounded-full bg-fill text-[14px] font-semibold">Log weight</span>
    </Card>
  )
}

export default function Today() {
  const navigate = useNavigate()
  const today = useToday()
  const [menu, setMenu] = useState(false)
  const [weightOpen, setWeightOpen] = useState(false)
  const meal = mealForNow()
  const go = (to: string) => {
    setMenu(false)
    navigate(to)
  }
  const actions = [
    { label: 'Food', hint: 'Search and recent', icon: <IconSearch size={20} />, tone: 'food' as const, run: () => go(`/food/add?meal=${meal}`) },
    { label: 'Scan', hint: 'Barcode', icon: <IconBarcode size={20} />, tone: 'brand' as const, run: () => go(`/food/scan?meal=${meal}`) },
    { label: 'Quick add', hint: 'Just calories', icon: <IconFood size={20} />, tone: 'amber' as const, run: () => go(`/food/quick?meal=${meal}`) },
    { label: 'Cardio', hint: 'Run, ride, swim', icon: <IconTimer size={20} />, tone: 'train' as const, run: () => go('/train/cardio/new') },
    {
      label: 'Weight',
      hint: "Today's reading",
      icon: <IconScale size={20} />,
      tone: 'body' as const,
      run: () => {
        setMenu(false)
        setWeightOpen(true)
      },
    },
  ]

  return (
    <Screen tone="brand" eyebrow={formatDayLong(today)} title={greeting()}>
      <BackupReminder />
      <EnergyCard today={today} />
      <MealTiles today={today} />
      <div className="mt-3 grid grid-cols-2 gap-3">
        <WorkoutTile today={today} />
        <WeightTile today={today} onLog={() => setWeightOpen(true)} />
      </div>

      <button
        type="button"
        aria-label="Add"
        onClick={() => {
          haptic()
          setMenu(true)
        }}
        className="btn-primary press fixed bottom-[calc(max(env(safe-area-inset-bottom),0.75rem)+5.25rem)] right-[max(1.25rem,calc(50vw-17rem))] z-30 flex size-15 items-center justify-center rounded-full shadow-float"
      >
        <IconPlus size={28} strokeWidth={2.6} />
      </button>

      <Sheet open={menu} onClose={() => setMenu(false)} title="Log">
        <div className="grid grid-cols-2 gap-3 pb-1">
          {actions.map((a) => (
            <button key={a.label} type="button" onClick={a.run} className={cx('press flex flex-col items-start gap-3 rounded-[22px] bg-fill p-4 text-left')}>
              <IconTile tone={a.tone} size={38}>
                {a.icon}
              </IconTile>
              <span>
                <span className="block text-[16px] font-semibold">{a.label}</span>
                <span className="block text-[13px] text-ink-2">{a.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </Sheet>
      <WeightSheet open={weightOpen} onClose={() => setWeightOpen(false)} />
    </Screen>
  )
}
