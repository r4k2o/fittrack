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

  if (bundle === undefined || !all)
    return (
      <Screen back="/train" title="Plan" tone="train">
        <div className="flex justify-center py-16 text-ink-2">
          <Spinner />
        </div>
      </Screen>
    )
  if (bundle === null)
    return (
      <Screen back="/train" title="Plan" tone="train">
        <EmptyState icon={<IconTrain size={28} />} title="No plan yet">
          Seven questions give you a week of training you can edit.
          <Button className="mt-4" onClick={() => navigate('/train/plan/new')}>
            Build a plan
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
    if (saved) toast({ message: `${saved.day.name} removed`, action: { label: 'Undo', onClick: () => restorePlanDay(saved) } })
  }
  const removeRow = async (id: string) => {
    const saved = await removePlanExercise(id)
    setExSheet(null)
    toast({ message: 'Exercise removed', action: { label: 'Undo', onClick: () => restorePlanExercises(saved) } })
  }
  const removePlan = async () => {
    const snap = await deletePlan(plan.id)
    navigate('/train', { replace: true })
    if (snap) toast({ message: 'Plan deleted', action: { label: 'Undo', onClick: () => restorePlan(snap) } })
  }
  const start = async (day: PlanDayFull) => {
    haptic()
    const open = await activeSession()
    const s = open ?? (await startPlanDay(day))
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
      tone="train"
      actions={
        <Button size="sm" variant="glass" onClick={() => navigate('/train/plan/new')}>
          New plan
        </Button>
      }
    >
      <Card tone="train" className="!p-5">
        <button type="button" className="press -m-1 block rounded-xl p-1 text-left" onClick={() => setRenaming(plan.name)}>
          <p className="text-[13px] font-semibold text-ink-2">Your plan</p>
          <p className="text-title2 mt-0.5">{plan.name}</p>
        </button>
        <p className="mt-0.5 text-[15px] text-ink-2">
          {days.length} {days.length === 1 ? 'session' : 'sessions'} a week · up to {longest} min{answers ? ` of ${answers.minutes}` : ''}
        </p>
        <div className="mt-4">
          <WeekRhythm weekdays={days.map((d) => d.weekday)} />
        </div>
      </Card>

      {(spacing.length > 0 || over.length > 0) && (
        <div className="mt-3 space-y-2">
          {spacing.map((s) => (
            <Notice key={`${s.group}${s.days.join()}`} tone="warn">
              {GROUP_LABEL[s.group]} is trained on {WEEKDAY_LONG[days[s.days[0]].weekday ?? 0]} and {WEEKDAY_LONG[days[s.days[1]].weekday ?? 0]}, less than 48 hours apart. Keep it if
              that suits you, or move one session.
            </Notice>
          ))}
          {over.map((d) => (
            <Notice key={d.id} tone="warn">
              {d.name} takes about {minutes.get(d.id)} minutes, more than the {answers?.minutes} you planned.
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
            <ExerciseLine ex={exercises.get(x.exerciseId)} x={x} trailing={<IconDots size={18} className="rotate-90 text-ink-3" />} />
          </button>
        )
        return (
          <Card key={d.id} className="animate-rise mt-3 !p-4" style={{ '--i': i } as CSSProperties}>
            <div className="flex items-center gap-2">
              <button type="button" className="press min-w-0 flex-1 rounded-xl text-left" onClick={() => setDaySheet(d.id)}>
                <p className="text-[13px] font-semibold text-ink-2">
                  {d.weekday != null ? WEEKDAY_LONG[d.weekday] : 'No fixed day'} · ~{minutes.get(d.id)} min
                </p>
                <h3 className="truncate text-[19px] font-bold tracking-tight">{d.name}</h3>
              </button>
              <Button size="sm" onClick={() => void start(d)} disabled={d.exercises.length === 0}>
                <IconPlay size={13} /> Start
              </Button>
              <IconButton label={`${d.name} options`} className="size-9 text-ink-2" onClick={() => setDaySheet(d.id)}>
                <IconDots size={20} className="rotate-90" />
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
              <IconPlus size={16} strokeWidth={2.6} /> Add exercise
            </Button>
          </Card>
        )
      })}

      {days.length === 0 && (
        <Notice tone="warn" className="mt-3">
          This plan has no sessions yet. Add one below.
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
          await addPlanDay(plan.id, `Day ${days.length + 1}`, free)
          haptic()
        }}
      >
        <IconPlus size={20} strokeWidth={2.6} /> Add a session
      </Button>

      <p className="mt-6 px-1 text-[13px] leading-relaxed text-ink-2">
        Weekly sets count 1 for the muscle an exercise mainly trains and half for muscles that assist. The time estimate allows 3 minutes per compound set, 2 per isolation set and
        5 for warming up.
      </p>
      <Button block variant="danger" className="mt-4" onClick={() => void removePlan()}>
        Delete plan
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
            <Field label="Weekday" group>
              <div className="flex flex-wrap gap-2">
                <Chip active={sheetDay.weekday == null} onClick={() => void updatePlanDay(sheetDay.id, { weekday: null })}>
                  Any
                </Chip>
                {WEEKDAY_SHORT.map((w, idx) => (
                  <Chip key={w} active={sheetDay.weekday === idx} onClick={() => void updatePlanDay(sheetDay.id, { weekday: idx })}>
                    {w}
                  </Chip>
                ))}
              </div>
            </Field>
            <Group className="!shadow-none">
              {days.indexOf(sheetDay) > 0 && <ListRow title="Move earlier" onClick={() => void movePlanDay(plan.id, sheetDay.id, -1)} />}
              {days.indexOf(sheetDay) < days.length - 1 && <ListRow title="Move later" onClick={() => void movePlanDay(plan.id, sheetDay.id, 1)} />}
              <ListRow title="Remove session" destructive onClick={() => void removeDay(sheetDay.id)} />
            </Group>
          </div>
        )}
      </Sheet>

      {/* Exercise prescription */}
      <Sheet open={!!sheetRow} onClose={() => setExSheet(null)} title={sheetEx?.name}>
        {sheetRow && (
          <div className="space-y-4 pb-1">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Sets" group>
                <Stepper value={sheetRow.sets} min={1} onChange={(n) => void updatePlanExercise(sheetRow.id, { sets: Math.min(8, Math.max(1, n)) })} />
              </Field>
              <Field label="Rest" group>
                <Stepper value={sheetRow.restSec} step={15} min={30} format={fmtRest} onChange={(n) => void updatePlanExercise(sheetRow.id, { restSec: Math.min(600, n) })} />
              </Field>
              <Field label={sheetEx?.unit === 'seconds' ? 'Seconds, from' : 'Reps, from'} group>
                <Stepper
                  value={sheetRow.repMin}
                  min={1}
                  step={sheetEx?.unit === 'seconds' ? 5 : 1}
                  onChange={(n) => void updatePlanExercise(sheetRow.id, { repMin: n, repMax: Math.max(n, sheetRow.repMax) })}
                />
              </Field>
              <Field label="to" group>
                <Stepper
                  value={sheetRow.repMax}
                  min={1}
                  step={sheetEx?.unit === 'seconds' ? 5 : 1}
                  onChange={(n) => void updatePlanExercise(sheetRow.id, { repMax: n, repMin: Math.min(n, sheetRow.repMin) })}
                />
              </Field>
            </div>
            <Field label="Reps in reserve" hint="How many more you could do at the end of a set" group>
              <Segmented
                value={sheetRow.targetRir}
                options={[1, 2, 3].map((n) => ({ value: n, label: String(n) }))}
                onChange={(n) => void updatePlanExercise(sheetRow.id, { targetRir: n })}
              />
            </Field>
            <Group className="!shadow-none">
              <ListRow
                title="Swap exercise"
                subtitle="Same movement first"
                onClick={() => {
                  setPicker({ mode: 'swap', rowId: sheetRow.id })
                  setExSheet(null)
                }}
              />
              <ListRow
                title={sheetRow.supersetWith ? 'Split superset' : 'Superset with the next exercise'}
                onClick={async () => {
                  const r = await toggleSuperset(sheetRow.id)
                  if (r === 'none') toast({ message: 'Nothing after it to pair with' })
                  haptic()
                }}
              />
              <ListRow title="Move up" onClick={() => void movePlanExercise(sheetRow.id, -1)} />
              <ListRow title="Move down" onClick={() => void movePlanExercise(sheetRow.id, 1)} />
              <ListRow title="Remove from session" destructive onClick={() => void removeRow(sheetRow.id)} />
            </Group>
          </div>
        )}
      </Sheet>

      <Sheet open={!!picker} onClose={() => setPicker(null)} title={picker?.mode === 'swap' ? `Swap ${swapEx?.name ?? ''}` : 'Add exercise'}>
        <ExercisePicker
          onPick={(e) => void pick(e)}
          exclude={picker?.mode === 'add' ? (days.find((d) => d.id === picker.dayId)?.exercises.map((x) => x.exerciseId) ?? []) : swapEx ? [swapEx.id] : []}
          suggest={swapEx ? alternativesFor(swapEx, all, answers ?? undefined) : undefined}
        />
      </Sheet>

      <Sheet
        open={renaming != null}
        onClose={() => setRenaming(null)}
        title="Plan name"
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
            Save
          </Button>
        }
      >
        <TextInput autoFocus value={renaming ?? ''} onChange={(e) => setRenaming(e.target.value)} />
      </Sheet>
    </Screen>
  )
}
