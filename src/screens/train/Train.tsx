import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db, type PlanDay, type PlanExercise } from '../../db'
import { useToday } from '../../hooks'
import { addDays, formatDayShort, parseDay, weekStart } from '../../lib/dates'
import { fmtDuration, fmtInt } from '../../lib/format'
import { sessionStats } from '../../lib/training'
import { activeSession, deleteRoutine, listRoutines, recentSessions, startSession } from '../../store/training'
import { IconDots, IconList, IconPlus, IconTrain } from '../../ui/icons'
import { Button, Card, cx, EmptyState, Group, IconButton, ListRow, Screen, SectionTitle, Sheet } from '../../ui/kit'
import { useToast } from '../../ui/toast'

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

export default function Train() {
  const navigate = useNavigate()
  const toast = useToast()
  const today = useToday()
  const monday = weekStart(today)
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  const active = useLiveQuery(() => activeSession())
  const thisWeek = useLiveQuery(() => db.sessions.where('date').between(monday, addDays(monday, 6), true, true).filter((s) => !!s.endedAt).toArray(), [monday])
  const routines = useLiveQuery(() => listRoutines())
  const history = useLiveQuery(async () => {
    const sessions = await recentSessions(15)
    return Promise.all(
      sessions.map(async (s) => ({ s, stats: sessionStats(await db.setLogs.where('sessionId').equals(s.id).toArray()) })),
    )
  })
  const exerciseNames = useLiveQuery(async () => new Map((await db.exercises.toArray()).map((e) => [e.id, e.name])))
  const [routineMenu, setRoutineMenu] = useState<{ day: PlanDay; exercises: PlanExercise[] } | null>(null)
  const doneDays = new Set(thisWeek?.map((s) => s.date))

  const start = async (name: string, ids: string[] = [], dayId: string | null = null) => {
    if (active) {
      navigate(`/train/session/${active.id}`)
      return
    }
    const s = await startSession(name, ids, dayId)
    navigate(`/train/session/${s.id}`)
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

  return (
    <Screen
      title="Train"
      actions={
        <Button size="sm" variant="ghost" onClick={() => navigate('/train/exercises')}>
          Exercises
        </Button>
      }
    >
      <div className="grid grid-cols-7 gap-1 rounded-3xl bg-surface p-2">
        {week.map((d, i) => {
          const isToday = d === today
          const done = doneDays.has(d)
          return (
            <div key={d} className={cx('flex flex-col items-center rounded-2xl py-2', isToday && 'bg-sunken')}>
              <span className="text-xs font-semibold text-faint">{DAY_LETTERS[i]}</span>
              <span className={cx('text-base font-bold tabular-nums', isToday ? 'text-ink' : 'text-muted')}>{parseDay(d).getDate()}</span>
              <span className={cx('mt-1 size-1.5 rounded-full', done ? 'bg-accent' : 'bg-transparent')} />
            </div>
          )
        })}
      </div>

      {active ? (
        <Card className="mt-4 flex items-center gap-3" onClick={() => navigate(`/train/session/${active.id}`)}>
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-ink">
            <IconTrain />
          </span>
          <span className="flex-1">
            <span className="block font-semibold">{active.name} is running</span>
            <span className="block text-sm text-muted">Started {new Date(active.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </span>
          <span className="font-semibold text-accent">Resume</span>
        </Card>
      ) : (
        <Button block size="lg" className="mt-4" onClick={() => void start('Workout')}>
          <IconPlus /> Start empty workout
        </Button>
      )}

      <SectionTitle>Routines</SectionTitle>
      {routines && routines.length > 0 ? (
        <Group>
          {routines.map((r) => (
            <div key={r.day.id} className="flex items-center">
              <ListRow
                className="flex-1"
                icon={<IconList size={20} />}
                title={r.day.name}
                subtitle={r.exercises.map((e) => exerciseNames?.get(e.exerciseId) ?? '').filter(Boolean).join(', ')}
                detail={<span className="font-semibold text-accent">Start</span>}
                chevron={false}
                onClick={() => void start(r.day.name, r.exercises.map((e) => e.exerciseId), r.day.id)}
              />
              <IconButton label={`${r.day.name} options`} className="mr-2" onClick={() => setRoutineMenu(r)}>
                <IconDots size={20} className="rotate-90" />
              </IconButton>
            </div>
          ))}
        </Group>
      ) : (
        <Card>
          <p className="text-sm text-muted">Finish a workout and choose "Save as routine" to start it again with one tap. Plans generated from a questionnaire come in a later version.</p>
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
              detail={`${stats.workSets} sets · ${fmtInt(stats.volumeKg)} kg`}
              onClick={() => navigate(`/train/summary/${s.id}`)}
            />
          ))}
        </Group>
      ) : (
        <EmptyState title="No workouts yet">Your finished workouts appear here.</EmptyState>
      )}

      <Sheet open={!!routineMenu} onClose={() => setRoutineMenu(null)} title={routineMenu?.day.name}>
        {routineMenu && (
          <Group className="bg-sunken">
            <ListRow title="Delete routine" className="text-danger" onClick={() => void removeRoutine(routineMenu)} />
          </Group>
        )}
      </Sheet>
    </Screen>
  )
}
