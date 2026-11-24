import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { db, type Exercise, type SetLog } from '../../db'
import { formatDayLong } from '../../lib/dates'
import { fmt1, fmt2, fmtDuration, fmtInt } from '../../lib/format'
import { findRecords, sessionStats } from '../../lib/training'
import { e1rm } from '../../lib/trends'
import { deleteSession, previousBests, saveRoutineFromSession } from '../../store/training'
import { IconCheck, IconTrophy } from '../../ui/icons'
import { Button, Card, EmptyState, IconTile, Screen, SectionTitle, Sheet, TextInput } from '../../ui/kit'
import { haptic } from '../../ui/motion'
import { useToast } from '../../ui/toast'

export default function Summary() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const session = useLiveQuery(async () => (await db.sessions.get(id)) ?? null, [id])
  const sets = useLiveQuery(() => db.setLogs.where('sessionId').equals(id).toArray(), [id])
  const exercises = useLiveQuery(async () => {
    const s = await db.sessions.get(id)
    const rows = s ? await db.exercises.bulkGet(s.exerciseIds) : []
    return rows.filter((e): e is Exercise => !!e)
  }, [id])
  const records = useLiveQuery(async () => {
    const s = await db.sessions.get(id)
    if (!s) return []
    const logged = await db.setLogs.where('sessionId').equals(id).toArray()
    return findRecords(logged, await previousBests(s.exerciseIds, id))
  }, [id])
  const [naming, setNaming] = useState<string | null>(null)

  if (session === undefined || !sets || !exercises) return null
  if (session === null) {
    return (
      <Screen back="/train" title="Workout">
        <EmptyState title="This workout no longer exists" />
      </Screen>
    )
  }

  const stats = sessionStats(sets)
  const duration = session.endedAt ? (new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 1000 : 0
  const name = (exId: string) => exercises.find((e) => e.id === exId)?.name ?? 'Exercise'
  const byExercise = (exId: string) => sets.filter((s) => s.exerciseId === exId && s.kind === 'work').sort((a, b) => a.setIndex - b.setIndex)

  const saveRoutine = async () => {
    if (!naming?.trim()) return
    await saveRoutineFromSession(session.id, naming.trim())
    haptic('success')
    setNaming(null)
    toast({ message: `Saved as routine "${naming.trim()}"` })
  }

  const remove = async () => {
    const keep: SetLog[] = sets
    const row = session
    await deleteSession(session.id)
    navigate('/train', { replace: true })
    toast({
      message: 'Workout deleted',
      action: {
        label: 'Undo',
        onClick: async () => {
          await db.sessions.put(row)
          await db.setLogs.bulkPut(keep)
        },
      },
    })
  }

  return (
    <Screen tone="train" back="/train" title={session.name} subtitle={formatDayLong(session.date)}>
      <Card tone="train" className="animate-rise mt-1 !p-6 text-center">
        <span className="animate-pop mx-auto flex size-16 items-center justify-center rounded-full btn-primary">
          <IconCheck size={34} strokeWidth={3} />
        </span>
        <p className="mt-4 text-title2">Workout complete</p>
        <p className="mt-1 text-[15px] text-ink-2">
          {session.name} · {formatDayLong(session.date)}
        </p>
        <div className="mt-5 grid grid-cols-3 divide-x divide-line rounded-[22px] bg-surface/70 py-3">
          {[
            { label: 'Duration', value: fmtDuration(duration) },
            { label: 'Work sets', value: fmtInt(stats.workSets) },
            { label: 'Volume, kg', value: fmtInt(stats.volumeKg) },
          ].map((x) => (
            <div key={x.label}>
              <div className="truncate text-[24px] font-bold tracking-tight">{x.value}</div>
              <div className="text-[12px] font-semibold text-ink-2">{x.label}</div>
            </div>
          ))}
        </div>
      </Card>

      {records && records.length > 0 && (
        <>
          <SectionTitle>Records</SectionTitle>
          <Card className="space-y-4 !p-4">
            {records.map((r) => (
              <div key={r.exerciseId} className="flex items-center gap-3">
                <IconTile tone="amber" size={38}>
                  <IconTrophy size={20} />
                </IconTile>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{name(r.exerciseId)}</span>
                  <span className="block text-[14px] text-ink-2">
                    Estimated 1RM {fmt1(r.e1rm)} kg{r.previous != null ? `, up from ${fmt1(r.previous)} kg` : ' · first record'}
                  </span>
                </span>
              </div>
            ))}
          </Card>
        </>
      )}

      <SectionTitle>Exercises</SectionTitle>
      <div className="space-y-2.5">
        {session.exerciseIds.map((exId) => {
          const list = byExercise(exId)
          if (!list.length) return null
          const best = Math.max(...list.map((s) => e1rm(s.weightKg, s.reps) ?? 0))
          return (
            <Card key={exId} className="!p-4">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate font-semibold">{name(exId)}</p>
                {best > 0 && <p className="shrink-0 text-[12px] font-semibold text-ink-3">e1RM {fmt1(best)} kg</p>}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {list.map((s) => (
                  <span key={s.id} className="rounded-full bg-fill px-2.5 py-1 text-[13px] font-semibold tabular-nums">
                    {fmt2(s.weightKg)} × {s.reps}
                  </span>
                ))}
              </div>
            </Card>
          )
        })}
      </div>

      <div className="mt-6 space-y-2">
        {!session.planDayId && stats.workSets > 0 && (
          <Button block size="lg" variant="secondary" onClick={() => setNaming(session.name === 'Workout' ? '' : session.name)}>
            Save as routine
          </Button>
        )}
        <Button block size="lg" onClick={() => navigate('/train')}>
          Done
        </Button>
        <Button block variant="ghost" className="!text-danger" onClick={() => void remove()}>
          Delete workout
        </Button>
      </div>

      <Sheet
        open={naming != null}
        onClose={() => setNaming(null)}
        title="Save as routine"
        footer={
          <Button block size="lg" disabled={!naming?.trim()} onClick={() => void saveRoutine()}>
            Save
          </Button>
        }
      >
        <p className="mb-3 text-[15px] text-ink-2">Same exercises and number of sets. Next time, each set starts from this workout's numbers.</p>
        <TextInput autoFocus placeholder="e.g. Upper A" value={naming ?? ''} onChange={(e) => setNaming(e.target.value)} />
      </Sheet>
    </Screen>
  )
}
