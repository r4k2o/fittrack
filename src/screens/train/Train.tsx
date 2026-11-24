import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db, type PlanDay, type PlanExercise } from '../../db'
import { useNow, useToday } from '../../hooks'
import { addDays, formatDayShort, weekStart } from '../../lib/dates'
import { fmtDuration, fmtInt } from '../../lib/format'
import { sessionStats } from '../../lib/training'
import { activeSession, deleteRoutine, listRoutines, recentSessions, startSession } from '../../store/training'
import { IconDots, IconList, IconPlay, IconPlus, IconTrain } from '../../ui/icons'
import { Button, Card, EmptyState, Group, IconButton, IconTile, ListRow, Screen, SectionTitle, Sheet } from '../../ui/kit'
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
      ) : (
        <Card tone="train" className="mt-3 !p-5">
          <p className="text-[13px] font-semibold text-ink-2">Ready when you are</p>
          <p className="text-title2 mt-0.5">Every set starts from last time.</p>
          <Button block size="lg" className="mt-4" onClick={() => void start('Workout')}>
            <IconPlus size={20} strokeWidth={2.6} /> Start empty workout
          </Button>
        </Card>
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
          <p className="text-[14px] text-ink-2">Finish a workout and choose "Save as routine" to start it again with one tap. Plans generated from a questionnaire arrive in a later version.</p>
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
