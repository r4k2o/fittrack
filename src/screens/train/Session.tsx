// The gym loop: each set starts with last time's numbers, a tick confirms it, and the
// rest timer starts on the tick. The screen stays awake while the workout runs and
// nothing covers it. Without background execution the timer is only audible while
// the app is open.

import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
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
import { IconCheck, IconChevronDown, IconDots, IconPlus, IconTrendUp, IconTrophy } from '../../ui/icons'
import { Button, cx, EmptyState, Group, IconButton, ListRow, NumberInput, Sheet, TextInput } from '../../ui/kit'
import { haptic } from '../../ui/motion'
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

/** The rest timer: a floating capsule with a countdown ring. */
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
  const r = 19
  const c = 2 * Math.PI * r
  const small = 'press flex size-11 items-center justify-center rounded-full text-[14px] font-bold'
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
      <div className={cx('animate-toast pointer-events-auto mx-auto flex max-w-md items-center gap-3 rounded-[32px] p-2 pl-2.5 shadow-float', done ? 'btn-primary' : 'bg-ink text-page')}>
        <svg width={48} height={48} className="-rotate-90 shrink-0" aria-hidden>
          <circle cx={24} cy={24} r={r} fill="none" stroke="currentColor" strokeOpacity={0.18} strokeWidth={5} />
          <circle
            cx={24}
            cy={24}
            r={r}
            fill="none"
            stroke={done ? 'currentColor' : 'var(--brand)'}
            strokeWidth={5}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - (done ? 1 : frac))}
            style={{ transition: 'stroke-dashoffset 250ms linear' }}
          />
        </svg>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold uppercase tracking-wider opacity-70">{done ? 'Rest over' : 'Rest'}</div>
          <div className="text-[28px] font-bold leading-none tabular-nums tracking-tight">{done ? 'Go!' : fmtDuration(remaining)}</div>
        </div>
        {!done && (
          <>
            <button type="button" aria-label="15 seconds less" className={cx(small, 'bg-page/12')} onClick={() => onChange({ ...rest, endsAt: rest.endsAt - 15_000 })}>
              −15
            </button>
            <button type="button" aria-label="15 seconds more" className={cx(small, 'bg-page/12')} onClick={() => onChange({ endsAt: rest.endsAt + 15_000, total: rest.total + 15 })}>
              +15
            </button>
          </>
        )}
        <button type="button" className={cx('press min-h-11 rounded-full px-4 text-[15px] font-bold', done ? 'bg-black/10' : 'bg-page/18')} onClick={() => onChange(null)}>
          {done ? 'Close' : 'Skip'}
        </button>
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
  index,
  session,
  logged,
  onRest,
  onMenu,
}: {
  ex: Exercise
  index: number
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
  const doneCount = rows.filter((r) => r.set).length

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
      haptic()
      return
    }
    const p = planned?.[i]
    const weight = p?.weight ?? (bodyweight ? 0 : null)
    if (weight == null || p?.reps == null || p.reps <= 0) {
      toast({ message: seconds ? 'Enter the weight and seconds first' : 'Enter the weight and reps first' })
      return
    }
    await logSet(session, ex.id, i, { weightKg: weight, reps: p.reps })
    haptic('success')
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
    const from = lastRow?.set ? { weight: lastRow.set.weightKg, reps: lastRow.set.reps } : (lastRow?.plan ?? { weight: null, reps: null })
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
    <section className="card animate-rise p-4" style={{ '--i': index } as CSSProperties}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-fill text-[14px] font-bold text-ink-2">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[18px] font-bold leading-snug tracking-tight">{ex.name}</h2>
          <p className="mt-0.5 text-[13px] text-ink-2">{lastTimeText(last)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-fill px-2.5 py-1 text-[12px] font-semibold text-ink-2">
              {range[0]}–{range[1]} {seconds ? 'sec' : 'reps'} · 1–3 in reserve
            </span>
            {progression?.increased && (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-[12px] font-bold text-brand-ink">
                <IconTrendUp size={13} strokeWidth={2.6} /> +{fmt2(step)} kg
              </span>
            )}
            {rowCount > 0 && (
              <span className="ml-auto text-[12px] font-semibold text-ink-3">
                {doneCount}/{rowCount} done
              </span>
            )}
          </div>
        </div>
        <IconButton label={`${ex.name} options`} className="-mr-2 -mt-1 size-9 text-ink-2" onClick={onMenu}>
          <IconDots size={20} className="rotate-90" />
        </IconButton>
      </div>

      <div className="mt-3 grid grid-cols-[2rem_1fr_1fr_3.25rem] items-center gap-2 px-1 text-[11px] font-bold uppercase tracking-wider text-ink-3">
        <span className="text-center">Set</span>
        <span className="pl-1">kg</span>
        <span className="pl-1">{seconds ? 'sec' : 'reps'}</span>
        <span />
      </div>
      <div className="mt-1.5 space-y-1.5">
        {rows.map(({ i, set, plan }) => {
          const done = !!set
          return (
            <div key={i} className={cx('grid grid-cols-[2rem_1fr_1fr_3.25rem] items-center gap-2 rounded-[20px] p-1 transition-colors duration-300', done && 'bg-brand-soft')}>
              <span className={cx('text-center text-[15px] font-bold', done ? 'text-brand-ink' : 'text-ink-3')}>{i + 1}</span>
              <NumberInput value={set ? set.weightKg : plan.weight} ariaLabel={`Set ${i + 1} weight`} placeholder={bodyweight ? '0' : '–'} onChange={(n) => edit(i, { weight: n })} inputClassName="!min-h-12 text-[17px] font-semibold" />
              <NumberInput
                value={set ? set.reps : plan.reps}
                integer
                ariaLabel={`Set ${i + 1} ${seconds ? 'seconds' : 'reps'}`}
                placeholder={String(range[1])}
                onChange={(n) => edit(i, { reps: n })}
                inputClassName="!min-h-12 text-[17px] font-semibold"
              />
              <button
                type="button"
                aria-label={done ? `Undo set ${i + 1}` : `Done with set ${i + 1}`}
                aria-pressed={done}
                onClick={() => void tick(i)}
                className={cx('press flex size-12 items-center justify-center rounded-[16px] transition-colors duration-200', done ? 'btn-primary animate-pop' : 'bg-fill text-ink-3')}
              >
                <IconCheck size={26} strokeWidth={3} />
              </button>
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="secondary" className="flex-1" onClick={addSet}>
          <IconPlus size={17} strokeWidth={2.6} /> Add set
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
    haptic()
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
    haptic('success')
    navigate(`/train/summary/${session.id}`, { replace: true })
  }

  const menuEx = menu != null ? exercises.find((e) => e.id === ids[menu]) : undefined
  const menuHasSets = menu != null && sets.some((s) => s.exerciseId === ids[menu])

  return (
    <div className="tone-train relative mx-auto min-h-dvh max-w-xl pb-[calc(env(safe-area-inset-bottom)+8.5rem)]">
      <div aria-hidden className="ambient pointer-events-none fixed inset-x-0 top-0 -z-10 mx-auto h-[60vh] max-w-xl" />
      <header className="sticky top-0 z-20 border-b border-line bg-page/75 px-3 pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150">
        <div className="flex min-h-16 items-center gap-2">
          <IconButton label="Minimise" variant="fill" className="size-10" onClick={() => navigate('/today')}>
            <IconChevronDown size={20} />
          </IconButton>
          <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setRenaming(session.name)}>
            <span className="block truncate text-[17px] font-bold">{session.name}</span>
            <span className="block text-[13px] tabular-nums text-ink-2">
              {fmtDuration((now - new Date(session.startedAt).getTime()) / 1000)} · {workSets} {workSets === 1 ? 'set' : 'sets'}
            </span>
          </button>
          <Button size="md" onClick={() => setFinishing(true)}>
            Finish
          </Button>
        </div>
      </header>

      <main className="space-y-3 px-4 pt-3">
        {exercises.map((ex, index) => (
          <ExerciseCard
            key={ex.id}
            ex={ex}
            index={index}
            session={session}
            logged={sets.filter((s) => s.exerciseId === ex.id && s.kind === 'work')}
            onRest={(sec) => setRest({ endsAt: Date.now() + sec * 1000, total: sec })}
            onMenu={() => setMenu(index)}
          />
        ))}
        {exercises.length === 0 && (
          <EmptyState icon={<IconTrophy size={28} />} title="Add your first exercise">
            Each set starts with last time's numbers; tick it to log it and start the rest timer.
          </EmptyState>
        )}
        <Button block size="lg" variant="outline" className="!border-dashed" onClick={() => setPicker({ mode: 'add' })}>
          <IconPlus size={20} strokeWidth={2.6} /> Add exercise
        </Button>
      </main>

      <RestBar rest={rest} onChange={setRest} />

      <Sheet open={!!picker} onClose={() => setPicker(null)} title={picker?.mode === 'swap' ? 'Swap exercise' : 'Add exercise'}>
        <ExercisePicker onPick={(e) => void pick(e)} exclude={ids} />
      </Sheet>

      <Sheet open={menu != null} onClose={() => setMenu(null)} title={menuEx?.name}>
        {menu != null && (
          <Group className="!shadow-none">
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
            <ListRow title={menuHasSets ? 'Remove with its sets' : 'Remove'} destructive onClick={() => void remove(menu)} />
          </Group>
        )}
      </Sheet>

      <Sheet
        open={finishing}
        onClose={() => setFinishing(false)}
        title={workSets ? 'Finish workout?' : 'Discard this workout?'}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" size="lg" className="flex-1" onClick={() => setFinishing(false)}>
              Keep going
            </Button>
            <Button variant={workSets ? 'primary' : 'danger'} size="lg" className="flex-1" onClick={() => void finish()}>
              {workSets ? 'Finish' : 'Discard'}
            </Button>
          </div>
        }
      >
        <p className="pb-2 text-[15px] text-ink-2">
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
            size="lg"
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
