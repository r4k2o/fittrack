import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db, type PlanDay, type PlanExercise } from '../../db'
import { useNow, useToday } from '../../hooks'
import { addDays, formatDayShort, weekStart } from '../../lib/dates'
import { fmtDuration, fmtInt } from '../../lib/format'
import { sessionStats } from '../../lib/training'
import { WEEKDAY_LONG } from '../../lib/volume'
import { activePlan, deloadActive, deloadOffer, endDeload, planWeek, snoozeDeloadOffer, startDeload, startPlanDay, type PlanDayFull, type WeekDay } from '../../store/plans'
import { getSetting } from '../../store/settings'
import { activeSession, deleteRoutine, listRoutines, recentSessions, startSession } from '../../store/training'
import { IconCheck, IconDots, IconList, IconPlay, IconPlus, IconTarget, IconTrain } from '../../ui/icons'
import { Button, Card, cx, EmptyState, Group, IconButton, IconTile, ListRow, Notice, Screen, SectionTitle, Sheet } from '../../ui/kit'
import { haptic } from '../../ui/motion'
import { useToast } from '../../ui/toast'
import { WeekStrip } from '../shared/WeekStrip'

export default function Train() {
  const navigate = useNavigate()
  const toast = useToast()
  const today = useToday()
  const now = useNow(30_000)
  const monday = weekStart(today)
  const active = useLiveQuery(() => activeSession())
  const thisWeek = useLiveQuery(() => db.sessions.where('date').between(monday, addDays(monday, 6), true, true).filter((s) => !!s.endedAt).toArray(), [monday])
  const routines = useLiveQuery(() => listRoutines())
  const history = useLiveQuery(async () => {
    const sessions = await recentSessions(15)
    return Promise.all(sessions.map(async (s) => ({ s, stats: sessionStats(await db.setLogs.where('sessionId').equals(s.id).toArray()) })))
  })
  const exerciseNames = useLiveQuery(async () => new Map((await db.exercises.toArray()).map((e) => [e.id, e.name])))
  const plan = useLiveQuery(async () => (await activePlan()) ?? null, [])
  const offer = useLiveQuery(async () => (plan ? deloadOffer(plan, today) : null), [plan, today])
  const deload = useLiveQuery(async () => ((await deloadActive(today)) ? await getSetting('deloadUntil') : null), [today])
  const week = plan && thisWeek ? planWeek(plan, thisWeek, today) : null
  const focus = week?.find((d) => d.status === 'today') ?? week?.find((d) => d.status === 'next') ?? null
  const [routineMenu, setRoutineMenu] = useState<{ day: PlanDay; exercises: PlanExercise[] } | null>(null)
  const doneDays = new Set(thisWeek?.map((s) => s.date))
  const go = (to: string) => navigate(to)

  const start = async (name: string, ids: string[] = [], dayId: string | null = null) => {
    haptic()
    if (active) {
      go(`/train/session/${active.id}`)
      return
    }
    const s = await startSession(name, ids, dayId)
    go(`/train/session/${s.id}`)
  }

  const startDay = async (day: PlanDayFull) => {
    haptic()
    if (active) {
      go(`/train/session/${active.id}`)
      return
    }
    const s = await startPlanDay(day)
    go(`/train/session/${s.id}`)
  }

  const removeRoutine = async (r: { day: PlanDay; exercises: PlanExercise[] }) => {
    await deleteRoutine(r.day.id)
    setRoutineMenu(null)
    toast({
      message: `Routine "${r.day.name}" deleted`,
      action: {
        label: 'Undo',
        onClick: async () => {
          await db.planDays.put(r.day)
          await db.planExercises.bulkPut(r.exercises)
        },
      },
    })
  }

  const count = thisWeek?.length ?? 0

  return (
    <Screen
      tone="train"
      eyebrow={count ? `${count} ${count === 1 ? 'workout' : 'workouts'} this week` : 'This week'}
      title="Train"
      actions={
        <Button size="sm" variant="glass" onClick={() => go('/train/exercises')}>
          Exercises
        </Button>
      }
    >
      <WeekStrip selected={today} today={today} marked={doneDays} />

      {active ? (
        <Card tone="train" className="mt-3 !p-5" onClick={() => go(`/train/session/${active.id}`)}>
          <div className="flex items-center gap-4">
            <IconTile tone="train" size={48}>
              <IconTrain size={26} />
            </IconTile>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-ink-2">In progress</p>
              <p className="truncate text-[20px] font-bold tracking-tight">{active.name}</p>
              <p className="text-[14px] text-ink-2">{fmtDuration((now - new Date(active.startedAt).getTime()) / 1000)} elapsed</p>
            </div>
          </div>
          <span className="mt-4 flex min-h-12 items-center justify-center rounded-full bg-ink text-[16px] font-semibold text-page">Resume workout</span>
        </Card>
      ) : plan && week ? (
        <Card tone="train" className="mt-3 !p-5">
          {focus ? (
            <>
              <p className="text-[13px] font-semibold text-ink-2">{focus.status === 'today' ? 'Today' : focus.day.weekday != null ? `Next · ${WEEKDAY_LONG[focus.day.weekday]}` : 'Next'}</p>
              <p className="text-title2 mt-0.5">{focus.day.name}</p>
              <p className="mt-0.5 text-[15px] text-ink-2">
                {focus.day.exercises.length} exercises · {focus.day.exercises.reduce((n, x) => n + (deload ? Math.ceil(x.sets / 2) : x.sets), 0)} sets
                {deload ? ' (lighter week)' : ''}
              </p>
              <Button block size="lg" className="mt-4" onClick={() => void startDay(focus.day)} disabled={focus.day.exercises.length === 0}>
                <IconPlay size={17} /> Start {focus.day.name}
              </Button>
            </>
          ) : (
            <>
              <p className="flex items-center gap-1 text-[13px] font-semibold text-ink-2">
                <IconCheck size={15} strokeWidth={2.6} /> Week complete
              </p>
              <p className="text-title2 mt-0.5">All {week.length} sessions done</p>
              <p className="mt-0.5 text-[15px] text-ink-2">Next week starts with {week[0]?.day.name}.</p>
            </>
          )}
        </Card>
      ) : (
        <Card tone="train" className="mt-3 !p-5">
          <p className="text-[13px] font-semibold text-ink-2">Get a training plan</p>
          <p className="text-title2 mt-0.5">Seven questions, one week of training.</p>
          <p className="mt-1 text-[15px] text-ink-2">Split, exercises, sets and rest from published rules, fitted to your days, time and equipment.</p>
          <Button block size="lg" className="mt-4" onClick={() => go('/train/plan/new')}>
            <IconTarget size={19} /> Build my plan
          </Button>
        </Card>
      )}

      {deload && (
        <Notice tone="ok" className="mt-3">
          <p>Lighter week until Sunday: half the sets at the same weights.</p>
          <Button size="sm" variant="ghost" className="-ml-3 mt-1" onClick={() => void endDeload()}>
            End it now
          </Button>
        </Notice>
      )}
      {offer && !deload && (
        <Card className="mt-3 !p-4">
          <p className="text-[16px] font-semibold">A lighter week?</p>
          <p className="mt-1 text-[14px] text-ink-2">
            {offer.weeks} weeks of training on this plan. A week with half the sets at the same weights helps recovery. It is optional.
          </p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => void startDeload(today)}>
              Start lighter week
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void snoozeDeloadOffer(today)}>
              Not now
            </Button>
          </div>
        </Card>
      )}

      {plan && week && (
        <>
          <SectionTitle
            action={
              <Button size="sm" variant="ghost" onClick={() => go('/train/plan')}>
                Edit plan
              </Button>
            }
          >
            This week
          </SectionTitle>
          <div className="card divide-y divide-line overflow-hidden">
            {week.map((w) => (
              <PlanDayRow key={w.day.id} w={w} onStart={() => void startDay(w.day)} onOpen={() => go('/train/plan')} />
            ))}
          </div>
        </>
      )}

      {!active && (
        <Button block variant="secondary" size="lg" className="mt-3" onClick={() => void start('Workout')}>
          <IconPlus size={20} strokeWidth={2.6} /> Start empty workout
        </Button>
      )}

      <SectionTitle>Routines</SectionTitle>
      {routines && routines.length > 0 ? (
        <div className="card divide-y divide-line overflow-hidden">
          {routines.map((r) => (
            <div key={r.day.id} className="flex items-center gap-3 py-3 pl-4 pr-2">
              <IconTile tone="train" size={36}>
                <IconList size={19} />
              </IconTile>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[16px] font-semibold">{r.day.name}</p>
                <p className="truncate text-[13px] text-ink-2">
                  {r.exercises
                    .map((e) => exerciseNames?.get(e.exerciseId) ?? '')
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <Button size="sm" onClick={() => void start(r.day.name, r.exercises.map((e) => e.exerciseId), r.day.id)}>
                <IconPlay size={13} /> Start
              </Button>
              <IconButton label={`${r.day.name} options`} className="size-9 text-ink-2" onClick={() => setRoutineMenu(r)}>
                <IconDots size={20} className="rotate-90" />
              </IconButton>
            </div>
          ))}
        </div>
      ) : (
        <Card className="!p-4">
          <p className="text-[14px] text-ink-2">Finish a workout and choose "Save as routine" to start it again with one tap.</p>
        </Card>
      )}

      <SectionTitle>History</SectionTitle>
      {history && history.length > 0 ? (
        <Group>
          {history.map(({ s, stats }) => (
            <ListRow
              key={s.id}
              title={s.name}
              subtitle={`${formatDayShort(s.date)} · ${fmtDuration((new Date(s.endedAt ?? s.startedAt).getTime() - new Date(s.startedAt).getTime()) / 1000)}`}
              detail={
                <span className="block text-right">
                  <span className="block font-semibold text-ink">{stats.workSets} sets</span>
                  <span className="block text-[12px]">{fmtInt(stats.volumeKg)} kg</span>
                </span>
              }
              onClick={() => go(`/train/summary/${s.id}`)}
            />
          ))}
        </Group>
      ) : (
        <EmptyState icon={<IconTrain size={28} />} title="No workouts yet">
          Finished workouts appear here with their sets and volume.
        </EmptyState>
      )}

      <Sheet open={!!routineMenu} onClose={() => setRoutineMenu(null)} title={routineMenu?.day.name}>
        {routineMenu && (
          <Group className="!shadow-none">
            <ListRow title="Delete routine" destructive onClick={() => void removeRoutine(routineMenu)} />
          </Group>
        )}
      </Sheet>
    </Screen>
  )
}

