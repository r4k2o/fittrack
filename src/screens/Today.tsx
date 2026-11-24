// Today answers "what is left today": calories and macros remaining, the next
// workout, the weight trend, and a backup reminder once the last backup is 7 days old.

import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db'
import { useNow, useSetting, useTarget, useToday } from '../hooks'
import { addDays, daysBetween, formatDayLong, localDay } from '../lib/dates'
import { fmt1, fmt2, fmtDuration, fmtInt } from '../lib/format'
import { sumNutrients } from '../lib/macros'
import { GOALS } from '../lib/nutrition'
import { ema, ratePctPerWeek } from '../lib/trends'
import { mealForNow } from '../store/diary'
import { metricSeries } from '../store/metrics'
import { getActiveGoal } from '../store/profile'
import { activeSession, listRoutines, startSession } from '../store/training'
import { IconBarcode, IconChevronRight, IconFood, IconPlus, IconScale, IconSearch, IconShield, IconTrain } from '../ui/icons'
import { Button, Card, cx, ListRow, Group, MacroBar, Ring, Screen, SectionTitle, Sheet } from '../ui/kit'
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
    <Card className="mb-3 flex items-center gap-3" onClick={() => navigate('/more/backup')}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-warn-soft text-warn">
        <IconShield size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{lastBackupAt ? `Last backup ${days} days ago` : 'No backup yet'}</span>
        <span className="block text-sm text-muted">All your data sits on this phone. Save a copy to Files.</span>
      </span>
      <IconChevronRight size={18} className="text-faint" />
    </Card>
  )
}

function WorkoutCard({ today }: { today: string }) {
  const navigate = useNavigate()
  const now = useNow(30_000)
  const session = useLiveQuery(() => activeSession())
  const done = useLiveQuery(() => db.sessions.where('date').equals(today).filter((s) => !!s.endedAt).toArray(), [today])
  const doneSets = useLiveQuery(async () => {
    if (!done?.length) return 0
    return db.setLogs.where('sessionId').anyOf(done.map((s) => s.id)).filter((s) => s.kind === 'work').count()
  }, [done])
  const routines = useLiveQuery(() => listRoutines())

  if (session) {
    return (
      <Card className="flex items-center gap-3" onClick={() => navigate(`/train/session/${session.id}`)}>
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-ink">
          <IconTrain />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Workout in progress</span>
          <span className="block text-sm text-muted">
            {session.name} · {fmtDuration((now - new Date(session.startedAt).getTime()) / 1000)}
          </span>
        </span>
        <span className="font-semibold text-accent">Resume</span>
      </Card>
    )
  }

  const start = async (name: string, exerciseIds: string[] = [], planDayId: string | null = null) => {
    const s = await startSession(name, exerciseIds, planDayId)
    navigate(`/train/session/${s.id}`)
  }
  const next = routines?.[0]
  return (
    <Card>
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-sunken text-muted">
          <IconTrain />
        </span>
        <div className="min-w-0 flex-1">
          {done?.length ? (
            <>
              <p className="font-semibold">Trained today</p>
              <p className="text-sm text-muted">
                {done.map((s) => s.name).join(', ')} · {doneSets ?? 0} sets
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold">{next ? `Next: ${next.day.name}` : 'No workout yet today'}</p>
              <p className="text-sm text-muted">{next ? `${next.exercises.length} exercises` : 'Start an empty workout, or save one as a routine afterwards.'}</p>
            </>
          )}
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        {next && (
          <Button className="flex-1" onClick={() => start(next.day.name, next.exercises.map((e) => e.exerciseId), next.day.id)}>
            Start {next.day.name}
          </Button>
        )}
        <Button className="flex-1" variant={next ? 'secondary' : 'primary'} onClick={() => start('Workout')}>
          {next ? 'Empty' : 'Start workout'}
        </Button>
      </div>
    </Card>
  )
}

