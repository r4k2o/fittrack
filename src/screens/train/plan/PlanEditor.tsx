// The plan is ordinary data: rename and reorder days, set their weekdays, swap an
// exercise for another of the same movement, change sets, reps, reserve and rest,
// pair supersets, add or remove sessions. The volume bars and the warnings follow
// every edit.

import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { db, type Exercise, type PlanExercise } from '../../../db'
import { alternativesFor, weeklyTargets } from '../../../lib/planner'
import { countsAsCompound, GROUP_LABEL, primaryGroups, sessionMinutes, spacingIssues, volumeOf, WEEKDAY_LONG, WEEKDAY_SHORT } from '../../../lib/volume'
import {
  activePlan,
  addPlanDay,
  addPlanExercise,
  deletePlan,
  homeOn,
  movePlanDay,
  movePlanExercise,
  planAnswers,
  removePlanDay,
  removePlanExercise,
  renamePlan,
  restorePlan,
  restorePlanDay,
  restorePlanExercises,
  startPlanDay,
  toggleSuperset,
  updatePlanDay,
  updatePlanExercise,
  type PlanDayFull,
} from '../../../store/plans'
import { activeSession } from '../../../store/training'
import { IconDots, IconPlay, IconPlus, IconTrain } from '../../../ui/icons'
import { Button, Card, Chip, EmptyState, Field, Group, IconButton, ListRow, Notice, Screen, Segmented, Sheet, Spinner, Stepper, TextInput } from '../../../ui/kit'
import { haptic } from '../../../ui/motion'
import { useToast } from '../../../ui/toast'
import { ExercisePicker } from '../ExercisePicker'
import { ExerciseLine, SupersetFrame, WeekRhythm } from './PlanPreview'
import { fmtRest, groupPairs } from './planFormat'
import { VolumeBars } from './VolumeBars'
import { PlanAssistant } from './PlanAssistant'
import { useSetting } from '../../../hooks'

function dayMinutes(day: PlanDayFull, exercises: ReadonlyMap<string, Exercise>): number {
  return sessionMinutes(
    day.exercises.map((x) => {
      const e = exercises.get(x.exerciseId)
      return { id: x.id, compound: e ? countsAsCompound(e) : true, sets: x.sets, pairWith: x.supersetWith }
    }),
  )
}

