import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db, type PlanDay, type PlanExercise } from '../../db'
import { useNow, useSetting, useToday } from '../../hooks'
import { addDays, formatDayShort, weekStart } from '../../lib/dates'
import { count, fmtDuration, fmtInt } from '../../lib/format'
import { sessionStats } from '../../lib/training'
import { WEEKDAY_LONG, WEEKDAY_SHORT } from '../../lib/volume'
import { weekMinutes, WHO_WEEKLY_MIN } from '../../lib/cardio'
import { cardioBetween } from '../../store/cardio'
import {
  activePlan,
  dayPreview,
  deloadActive,
  deloadOffer,
  endDeload,
  homeOn,
  planWeek,
  snoozeDeloadOffer,
  startDeload,
  startPlanDay,
  type PlanDayFull,
  type WeekDay,
} from '../../store/plans'
import { getSetting, setSetting } from '../../store/settings'
import { activeSession, deleteRoutine, listRoutines, recentSessions, startSession } from '../../store/training'
import { IconCheck, IconChevronRight, IconDots, IconHome, IconPlay, IconPlus } from '../../ui/icons'
import { Button, Card, cx, Group, IconButton, ListRow, Notice, Screen, SectionTitle, Segmented, Sheet, Toggle } from '../../ui/kit'
import { haptic } from '../../ui/motion'
import { useToast } from '../../ui/toast'

const repsText = (r: { repMin: number; repMax: number; unit?: string }) => (r.unit === 'seconds' ? `${r.repMin}–${r.repMax} s` : r.repMin === r.repMax ? `${r.repMin}` : `${r.repMin}–${r.repMax}`)

