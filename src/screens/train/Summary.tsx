import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { db, type Exercise, type SetLog } from '../../db'
import { formatDayLong } from '../../lib/dates'
import { fmt1, fmt2, fmtDuration, fmtInt } from '../../lib/format'
import { findRecords, sessionStats } from '../../lib/training'
import { e1rm } from '../../lib/trends'
import { deleteSession, previousBests, saveRoutineFromSession } from '../../store/training'
import { IconTrophy } from '../../ui/icons'
import { Button, Card, EmptyState, Screen, SectionTitle, Sheet, TextInput } from '../../ui/kit'
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
    <Screen back="/train" title={session.name} subtitle={formatDayLong(session.date)}>
      <Card className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: 'Duration', value: fmtDuration(duration) },
          { label: 'Work sets', value: fmtInt(stats.workSets) },
          { label: 'Volume, kg', value: fmtInt(stats.volumeKg) },
        ].map((x) => (
          <div key={x.label}>
            <div className="truncate text-2xl font-bold tabular-nums">{x.value}</div>
            <div className="text-xs font-semibold text-muted">{x.label}</div>
          </div>
        ))}
      </Card>

      {records && records.length > 0 && (
        <>
          <SectionTitle>Records</SectionTitle>
          <Card className="space-y-3">
            {records.map((r) => (
              <div key={r.exerciseId} className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                  <IconTrophy size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{name(r.exerciseId)}</span>
                  <span className="block text-sm text-muted tabular-nums">
                    Estimated 1RM {fmt1(r.e1rm)} kg{r.previous != null ? `, up from ${fmt1(r.previous)} kg` : ', first record'}
                  </span>
                </span>
              </div>
            ))}
          </Card>
        </>
      )}

      <SectionTitle>Exercises</SectionTitle>
      <div className="space-y-2">
        {session.exerciseIds.map((exId) => {
          const list = byExercise(exId)
          if (!list.length) return null
          const best = Math.max(...list.map((s) => e1rm(s.weightKg, s.reps) ?? 0))
          return (
            <Card key={exId}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-semibold">{name(exId)}</p>
                {best > 0 && <p className="text-xs text-muted tabular-nums">e1RM {fmt1(best)} kg</p>}
              </div>
              <p className="mt-1 text-sm text-muted tabular-nums">{list.map((s) => `${fmt2(s.weightKg)} × ${s.reps}`).join(' · ')}</p>
            </Card>
          )
        })}
      </div>

      <div className="mt-6 space-y-2">
        {!session.planDayId && stats.workSets > 0 && (
          <Button block variant="secondary" onClick={() => setNaming(session.name === 'Workout' ? '' : session.name)}>
            Save as routine
          </Button>
        )}
        <Button block onClick={() => navigate('/train')}>
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
          <Button block disabled={!naming?.trim()} onClick={() => void saveRoutine()}>
            Save
          </Button>
        }
      >
        <p className="mb-3 text-sm text-muted">Same exercises and number of sets. Next time, each set starts from this workout's numbers.</p>
        <TextInput autoFocus placeholder="e.g. Upper A" value={naming ?? ''} onChange={(e) => setNaming(e.target.value)} />
      </Sheet>
    </Screen>
  )
}
