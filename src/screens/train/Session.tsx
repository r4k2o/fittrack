// The gym loop: each set starts with last time's numbers, a tick confirms it, and the
// rest timer starts on the tick. The screen stays awake while the workout runs and
// nothing covers it. Without background execution the timer is only audible while
// the app is open.

import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { db, type Exercise, type Session as SessionRow, type SetLog } from '../../db'
import { useNow, useSetting, useWakeLock } from '../../hooks'
import { formatDayShort } from '../../lib/dates'
import { fmt2, fmtDuration } from '../../lib/format'
import { defaultRepRange, defaultRestSec, loadStep, nextTarget } from '../../lib/training'
import {
  deleteSession,
  deleteSet,
  finishSession,
  lastTime,
  logSet,
  renameSession,
  setSessionExercises,
  updateSet,
  type LastTime,
} from '../../store/training'
import { IconCheck, IconDots, IconPlus, IconTrophy } from '../../ui/icons'
import { Button, cx, EmptyState, Group, IconButton, ListRow, NumberInput, Sheet, TextInput } from '../../ui/kit'
import { useToast } from '../../ui/toast'
import { ExercisePicker } from './ExercisePicker'

// ---- rest timer ----------------------------------------------------------------

interface Rest {
  endsAt: number
  total: number
}

let audio: AudioContext | null = null

/** iOS only lets a page make sound after a tap, so the audio context is unlocked on each tick. */
function unlockAudio() {
  try {
    audio ??= new AudioContext()
    void audio.resume()
  } catch {
    audio = null
  }
}

function beep() {
  if (!audio) return
  const t = audio.currentTime
  for (const [i, f] of [880, 1175].entries()) {
    const o = audio.createOscillator()
    const g = audio.createGain()
    o.frequency.value = f
    g.gain.setValueAtTime(0.0001, t + i * 0.22)
    g.gain.exponentialRampToValueAtTime(0.3, t + i * 0.22 + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.22 + 0.18)
    o.connect(g).connect(audio.destination)
    o.start(t + i * 0.22)
    o.stop(t + i * 0.22 + 0.2)
  }
}

const restKey = (sessionId: string) => `fittrack.rest.${sessionId}`

function loadRest(sessionId: string): Rest | null {
  try {
    const r = JSON.parse(localStorage.getItem(restKey(sessionId)) ?? 'null') as Rest | null
    return r && r.endsAt > Date.now() ? r : null
  } catch {
    return null
  }
}

function saveRest(sessionId: string, r: Rest | null) {
  try {
    if (r) localStorage.setItem(restKey(sessionId), JSON.stringify(r))
    else localStorage.removeItem(restKey(sessionId))
  } catch {
    // storage may be unavailable; the timer still runs in memory
  }
}

