// Logging a cardio session takes seconds: type and duration are prefilled from last
// time, and only the duration is required. Calories come from the watch when typed in,
// otherwise from MET × body weight × hours.

import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { db, type CardioType } from '../../db'
import { useToday } from '../../hooks'
import { localDay } from '../../lib/dates'
import { CARDIO_TYPES, estimateCardioKcal, intensityOf, paceText } from '../../lib/cardio'
import { fmtInt } from '../../lib/format'
import { bodyWeightKg, deleteCardio, lastCardio, restoreCardio, saveCardio } from '../../store/cardio'
import { IconTrash } from '../../ui/icons'
import { Button, Chip, cx, Field, IconButton, NumberInput, Screen, Spinner, StickyFooter, TextInput } from '../../ui/kit'
import { haptic } from '../../ui/motion'
import { useToast } from '../../ui/toast'

const EFFORT_WORD = ['', 'Very light', 'Very light', 'Light', 'Light', 'Moderate', 'Moderate', 'Hard', 'Hard', 'Very hard', 'Maximal']

interface Draft {
  type: CardioType
  date: string
  time: string
  durationMin: number | null
  distanceKm: number | null
  rpe: number
  avgHr: number | null
  kcal: number | null
  notes: string
}

const pad = (n: number) => String(n).padStart(2, '0')

export default function CardioForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const today = useToday()
  const existing = useLiveQuery(async () => (id ? ((await db.cardioSessions.get(id)) ?? null) : null), [id])
  const last = useLiveQuery(async () => (id ? null : ((await lastCardio()) ?? null)), [id])
  const weight = useLiveQuery(() => bodyWeightKg(), [])
  const [draft, setDraft] = useState<Draft | null>(null)

  useEffect(() => {
    if (draft) return
    if (id) {
      if (!existing) return
      const at = existing.startedAt ? new Date(existing.startedAt) : null
      setDraft({
        type: existing.type,
        date: existing.date,
        time: at ? `${pad(at.getHours())}:${pad(at.getMinutes())}` : '',
        durationMin: existing.durationMin,
        distanceKm: existing.distanceKm ?? null,
        rpe: existing.rpe ?? 5,
        avgHr: existing.avgHr ?? null,
        kcal: existing.kcalEstimated ? null : (existing.kcal ?? null),
        notes: existing.notes ?? '',
      })
      return
    }
    if (last === undefined) return
    const now = new Date()
    setDraft({
      type: last?.type ?? 'run',
      date: today,
      time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
      durationMin: last?.durationMin ?? 30,
      distanceKm: null,
      rpe: last?.rpe ?? 5,
      avgHr: null,
      kcal: null,
      notes: '',
    })
  }, [id, existing, last, today, draft])

  if (!draft)
    return (
      <Screen back title="Cardio" tone="train">
        <div className="flex justify-center py-16 text-ink-2">
          <Spinner />
        </div>
      </Screen>
    )

  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch })
  const valid = draft.durationMin != null && draft.durationMin > 0 && draft.durationMin < 1440 && !!draft.date
  const estimate = weight && draft.durationMin ? estimateCardioKcal(draft.type, draft.durationMin, weight, draft.distanceKm, draft.rpe) : null
  const pace = draft.durationMin ? paceText(draft.type, draft.durationMin, draft.distanceKm) : null
  const intensity = intensityOf(draft.rpe)

  const save = async () => {
    if (!valid) return
    const startedAt = draft.time ? new Date(`${draft.date}T${draft.time}`).toISOString() : null
    const row = await saveCardio(
      {
        date: draft.date,
        startedAt,
        type: draft.type,
        durationMin: draft.durationMin!,
        distanceKm: draft.distanceKm,
        rpe: draft.rpe,
        avgHr: draft.avgHr,
        kcal: draft.kcal,
        notes: draft.notes,
      },
      id,
    )
    haptic('success')
    toast({ message: `${CARDIO_TYPES.find((t) => t.value === row.type)?.label} · ${row.durationMin} min saved` })
    navigate(-1)
  }

  const remove = async () => {
    if (!id) return
    const row = await deleteCardio(id)
    navigate(-1)
    if (row) toast({ message: 'Session deleted', action: { label: 'Undo', onClick: () => restoreCardio(row) } })
  }

  return (
    <Screen
      back
      title={id ? 'Edit cardio' : 'Log cardio'}
      tone="train"
      large={false}
      bottomPad={false}
      className="pb-[calc(env(safe-area-inset-bottom)+7rem)]"
      actions={
        id ? (
          <IconButton label="Delete session" className="text-danger" onClick={() => void remove()}>
            <IconTrash size={20} />
          </IconButton>
        ) : undefined
      }
    >
      <div className="space-y-5 pt-2">
        <Field label="Type" group>
          <div className="grid grid-cols-3 gap-2">
            {CARDIO_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                aria-pressed={draft.type === t.value}
                onClick={() => set({ type: t.value })}
                className={cx('press min-h-12 rounded-[16px] px-2 text-[14px] font-semibold', draft.type === t.value ? 'bg-ink text-page' : 'card')}
              >
                {t.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Duration" hint="Minutes">
          <NumberInput value={draft.durationMin} integer ariaLabel="Duration in minutes" onChange={(n) => set({ durationMin: n })} inputClassName="text-[22px] font-semibold" />
        </Field>
        <div className="-mt-2 flex flex-wrap gap-2">
          {[20, 30, 45, 60, 90].map((m) => (
            <Chip key={m} active={draft.durationMin === m} onClick={() => set({ durationMin: m })}>
              {m} min
            </Chip>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <TextInput type="date" value={draft.date} max={localDay()} onChange={(e) => set({ date: e.target.value })} />
          </Field>
          <Field label="Start">
            <TextInput type="time" value={draft.time} onChange={(e) => set({ time: e.target.value })} />
          </Field>
        </div>

        <Field label="Distance" hint={pace ? `Pace ${pace}` : 'Kilometres, optional'}>
          <NumberInput value={draft.distanceKm} ariaLabel="Distance in kilometres" onChange={(n) => set({ distanceKm: n })} />
        </Field>

        <Field label={`Effort: ${draft.rpe} of 10 · ${EFFORT_WORD[draft.rpe]}`} hint={`Counts as ${intensity} for the weekly minutes`}>
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={draft.rpe}
            aria-label="Effort from 1 to 10"
            onChange={(e) => set({ rpe: Number(e.target.value) })}
            className="h-11 w-full accent-[var(--train)]"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Average heart rate" hint="Optional">
            <NumberInput value={draft.avgHr} integer ariaLabel="Average heart rate" onChange={(n) => set({ avgHr: n })} />
          </Field>
          <Field label="Calories" hint={estimate ? `Empty: about ${fmtInt(estimate)}` : 'From your watch'}>
            <NumberInput value={draft.kcal} integer ariaLabel="Calories burned" placeholder={estimate ? `≈ ${fmtInt(estimate)}` : '–'} onChange={(n) => set({ kcal: n })} />
          </Field>
        </div>
        {!weight && <p className="-mt-2 px-1 text-[13px] text-ink-2">Log your weight once to get a calorie estimate.</p>}

        <Field label="Notes">
          <TextInput value={draft.notes} placeholder="Optional" onChange={(e) => set({ notes: e.target.value })} />
        </Field>
      </div>

      <StickyFooter>
        <Button block size="lg" disabled={!valid} onClick={() => void save()}>
          Save
        </Button>
      </StickyFooter>
    </Screen>
  )
}