function WeightTile({ today, onLog }: { today: string; onLog: () => void }) {
  const series = useLiveQuery(() => metricSeries('weight', addDays(today, -120), today), [today])
  const goal = useLiveQuery(() => getActiveGoal())
  if (!series) return null
  const trend = ema(series)
  const latest = trend.at(-1)
  const rate = ratePctPerWeek(trend, today)
  const band = goal ? GOALS[goal.type].rateBand : null
  const inBand = rate != null && band ? rate >= band[0] - 0.05 && rate <= band[1] + 0.05 : null
  const tooFast = rate != null && (rate < -1 || rate > 0.5)
  return (
    <Card className="flex items-center gap-3" onClick={onLog}>
      <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-sunken text-muted">
        <IconScale />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-muted">Weight trend</span>
        {latest ? (
          <span className="block font-semibold tabular-nums">
            {fmt2(Math.round(latest.value * 10) / 10)} kg
            {rate != null && (
              <span className={cx('ml-2 text-sm font-medium', tooFast ? 'text-warn' : inBand ? 'text-accent' : 'text-muted')}>
                {rate > 0 ? '+' : ''}
                {fmt2(Math.round(rate * 100) / 100)}% / week
              </span>
            )}
          </span>
        ) : (
          <span className="block font-semibold">No readings yet</span>
        )}
        {tooFast && <span className="block text-sm text-warn">Faster than 1% a week down or 0.5% up. Check the targets.</span>}
      </span>
      <span className="font-semibold text-accent">Log</span>
    </Card>
  )
}

export default function Today() {
  const navigate = useNavigate()
  const today = useToday()
  const target = useTarget(today)
  const entries = useLiveQuery(() => db.diaryEntries.where('date').equals(today).toArray(), [today])
  const [menu, setMenu] = useState(false)
  const [weightOpen, setWeightOpen] = useState(false)
  const totals = sumNutrients(entries?.map((e) => e.macros) ?? [])
  const kcalTarget = target?.kcal ?? 0
  const left = kcalTarget - totals.kcal
  const meal = mealForNow()

  return (
    <Screen title="Today" subtitle={formatDayLong(today)}>
      <BackupReminder />

      <Card onClick={() => navigate('/food')} className="!p-5">
        <div className="flex items-center gap-5">
          <Ring fraction={kcalTarget ? totals.kcal / kcalTarget : 0} over={left < 0}>
            <span className={cx('text-3xl font-bold tabular-nums tracking-tight', left < 0 && 'text-warn')}>{fmtInt(Math.abs(left))}</span>
            <span className="text-xs font-semibold text-muted">{left < 0 ? 'kcal over' : 'kcal left'}</span>
          </Ring>
          <div className="min-w-0 flex-1 space-y-3">
            <MacroBar label="Protein" value={totals.protein} target={target?.proteinG ?? 0} color="var(--protein)" />
            <MacroBar label="Carbs" value={totals.carbs} target={target?.carbsG ?? 0} color="var(--carbs)" />
            <MacroBar label="Fat" value={totals.fat} target={target?.fatG ?? 0} color="var(--fat)" />
          </div>
        </div>
        <p className="mt-4 text-center text-sm text-muted tabular-nums">
          Eaten {fmtInt(totals.kcal)} of {fmtInt(kcalTarget)} kcal
          {entries && entries.length > 0 && ` · ${fmt1(totals.protein)} g protein`}
        </p>
      </Card>

      <SectionTitle>Training</SectionTitle>
      <WorkoutCard today={today} />

      <SectionTitle>Body</SectionTitle>
      <WeightTile today={today} onLog={() => setWeightOpen(true)} />

      <button
        type="button"
        aria-label="Add"
        onClick={() => setMenu(true)}
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+5rem)] right-[max(1rem,calc(50vw-17rem))] z-30 flex size-14 items-center justify-center rounded-full bg-accent text-accent-ink shadow-lg active:scale-95"
      >
        <IconPlus size={28} />
      </button>

      <Sheet open={menu} onClose={() => setMenu(false)} title="Add">
        <Group className="bg-sunken">
          <ListRow icon={<IconSearch size={20} />} title="Food" subtitle="Search, recent and saved" onClick={() => navigate(`/food/add?meal=${meal}`)} />
          <ListRow icon={<IconBarcode size={20} />} title="Scan barcode" subtitle="Packaged products" onClick={() => navigate(`/food/scan?meal=${meal}`)} />
          <ListRow icon={<IconFood size={20} />} title="Quick add" subtitle="Calories and macros without a food" onClick={() => navigate(`/food/quick?meal=${meal}`)} />
          <ListRow
            icon={<IconScale size={20} />}
            title="Weight"
            subtitle="Today's reading"
            onClick={() => {
              setMenu(false)
              setWeightOpen(true)
            }}
          />
        </Group>
      </Sheet>
      <WeightSheet open={weightOpen} onClose={() => setWeightOpen(false)} />
    </Screen>
  )
}