function RestBar({ rest, onChange }: { rest: Rest | null; onChange: (r: Rest | null) => void }) {
  const now = useNow(250)
  const beeped = useRef(false)
  const remaining = rest ? Math.ceil((rest.endsAt - now) / 1000) : 0
  useEffect(() => {
    beeped.current = false
  }, [rest?.endsAt])
  useEffect(() => {
    if (!rest) return
    if (remaining <= 0 && !beeped.current) {
      beeped.current = true
      beep()
    }
    if (remaining <= -6) onChange(null)
  }, [remaining, rest, onChange])
  if (!rest) return null
  const done = remaining <= 0
  const frac = Math.max(0, Math.min(1, (rest.endsAt - now) / 1000 / rest.total))
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 pb-[env(safe-area-inset-bottom)]">
      <div className={cx('mx-auto max-w-xl px-3 pb-3 pt-2', done ? 'bg-accent text-accent-ink' : 'bg-ink text-canvas', 'rounded-t-3xl shadow-2xl')}>
        <div className="mb-2 h-1 overflow-hidden rounded-full bg-white/20">
          <div className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-200" style={{ width: `${frac * 100}%` }} />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 pl-2">
            <div className="text-xs font-semibold uppercase tracking-wide opacity-70">{done ? 'Rest over' : 'Rest'}</div>
            <div className="text-3xl font-bold tabular-nums">{done ? 'Go' : fmtDuration(remaining)}</div>
          </div>
          {!done && (
            <>
              <button type="button" className="min-h-11 rounded-2xl bg-white/10 px-3 font-semibold" onClick={() => onChange({ ...rest, endsAt: rest.endsAt - 15_000 })}>
                −15
              </button>
              <button type="button" className="min-h-11 rounded-2xl bg-white/10 px-3 font-semibold" onClick={() => onChange({ endsAt: rest.endsAt + 15_000, total: rest.total + 15 })}>
                +15
              </button>
            </>
          )}
          <button type="button" className="min-h-11 rounded-2xl bg-white/15 px-4 font-semibold" onClick={() => onChange(null)}>
            {done ? 'Close' : 'Skip'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---- one exercise ----------------------------------------------------------------

interface Planned {
  weight: number | null
  reps: number | null
}

function lastTimeText(last: LastTime | null | undefined): string {
  if (last === undefined) return ''
  if (!last || !last.sets.length) return 'First time: pick a weight you can lift for the range with 1–3 reps to spare'
  const w = new Set(last.sets.map((s) => s.weightKg))
  const sets =
    w.size === 1
      ? `${fmt2(last.sets[0].weightKg)} kg × ${last.sets.map((s) => s.reps).join(', ')}`
      : last.sets.map((s) => `${fmt2(s.weightKg)}×${s.reps}`).join(', ')
  return `Last time (${formatDayShort(last.date)}): ${sets}`
}

function ExerciseCard({
  ex,
  session,
  logged,
  onRest,
  onMenu,
}: {
  ex: Exercise
  session: SessionRow
  logged: SetLog[]
  onRest: (sec: number) => void
  onMenu: () => void
}) {
  const toast = useToast()
  const restCompound = useSetting('restCompoundSec')
  const restIsolation = useSetting('restIsolationSec')
  const last = useLiveQuery(() => lastTime(ex.id, session.id), [ex.id, session.id])
  const range = defaultRepRange(ex)
  const step = loadStep(ex)
  const seconds = ex.unit === 'seconds'
  const progression = useMemo(() => (last ? nextTarget(last.sets.map((s) => ({ weightKg: s.weightKg, reps: s.reps })), range, step) : null), [last, range, step])
  const [planned, setPlanned] = useState<Planned[] | null>(null)

  useEffect(() => {
    if (planned || last === undefined) return
    if (progression) setPlanned(progression.sets.map((s) => ({ weight: s.weightKg, reps: s.reps })))
    else setPlanned(Array.from({ length: 3 }, () => ({ weight: null, reps: null })))
  }, [last, progression, planned])

  const byIndex = new Map(logged.map((s) => [s.setIndex, s]))
  const rowCount = Math.max(planned?.length ?? 0, logged.length ? Math.max(...logged.map((s) => s.setIndex)) + 1 : 0)
  const rows = Array.from({ length: rowCount }, (_, i) => ({ i, set: byIndex.get(i), plan: planned?.[i] ?? { weight: null, reps: null } }))
  const bodyweight = ex.equipment === 'bodyweight' || ex.equipment === 'band'

  const setPlan = (i: number, patch: Partial<Planned>) =>
    setPlanned((cur) => {
      const next = [...(cur ?? [])]
      while (next.length <= i) next.push({ weight: null, reps: null })
      next[i] = { ...next[i], ...patch }
      return next
    })

  const tick = async (i: number) => {
    unlockAudio()
    const existing = byIndex.get(i)
    if (existing) {
      setPlan(i, { weight: existing.weightKg, reps: existing.reps })
      await deleteSet(existing.id)
      return
    }
    const p = planned?.[i]
    const weight = p?.weight ?? (bodyweight ? 0 : null)
    if (weight == null || p?.reps == null || p.reps <= 0) {
      toast({ message: seconds ? 'Enter the weight and seconds first.' : 'Enter the weight and reps first.' })
      return
    }
    await logSet(session, ex.id, i, { weightKg: weight, reps: p.reps })
    onRest(defaultRestSec(ex, restCompound ?? 150, restIsolation ?? 90))
  }

  const edit = (i: number, patch: Partial<Planned>) => {
    const s = byIndex.get(i)
    if (s) {
      const weight = patch.weight !== undefined ? patch.weight : s.weightKg
      const reps = patch.reps !== undefined ? patch.reps : s.reps
      if (weight != null && reps != null && reps > 0) void updateSet(s, { weightKg: weight, reps })
    }
    setPlan(i, patch)
  }

  const addSet = () => {
    const lastRow = rows.at(-1)
    const from = lastRow?.set ? { weight: lastRow.set.weightKg, reps: lastRow.set.reps } : lastRow?.plan ?? { weight: null, reps: null }
    setPlanned((cur) => {
      const next = [...(cur ?? [])]
      while (next.length < rowCount) next.push({ weight: null, reps: null })
      next.push({ ...from })
      return next
    })
  }

  const removeSet = () => {
    const lastRow = rows.at(-1)
    if (!lastRow || lastRow.set) return
    setPlanned((cur) => (cur ?? []).slice(0, rowCount - 1))
  }

  return (
    <section className="rounded-3xl bg-surface p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold leading-snug">{ex.name}</h2>
          <p className="mt-0.5 text-sm text-muted">{lastTimeText(last)}</p>
          <p className="mt-1 text-sm font-medium">
            Target {range[0]}–{range[1]} {seconds ? 'seconds' : 'reps'}, 1–3 in reserve
            {progression?.increased && <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-bold text-accent">+{fmt2(step)} kg</span>}
          </p>
        </div>
        <IconButton label={`${ex.name} options`} className="-mr-2 -mt-1" onClick={onMenu}>
          <IconDots size={20} className="rotate-90" />
        </IconButton>
      </div>

      <div className="mt-3 grid grid-cols-[2rem_1fr_1fr_3rem] items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-faint">
        <span>Set</span>
        <span>kg</span>
        <span>{seconds ? 'sec' : 'reps'}</span>
        <span />
      </div>
      <div className="mt-1 space-y-2">
        {rows.map(({ i, set, plan }) => {
          const done = !!set
          return (
            <div key={i} className={cx('grid grid-cols-[2rem_1fr_1fr_3rem] items-center gap-2 rounded-2xl p-1 transition', done && 'bg-accent-soft')}>
              <span className={cx('text-center font-bold tabular-nums', done ? 'text-accent' : 'text-muted')}>{i + 1}</span>
              <NumberInput
                value={set ? set.weightKg : plan.weight}
                ariaLabel={`Set ${i + 1} weight`}
                placeholder={bodyweight ? '0' : '–'}
                onChange={(n) => edit(i, { weight: n })}
              />
              <NumberInput value={set ? set.reps : plan.reps} integer ariaLabel={`Set ${i + 1} ${seconds ? 'seconds' : 'reps'}`} placeholder={String(range[1])} onChange={(n) => edit(i, { reps: n })} />
              <button
                type="button"
                aria-label={done ? `Undo set ${i + 1}` : `Done with set ${i + 1}`}
                aria-pressed={done}
                onClick={() => void tick(i)}
                className={cx('flex size-12 items-center justify-center rounded-2xl transition active:scale-95', done ? 'bg-accent text-accent-ink' : 'bg-sunken text-faint')}
              >
                <IconCheck size={26} strokeWidth={3} />
              </button>
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="secondary" className="flex-1" onClick={addSet}>
          <IconPlus size={18} /> Add set
        </Button>
        {rows.length > 0 && !rows.at(-1)?.set && (
          <Button size="sm" variant="secondary" onClick={removeSet}>
            Remove set
          </Button>
        )}
      </div>
    </section>
  )
}

// ---- the screen ----------------------------------------------------------------

export default function Session() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  // null = not found; undefined = still loading
  const session = useLiveQuery(async () => (await db.sessions.get(id)) ?? null, [id])
  const sets = useLiveQuery(() => db.setLogs.where('sessionId').equals(id).toArray(), [id])
  const order = session?.exerciseIds.join('|') ?? ''
  // re-read only when the exercise order changes, not on every session update
  const exercises = useLiveQuery(async () => {
    const ids = order ? order.split('|') : []
    const rows = await db.exercises.bulkGet(ids)
    return rows.filter((e): e is Exercise => !!e)
  }, [order])
  const now = useNow(1000)
  const [rest, setRestState] = useState<Rest | null>(() => loadRest(id))
  const [picker, setPicker] = useState<{ mode: 'add' } | { mode: 'swap'; index: number } | null>(null)
  const [menu, setMenu] = useState<number | null>(null)
  const [finishing, setFinishing] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  useWakeLock(!!session && !session.endedAt)

  const setRest = useCallback(
    (r: Rest | null) => {
      setRestState(r)
      saveRest(id, r)
    },
    [id],
  )

  useEffect(() => {
    if (session?.endedAt) navigate(`/train/summary/${id}`, { replace: true })
  }, [session?.endedAt, id, navigate])

  if (session === undefined || !exercises || !sets) return null
  if (session === null) {
    return (
      <div className="p-6">
        <EmptyState title="Workout not found">
          <Button className="mt-4" onClick={() => navigate('/train')}>
            Back to Train
          </Button>
        </EmptyState>
      </div>
    )
  }

  const workSets = sets.filter((s) => s.kind === 'work').length
  const ids = session.exerciseIds

  const pick = async (ex: Exercise) => {
    if (!picker) return
    if (picker.mode === 'add') await setSessionExercises(session.id, [...ids, ex.id])
    else {
      const next = [...ids]
      next[picker.index] = ex.id
      await setSessionExercises(session.id, next)
    }
    setPicker(null)
  }

  const remove = async (index: number) => {
    const exId = ids[index]
    const removed = sets.filter((s) => s.exerciseId === exId)
    await db.transaction('rw', db.sessions, db.setLogs, async () => {
      await db.setLogs.bulkDelete(removed.map((s) => s.id))
      await setSessionExercises(session.id, ids.filter((_, i) => i !== index))
    })
    setMenu(null)
    toast({
      message: 'Exercise removed',
      action: {
        label: 'Undo',
        onClick: async () => {
          await db.setLogs.bulkPut(removed)
          await setSessionExercises(session.id, ids)
        },
      },
    })
  }

  const move = async (index: number, dir: -1 | 1) => {
    const j = index + dir
    if (j < 0 || j >= ids.length) return
    const next = [...ids]
    ;[next[index], next[j]] = [next[j], next[index]]
    await setSessionExercises(session.id, next)
    setMenu(null)
  }

  const finish = async () => {
    setRest(null)
    if (workSets === 0) {
      await deleteSession(session.id)
      navigate('/train', { replace: true })
      return
    }
    await finishSession(session.id)
    navigate(`/train/summary/${session.id}`, { replace: true })
  }

  const menuEx = menu != null ? exercises.find((e) => e.id === ids[menu]) : undefined
  const menuHasSets = menu != null && sets.some((s) => s.exerciseId === ids[menu])

  return (
    <div className="mx-auto min-h-dvh max-w-xl pb-[calc(env(safe-area-inset-bottom)+8rem)]">
      <header className="sticky top-0 z-20 bg-canvas/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="flex min-h-16 items-center gap-3">
          <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setRenaming(session.name)}>
            <span className="block truncate text-xl font-bold">{session.name}</span>
            <span className="block text-sm tabular-nums text-muted">
              {fmtDuration((now - new Date(session.startedAt).getTime()) / 1000)} · {workSets} {workSets === 1 ? 'set' : 'sets'}
            </span>
          </button>
          <Button variant="secondary" onClick={() => navigate('/today')}>
            Minimise
          </Button>
          <Button onClick={() => setFinishing(true)}>Finish</Button>
        </div>
      </header>

      <main className="space-y-3 px-4 pt-2">
        {exercises.map((ex, index) => (
          <ExerciseCard
            key={ex.id}
            ex={ex}
            session={session}
            logged={sets.filter((s) => s.exerciseId === ex.id && s.kind === 'work')}
            onRest={(sec) => setRest({ endsAt: Date.now() + sec * 1000, total: sec })}
            onMenu={() => setMenu(index)}
          />
        ))}
        {exercises.length === 0 && (
          <EmptyState icon={<IconTrophy size={32} />} title="Add your first exercise">
            Each set starts with last time's numbers; tick it to log it and start the rest timer.
          </EmptyState>
        )}
        <Button block size="lg" variant="outline" onClick={() => setPicker({ mode: 'add' })}>
          <IconPlus /> Add exercise
        </Button>
      </main>

      <RestBar rest={rest} onChange={setRest} />

      <Sheet open={!!picker} onClose={() => setPicker(null)} title={picker?.mode === 'swap' ? 'Swap exercise' : 'Add exercise'}>
        <ExercisePicker onPick={(e) => void pick(e)} exclude={ids} />
      </Sheet>

      <Sheet open={menu != null} onClose={() => setMenu(null)} title={menuEx?.name}>
        {menu != null && (
          <Group className="bg-sunken">
            {!menuHasSets && (
              <ListRow
                title="Swap for another exercise"
                onClick={() => {
                  setPicker({ mode: 'swap', index: menu })
                  setMenu(null)
                }}
              />
            )}
            {menu > 0 && <ListRow title="Move up" onClick={() => void move(menu, -1)} />}
            {menu < ids.length - 1 && <ListRow title="Move down" onClick={() => void move(menu, 1)} />}
            <ListRow title={menuHasSets ? 'Remove with its sets' : 'Remove'} className="text-danger" onClick={() => void remove(menu)} />
          </Group>
        )}
      </Sheet>

      <Sheet
        open={finishing}
        onClose={() => setFinishing(false)}
        title={workSets ? 'Finish workout?' : 'Discard this workout?'}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setFinishing(false)}>
              Keep going
            </Button>
            <Button variant={workSets ? 'primary' : 'danger'} className="flex-1" onClick={() => void finish()}>
              {workSets ? 'Finish' : 'Discard'}
            </Button>
          </div>
        }
      >
        <p className="pb-2 text-muted">
          {workSets
            ? `${workSets} work ${workSets === 1 ? 'set' : 'sets'} over ${new Set(sets.map((s) => s.exerciseId)).size} exercises. Unticked sets are not saved.`
            : 'No set has been ticked, so there is nothing to save.'}
        </p>
      </Sheet>

      <Sheet
        open={renaming != null}
        onClose={() => setRenaming(null)}
        title="Workout name"
        footer={
          <Button
            block
            disabled={!renaming?.trim()}
            onClick={async () => {
              if (renaming?.trim()) await renameSession(session.id, renaming.trim())
              setRenaming(null)
            }}
          >
            Save
          </Button>
        }
      >
        <TextInput autoFocus value={renaming ?? ''} onChange={(e) => setRenaming(e.target.value)} />
      </Sheet>
    </div>
  )
}