export default function Train() {
  const navigate = useNavigate()
  const toast = useToast()
  const today = useToday()
  const now = useNow(30_000)
  const monday = weekStart(today)
  const active = useLiveQuery(async () => (await activeSession()) ?? null)
  const thisWeek = useLiveQuery(() => db.sessions.where('date').between(monday, addDays(monday, 6), true, true).filter((s) => !!s.endedAt).toArray(), [monday])
  const routines = useLiveQuery(() => listRoutines())
  const history = useLiveQuery(async () => {
    const sessions = await recentSessions(10)
    return Promise.all(sessions.map(async (s) => ({ s, stats: sessionStats(await db.setLogs.where('sessionId').equals(s.id).toArray()) })))
  })
  const exerciseNames = useLiveQuery(async () => new Map((await db.exercises.toArray()).map((e) => [e.id, e.name])))
  const plan = useLiveQuery(async () => (await activePlan()) ?? null, [])
  const offer = useLiveQuery(async () => (plan ? deloadOffer(plan, today) : null), [plan, today])
  const deload = useLiveQuery(async () => ((await deloadActive(today)) ? await getSetting('deloadUntil') : null), [today])
  const homePlan = useSetting('homeMode')
  const homeToday = useLiveQuery(() => homeOn(today), [today])
  const week = plan && thisWeek ? planWeek(plan, thisWeek, today) : null
  const cardio = useLiveQuery(async () => weekMinutes(await cardioBetween(monday, addDays(monday, 6))), [monday])
  const due = week?.find((d) => d.status === 'today') ?? week?.find((d) => d.status === 'next') ?? null
  const [routineMenu, setRoutineMenu] = useState<{ day: PlanDay; exercises: PlanExercise[] } | null>(null)
  const [openDay, setOpenDay] = useState<WeekDay | null>(null)
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

  const startDay = async (day: PlanDayFull, home: boolean) => {
    haptic()
    if (active) {
      go(`/train/session/${active.id}`)
      return
    }
    const s = await startPlanDay(day, { home })
    go(`/train/session/${s.id}`)
  }

  const removeRoutine = async (r: { day: PlanDay; exercises: PlanExercise[] }) => {
    await deleteRoutine(r.day.id)
    setRoutineMenu(null)
    toast({
      message: `Routine „${r.day.name}“ gelöscht`,
      action: {
        label: 'Rückgängig',
        onClick: async () => {
          await db.planDays.put(r.day)
          await db.planExercises.bulkPut(r.exercises)
        },
      },
    })
  }

  const doneCount = week?.filter((w) => w.status === 'done').length ?? 0

  return (
    <Screen
      title="Training"
      actions={
        <Button size="sm" variant="glass" onClick={() => go('/train/exercises')}>
          Übungen
        </Button>
      }
    >
      {active && (
        <Card onClick={() => go(`/train/session/${active.id}`)} className="animate-rise mb-3">
          <p className="flex items-center gap-2 text-[15px] font-semibold text-ink-2">
            <span className="relative flex size-2.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-brand opacity-60" />
              <span className="relative size-2.5 rounded-full bg-brand" />
            </span>
            Läuft seit {fmtDuration((now - new Date(active.startedAt).getTime()) / 1000)}
          </p>
          <p className="mt-1 truncate text-[22px] font-bold tracking-tight">{active.name}</p>
          <span className="btn-primary mt-4 flex min-h-12 items-center justify-center gap-2 rounded-full text-[16px] font-semibold">
            <IconPlay size={16} /> Weiter trainieren
          </span>
        </Card>
      )}

      {plan && week ? (
        <>
          <SectionTitle
            className="!mt-1"
            action={
              <Button size="sm" variant="ghost" onClick={() => go('/train/plan')}>
                Plan bearbeiten
              </Button>
            }
          >
            Diese Woche
            <span className="ml-2 text-[15px] font-medium text-ink-3">
              {doneCount} von {week.length}
            </span>
          </SectionTitle>
          <div className="card divide-y divide-line overflow-hidden">
            {week.map((w) => (
              <PlanDayRow
                key={w.day.id}
                w={w}
                due={w === due && !active}
                home={!!homeToday}
                onOpen={() => {
                  haptic()
                  setOpenDay(w)
                }}
                onStart={() => void startDay(w.day, !!homeToday)}
              />
            ))}
          </div>
          <Group className="mt-3">
            <Toggle
              checked={!!homePlan}
              onChange={(v) => {
                haptic()
                void setSetting('homeMode', v)
                if (!v) void setSetting('homeDay', null)
              }}
              label={
                <span className="flex items-center gap-2">
                  <IconHome size={18} /> Ganzer Plan zuhause
                </span>
              }
              hint="Körpergewicht und Bänder statt Geräte"
            />
          </Group>
          {deload && (
            <Notice tone="ok" className="mt-3">
              <p>Leichtere Woche bis Sonntag: halbe Sätze, gleiche Gewichte.</p>
              <Button size="sm" variant="ghost" className="-ml-3 mt-1" onClick={() => void endDeload()}>
                Jetzt beenden
              </Button>
            </Notice>
          )}
          {offer && !deload && (
            <Card className="mt-3 !p-4">
              <p className="text-[16px] font-semibold">Eine leichtere Woche?</p>
              <p className="mt-1 text-[14px] text-ink-2">{offer.weeks} Wochen Training mit diesem Plan. Halbe Sätze bei gleichen Gewichten helfen der Erholung.</p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => void startDeload(today)}>
                  Leichtere Woche
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void snoozeDeloadOffer(today)}>
                  Nicht jetzt
                </Button>
              </div>
            </Card>
          )}
          {!active && (
            <Button block variant="secondary" className="mt-3" onClick={() => void start('Training')}>
              <IconPlus size={18} strokeWidth={2.6} /> Freies Training
            </Button>
          )}
        </>
      ) : (
        !active && (
          <Card className="animate-rise">
            <p className="text-[22px] font-bold tracking-tight">Noch kein Plan</p>
            <p className="mt-1 text-[15px] text-ink-2">Sieben Fragen zu Tagen, Zeit und Geräten, dann steht deine Trainingswoche.</p>
            <div className="mt-4 flex gap-2">
              <Button size="lg" className="flex-1" onClick={() => go('/train/plan/new')}>
                Plan erstellen
              </Button>
              <Button size="lg" variant="secondary" onClick={() => void start('Training')}>
                Frei
              </Button>
            </div>
          </Card>
        )
      )}

      <SectionTitle
        action={
          <Button size="sm" variant="ghost" onClick={() => go('/train/cardio/new')}>
            <IconPlus size={15} strokeWidth={2.6} /> Eintragen
          </Button>
        }
      >
        Cardio
      </SectionTitle>
      <Card className="!p-4" onClick={() => go('/train/cardio')}>
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[15px] font-semibold">Diese Woche</p>
          <p className="text-[14px] tabular-nums text-ink-2">
            <span className="font-semibold text-ink">{fmtInt(cardio?.moderateEquivalent ?? 0)}</span> von {WHO_WEEKLY_MIN} Min
          </p>
        </div>
        <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-fill">
          <div className="h-full rounded-full bg-train transition-[width] duration-500" style={{ width: `${Math.min(100, ((cardio?.moderateEquivalent ?? 0) / WHO_WEEKLY_MIN) * 100)}%` }} />
        </div>
      </Card>

      {routines && routines.length > 0 && (
        <>
          <SectionTitle>Routinen</SectionTitle>
          <div className="card divide-y divide-line overflow-hidden">
            {routines.map((r) => (
              <div key={r.day.id} className="flex items-center gap-2 py-2.5 pl-4 pr-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[16px] font-semibold">{r.day.name}</p>
                  <p className="truncate text-[13px] text-ink-2">
                    {r.exercises
                      .map((e) => exerciseNames?.get(e.exerciseId) ?? '')
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => void start(r.day.name, r.exercises.map((e) => e.exerciseId), r.day.id)}>
                  Start
                </Button>
                <IconButton label={`${r.day.name}: Optionen`} className="size-9 text-ink-2" onClick={() => setRoutineMenu(r)}>
                  <IconDots size={20} />
                </IconButton>
              </div>
            ))}
          </div>
        </>
      )}

      {history && history.length > 0 && (
        <>
          <SectionTitle>Verlauf</SectionTitle>
          <Group>
            {history.map(({ s, stats }) => (
              <ListRow
                key={s.id}
                title={s.name}
                subtitle={`${formatDayShort(s.date)} · ${fmtDuration((new Date(s.endedAt ?? s.startedAt).getTime() - new Date(s.startedAt).getTime()) / 1000)}`}
                detail={
                  <span className="block text-right">
                    <span className="block font-semibold text-ink">{count(stats.workSets, 'Satz', 'Sätze')}</span>
                    {stats.volumeKg > 0 && <span className="block text-[12px]">{fmtInt(stats.volumeKg)} kg</span>}
                  </span>
                }
                onClick={() => go(`/train/summary/${s.id}`)}
              />
            ))}
          </Group>
        </>
      )}

      <DaySheet w={openDay} homeDefault={!!homeToday} deload={!!deload} onClose={() => setOpenDay(null)} onStart={(day, home) => void startDay(day, home)} onEdit={() => go('/train/plan')} />

      <Sheet open={!!routineMenu} onClose={() => setRoutineMenu(null)} title={routineMenu?.day.name}>
        {routineMenu && (
          <Group className="!shadow-none">
            <ListRow title="Routine löschen" destructive onClick={() => void removeRoutine(routineMenu)} />
          </Group>
        )}
      </Sheet>
    </Screen>
  )
}