const STATUS_TEXT: Record<WeekDay['status'], string> = {
  done: 'Done',
  today: 'Today',
  next: 'Up next',
  upcoming: '',
  missed: 'Not done',
}

function PlanDayRow({ w, onStart, onOpen }: { w: WeekDay; onStart: () => void; onOpen: () => void }) {
  const when = w.day.weekday != null ? WEEKDAY_LONG[w.day.weekday] : 'Any day'
  const status = STATUS_TEXT[w.status]
  return (
    <div className="flex items-center gap-3 py-3 pl-4 pr-3">
      <span
        className={cx(
          'flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold',
          w.status === 'done' ? 'btn-primary' : w.status === 'today' || w.status === 'next' ? 'bg-train text-white' : 'bg-fill text-ink-3',
        )}
        aria-hidden
      >
        {w.status === 'done' ? <IconCheck size={17} strokeWidth={3} /> : when.slice(0, 1)}
      </span>
      <button type="button" className="min-w-0 flex-1 text-left" onClick={onOpen}>
        <p className="truncate text-[16px] font-semibold">{w.day.name}</p>
        <p className="truncate text-[13px] text-ink-2">
          {when}
          {status ? ` · ${status}` : ''} · {w.day.exercises.length} exercises
        </p>
      </button>
      {w.status !== 'done' && (
        <Button size="sm" variant={w.status === 'today' || w.status === 'next' ? 'primary' : 'secondary'} onClick={onStart} disabled={w.day.exercises.length === 0}>
          <IconPlay size={13} /> Start
        </Button>
      )}
    </div>
  )
}