export default function PlanEditor() {
  const navigate = useNavigate()
  const toast = useToast()
  const bundle = useLiveQuery(async () => (await activePlan()) ?? null, [])
  const all = useLiveQuery(() => db.exercises.toArray(), [])
  const exercises = useMemo(() => new Map((all ?? []).map((e) => [e.id, e])), [all])
  const [daySheet, setDaySheet] = useState<string | null>(null)
  const [exSheet, setExSheet] = useState<string | null>(null)
  const [picker, setPicker] = useState<{ mode: 'add'; dayId: string } | { mode: 'swap'; rowId: string } | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [assistant, setAssistant] = useState(false)
  const aiKey = useSetting('aiApiKey')

  if (bundle === undefined || !all)
    return (
      <Screen back="/train" title="Plan">
        <div className="flex justify-center py-16 text-ink-2">
          <Spinner />
        </div>
      </Screen>
    )
  if (bundle === null)
    return (
      <Screen back="/train" title="Plan">
        <EmptyState icon={<IconTrain size={28} />} title="Noch kein Plan">
          Acht kurze Fragen, dann steht deine Trainingswoche.
          <Button className="mt-4" onClick={() => navigate('/train/plan/new')}>
            Plan erstellen
          </Button>
        </EmptyState>
      </Screen>
    )

  const { plan, days } = bundle
  const answers = planAnswers(plan)
  const rows = days.flatMap((d) => d.exercises)
  const volume = volumeOf(rows.map((x) => ({ exercise: exercises.get(x.exerciseId), sets: x.sets })))
  const targets = answers ? weeklyTargets(answers) : undefined
  const spacing = spacingIssues(days.map((d) => ({ weekday: d.weekday, groups: new Set(d.exercises.flatMap((x) => primaryGroups(exercises.get(x.exerciseId) ?? { primary: [] }))) })))
  const minutes = new Map(days.map((d) => [d.id, dayMinutes(d, exercises)]))
  const over = answers ? days.filter((d) => (minutes.get(d.id) ?? 0) > answers.minutes) : []
  const longest = Math.max(0, ...minutes.values())
  const sheetDay = days.find((d) => d.id === daySheet)
  const sheetRow = rows.find((x) => x.id === exSheet)
  const sheetEx = sheetRow ? exercises.get(sheetRow.exerciseId) : undefined
  const swapRow = picker?.mode === 'swap' ? rows.find((x) => x.id === picker.rowId) : undefined
  const swapEx = swapRow ? exercises.get(swapRow.exerciseId) : undefined

  const removeDay = async (dayId: string) => {
    const saved = await removePlanDay(dayId)
    setDaySheet(null)
    if (saved) toast({ message: `${saved.day.name} entfernt`, action: { label: 'Rückgängig', onClick: () => restorePlanDay(saved) } })
  }
  const removeRow = async (id: string) => {
    const saved = await removePlanExercise(id)
    setExSheet(null)
    toast({ message: 'Übung entfernt', action: { label: 'Rückgängig', onClick: () => restorePlanExercises(saved) } })
  }
  const removePlan = async () => {
    const snap = await deletePlan(plan.id)
    navigate('/train', { replace: true })
    if (snap) toast({ message: 'Plan gelöscht', action: { label: 'Rückgängig', onClick: () => restorePlan(snap) } })
  }
  const start = async (day: PlanDayFull) => {
    haptic()
    const open = await activeSession()
    const s = open ?? (await startPlanDay(day, { home: await homeOn() }))
    navigate(`/train/session/${s.id}`)
  }
  const pick = async (e: Exercise) => {
    if (!picker) return
    if (picker.mode === 'add') await addPlanExercise(picker.dayId, e)
    else await updatePlanExercise(picker.rowId, { exerciseId: e.id })
    haptic()
    setPicker(null)
  }

  return (
    <Screen
      back="/train"
      title={plan.name}
      actions={
        <>
          {aiKey && (
            <Button size="sm" variant="glass" onClick={() => setAssistant(true)}>
              KI fragen
            </Button>
          )}
          <Button size="sm" variant="glass" onClick={() => navigate('/train/plan/new')}>
            Neuer Plan
          </Button>
        </>
      }
    >
      <Card className="!p-5">
        <button type="button" className="press -m-1 block rounded-xl p-1 text-left" aria-label="Plan umbenennen" onClick={() => setRenaming(plan.name)}>
          <p className="text-title2">{plan.name}</p>
        </button>
        <p className="mt-0.5 text-[15px] text-ink-2">
          {days.length} {days.length === 1 ? 'Einheit' : 'Einheiten'} pro Woche · bis {longest} Min{answers ? ` von ${answers.minutes}` : ''}
        </p>
        <div className="mt-4">
          <WeekRhythm weekdays={days.map((d) => d.weekday)} />
        </div>
      </Card>

      {(spacing.length > 0 || over.length > 0) && (
        <div className="mt-3 space-y-2">
          {spacing.map((s) => (
            <Notice key={`${s.group}${s.days.join()}`} tone="warn">
              {GROUP_LABEL[s.group]} wird am {WEEKDAY_LONG[days[s.days[0]].weekday ?? 0]} und {WEEKDAY_LONG[days[s.days[1]].weekday ?? 0]} trainiert, weniger als 48 Stunden
              Abstand. Passt es dir so, lass es; sonst verschieb eine Einheit.
            </Notice>
          ))}
          {over.map((d) => (
            <Notice key={d.id} tone="warn">
              {d.name} dauert etwa {minutes.get(d.id)} Minuten, mehr als die geplanten {answers?.minutes}.
            </Notice>
          ))}
        </div>
      )}

      <Card className="mt-3 !p-4">
        <VolumeBars volume={volume} targets={targets} />
      </Card>

      {days.map((d, i) => {
        const groups = groupPairs(d.exercises.map((x) => ({ ...x, pairWith: x.supersetWith ?? null })))
        const line = (x: PlanExercise) => (
          <button key={x.id} type="button" className="press block w-full text-left" onClick={() => setExSheet(x.id)}>
            <ExerciseLine ex={exercises.get(x.exerciseId)} x={x} trailing={<IconDots size={18} className="text-ink-3" />} />
          </button>
        )
        return (
          <Card key={d.id} className="animate-rise mt-3 !p-4" style={{ '--i': i } as CSSProperties}>
            <div className="flex items-center gap-2">
              <button type="button" className="press min-w-0 flex-1 rounded-xl text-left" onClick={() => setDaySheet(d.id)}>
                <p className="text-[13px] font-semibold text-ink-2">
                  {d.weekday != null ? WEEKDAY_LONG[d.weekday] : 'Flexibel'} · ca. {minutes.get(d.id)} Min
                </p>
                <h3 className="truncate text-[19px] font-bold tracking-tight">{d.name}</h3>
              </button>
              <Button size="sm" onClick={() => void start(d)} disabled={d.exercises.length === 0}>
                <IconPlay size={13} /> Start
              </Button>
              <IconButton label={`${d.name}: Optionen`} className="size-9 text-ink-2" onClick={() => setDaySheet(d.id)}>
                <IconDots size={20} />
              </IconButton>
            </div>
            <div className="mt-1 divide-y divide-line">
              {groups.map((g) =>
                g.length === 2 ? (
                  <SupersetFrame key={g[0].id}>{g.map((x) => line(x))}</SupersetFrame>
                ) : (
                  line(g[0])
                ),
              )}
            </div>
            <Button size="sm" variant="secondary" className="mt-2" onClick={() => setPicker({ mode: 'add', dayId: d.id })}>
              <IconPlus size={16} strokeWidth={2.6} /> Übung hinzufügen
            </Button>
          </Card>
        )
      })}

      {days.length === 0 && (
        <Notice tone="warn" className="mt-3">
          Dieser Plan hat noch keine Einheiten. Füge unten eine hinzu.
        </Notice>
      )}
      <Button
        block
        variant="outline"
        size="lg"
        className="mt-3 !border-dashed"
        onClick={async () => {
          const used = new Set(days.map((d) => d.weekday))
          const free = [0, 1, 2, 3, 4, 5, 6].find((w) => !used.has(w)) ?? null
          await addPlanDay(plan.id, `Tag ${days.length + 1}`, free)
          haptic()
        }}
      >
        <IconPlus size={20} strokeWidth={2.6} /> Einheit hinzufügen
      </Button>

      <p className="mt-6 px-1 text-[13px] leading-relaxed text-ink-2">
        Ein Satz zählt voll für den Hauptmuskel und halb für Hilfsmuskeln. Die Zeit rechnet 3 Minuten pro Grundübungssatz, 2 pro Isolationssatz und 5 zum Aufwärmen.
      </p>
      <Button block variant="danger" className="mt-4" onClick={() => void removePlan()}>
        Plan löschen
      </Button>

      {/* Day options */}
      <Sheet open={!!sheetDay} onClose={() => setDaySheet(null)} title={sheetDay?.name}>
        {sheetDay && (
          <div className="space-y-4 pb-1">
            <Field label="Name">
              <TextInput
                key={sheetDay.id}
                defaultValue={sheetDay.name}
                onBlur={(e) => {
                  const v = e.target.value.trim()
                  if (v && v !== sheetDay.name) void updatePlanDay(sheetDay.id, { name: v })
                }}
              />
            </Field>
            <Field label="Wochentag" group>
              <div className="flex flex-wrap gap-2">
                <Chip active={sheetDay.weekday == null} onClick={() => void updatePlanDay(sheetDay.id, { weekday: null })}>
                  Flexibel
                </Chip>
                {WEEKDAY_SHORT.map((w, idx) => (
                  <Chip key={w} active={sheetDay.weekday === idx} onClick={() => void updatePlanDay(sheetDay.id, { weekday: idx })}>
                    {w}
                  </Chip>
                ))}
              </div>
            </Field>
            <Group className="!shadow-none">
              {days.indexOf(sheetDay) > 0 && <ListRow title="Nach vorne" onClick={() => void movePlanDay(plan.id, sheetDay.id, -1)} />}
              {days.indexOf(sheetDay) < days.length - 1 && <ListRow title="Nach hinten" onClick={() => void movePlanDay(plan.id, sheetDay.id, 1)} />}
              <ListRow title="Einheit entfernen" destructive onClick={() => void removeDay(sheetDay.id)} />
            </Group>
          </div>
        )}
      </Sheet>

      {/* Exercise prescription */}
      <Sheet open={!!sheetRow} onClose={() => setExSheet(null)} title={sheetEx?.name}>
        {sheetRow && (
          <div className="space-y-4 pb-1">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Sätze" group>
                <Stepper value={sheetRow.sets} min={1} onChange={(n) => void updatePlanExercise(sheetRow.id, { sets: Math.min(8, Math.max(1, n)) })} />
              </Field>
              <Field label="Pause" group>
                <Stepper value={sheetRow.restSec} step={15} min={30} format={fmtRest} onChange={(n) => void updatePlanExercise(sheetRow.id, { restSec: Math.min(600, n) })} />
              </Field>
              <Field label={sheetEx?.unit === 'seconds' ? 'Sekunden, von' : 'Wdh., von'} group>
                <Stepper
                  value={sheetRow.repMin}
                  min={1}
                  step={sheetEx?.unit === 'seconds' ? 5 : 1}
                  onChange={(n) => void updatePlanExercise(sheetRow.id, { repMin: n, repMax: Math.max(n, sheetRow.repMax) })}
                />
              </Field>
              <Field label="bis" group>
                <Stepper
                  value={sheetRow.repMax}
                  min={1}
                  step={sheetEx?.unit === 'seconds' ? 5 : 1}
                  onChange={(n) => void updatePlanExercise(sheetRow.id, { repMax: n, repMin: Math.min(n, sheetRow.repMin) })}
                />
              </Field>
            </div>
            <Field label="Wdh. in Reserve" hint="Wie viele du am Satzende noch schaffen würdest" group>
              <Segmented
                value={sheetRow.targetRir}
                options={[1, 2, 3].map((n) => ({ value: n, label: String(n) }))}
                onChange={(n) => void updatePlanExercise(sheetRow.id, { targetRir: n })}
              />
            </Field>
            <Group className="!shadow-none">
              <ListRow
                title="Übung tauschen"
                subtitle="Gleiche Bewegung zuerst"
                onClick={() => {
                  setPicker({ mode: 'swap', rowId: sheetRow.id })
                  setExSheet(null)
                }}
              />
              <ListRow
                title={sheetRow.supersetWith ? 'Superset auflösen' : 'Superset mit der nächsten Übung'}
                onClick={async () => {
                  const r = await toggleSuperset(sheetRow.id)
                  if (r === 'none') toast({ message: 'Danach kommt keine Übung zum Kombinieren' })
                  haptic()
                }}
              />
              <ListRow title="Nach oben" onClick={() => void movePlanExercise(sheetRow.id, -1)} />
              <ListRow title="Nach unten" onClick={() => void movePlanExercise(sheetRow.id, 1)} />
              <ListRow title="Aus der Einheit entfernen" destructive onClick={() => void removeRow(sheetRow.id)} />
            </Group>
          </div>
        )}
      </Sheet>

      <Sheet open={!!picker} onClose={() => setPicker(null)} title={picker?.mode === 'swap' ? `${swapEx?.name ?? ''} tauschen` : 'Übung hinzufügen'}>
        <ExercisePicker
          onPick={(e) => void pick(e)}
          exclude={picker?.mode === 'add' ? (days.find((d) => d.id === picker.dayId)?.exercises.map((x) => x.exerciseId) ?? []) : swapEx ? [swapEx.id] : []}
          suggest={swapEx ? alternativesFor(swapEx, all, answers ?? undefined) : undefined}
        />
      </Sheet>

      <PlanAssistant open={assistant} onClose={() => setAssistant(false)} bundle={bundle} answers={answers} exercises={exercises} library={all.filter((e) => !e.custom)} />

      <Sheet
        open={renaming != null}
        onClose={() => setRenaming(null)}
        title="Planname"
        footer={
          <Button
            block
            size="lg"
            disabled={!renaming?.trim()}
            onClick={async () => {
              if (renaming?.trim()) await renamePlan(plan.id, renaming.trim())
              setRenaming(null)
            }}
          >
            Speichern
          </Button>
        }
      >
        <TextInput autoFocus value={renaming ?? ''} onChange={(e) => setRenaming(e.target.value)} />
      </Sheet>
    </Screen>
  )
}