const STATUS_TEXT: Record<WeekDay['status'], string> = {
  done: 'erledigt',
  today: 'heute',
  next: 'als Nächstes',
  upcoming: '',
  missed: 'verpasst',
}

function PlanDayRow({ w, due, home, onOpen, onStart }: { w: WeekDay; due: boolean; home: boolean; onOpen: () => void; onStart: () => void }) {
  const when = w.day.weekday != null ? WEEKDAY_LONG[w.day.weekday] : 'Flexibel'
  const status = STATUS_TEXT[w.status]
  return (
    <div className="flex items-center">
      <button type="button" onClick={onOpen} className="press-row flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 pr-2 text-left">
        <span
          aria-hidden
          className={cx(
            'flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold',
            w.status === 'done' && 'btn-accent',
            due && 'border-2 border-ink text-ink',
            w.status === 'missed' && 'border-2 border-dashed border-fill-strong text-ink-3',
            !due && (w.status === 'upcoming' || w.status === 'next' || w.status === 'today') && 'bg-fill text-ink-2',
          )}
        >
          {w.status === 'done' ? <IconCheck size={17} strokeWidth={3} /> : w.day.weekday != null ? WEEKDAY_SHORT[w.day.weekday] : '·'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-semibold">{w.day.name}</span>
          <span className="block truncate text-[13px] text-ink-2">
            {when}
            {status ? ` · ${status}` : ''} · {count(w.day.exercises.length, 'Übung', 'Übungen')}
          </span>
        </span>
        {!due && <IconChevronRight size={17} className="shrink-0 text-ink-3" />}
      </button>
      {due && (
        <Button size="sm" className="mr-3" onClick={onStart} disabled={w.day.exercises.length === 0}>
          {home ? <IconHome size={14} /> : <IconPlay size={13} />} Start
        </Button>
      )}
    </div>
  )
}

/** One plan day: its exercises at the gym or at home, and a start button for either. */
function DaySheet({
  w,
  homeDefault,
  deload,
  onClose,
  onStart,
  onEdit,
}: {
  w: WeekDay | null
  homeDefault: boolean
  deload: boolean
  onClose: () => void
  onStart: (day: PlanDayFull, home: boolean) => void
  onEdit: () => void
}) {
  const [home, setHome] = useState<boolean | null>(null)
  const atHome = home ?? homeDefault
  const preview = useLiveQuery(async () => (w ? dayPreview(w.day, { home: atHome, deload }) : null), [w, atHome, deload])
  const close = () => {
    setHome(null)
    onClose()
  }
  return (
    <Sheet
      open={!!w}
      onClose={close}
      title={w?.day.name}
      footer={
        w && (
          <Button
            block
            size="lg"
            disabled={!preview?.rows.length}
            onClick={() => {
              const day = w.day
              close()
              onStart(day, atHome)
            }}
          >
            {atHome ? <IconHome size={18} /> : <IconPlay size={16} />} {w.status === 'done' ? 'Nochmal trainieren' : 'Training starten'}
          </Button>
        )
      }
    >
      {w && (
        <div className="pb-1">
          <p className="text-[15px] text-ink-2">
            {w.day.weekday != null ? WEEKDAY_LONG[w.day.weekday] : 'Flexibel'}
            {preview ? ` · ${count(preview.rows.length, 'Übung', 'Übungen')} · ca. ${preview.minutes} Min` : ''}
          </p>
          <Segmented
            size="sm"
            className="mt-3"
            value={atHome ? 'home' : 'gym'}
            onChange={(v) => {
              haptic()
              setHome(v === 'home')
            }}
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
          <ul key={atHome ? 'home' : 'gym'} className="mt-3 divide-y divide-line">
            {preview?.rows.map((r, i) => (
              <li key={r.id} className="animate-in flex items-baseline justify-between gap-3 py-2.5" style={{ animationDelay: `${i * 30}ms` }}>
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-medium">{r.name}</span>
                  {r.replaces && <span className="block truncate text-[12px] text-ink-3">statt {r.replaces}</span>}
                </span>
                <span className="shrink-0 text-[14px] tabular-nums text-ink-2">
                  {r.sets} × {repsText(r)}
                </span>
              </li>
            ))}
          </ul>
          {preview && preview.dropped.length > 0 && <p className="mt-2 text-[13px] text-ink-3">Zuhause ohne Ersatz: {preview.dropped.join(', ')}</p>}
          <Button size="sm" variant="ghost" className="-ml-3 mt-2" onClick={onEdit}>
            Im Plan bearbeiten
          </Button>
        </div>
      )}
    </Sheet>
  )
}
