import { useState } from 'react'
import { db, type Equipment, type Exercise, type Muscle, type Pattern } from '../../db'
import { fmt2 } from '../../lib/format'
import { DEFAULT_LOAD_STEP, EQUIPMENT_LABEL, exerciseSubtitle, loadStep, MUSCLE_LABEL, PATTERN_LABEL } from '../../lib/training'
import { createCustomExercise } from '../../store/training'
import { IconPlus } from '../../ui/icons'
import { Button, Field, NumberInput, Screen, Segmented, Sheet, TextInput, Toggle } from '../../ui/kit'
import { useToast } from '../../ui/toast'
import { ExercisePicker } from './ExercisePicker'

const JOINT_LABEL: Record<string, string> = { shoulder: 'shoulder', elbow: 'elbow', wrist: 'wrist', lowerBack: 'lower back', hip: 'hip', knee: 'knee' }

const selectCls = 'min-h-12 w-full rounded-2xl bg-fill px-4 outline-none focus:ring-2 focus:ring-accent'

function Detail({ ex, onClose }: { ex: Exercise; onClose: () => void }) {
  const toast = useToast()
  const [step, setStep] = useState<number | null>(loadStep(ex))
  const saveStep = async () => {
    if (step == null || step < 0) return
    await db.exercises.update(ex.id, { loadStepKg: step === DEFAULT_LOAD_STEP[ex.equipment] ? undefined : step, updatedAt: new Date().toISOString() })
    toast({ message: 'Steigerung gespeichert' })
  }
  return (
    <div className="space-y-4 pb-2">
      <p className="text-sm text-ink-2">{exerciseSubtitle(ex)}</p>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-2xl bg-fill p-3">
          <div className="text-xs font-semibold text-ink-2">Bewegung</div>
          <div className="font-semibold">{PATTERN_LABEL[ex.pattern]}</div>
        </div>
        <div className="rounded-2xl bg-fill p-3">
          <div className="text-xs font-semibold text-ink-2">Trainiert auch</div>
          <div className="font-semibold">{ex.secondary.map((m) => MUSCLE_LABEL[m]).join(', ') || '–'}</div>
        </div>
      </div>
      {ex.jointStress.length > 0 && <p className="text-sm text-ink-2">Belastet: {ex.jointStress.map((j) => JOINT_LABEL[j]).join(', ')}. Bei Schmerzen aufhören.</p>}
      <div className="flex items-end gap-2">
        <Field label="Kleinste Steigerung" hint="Kommt dazu, wenn jeder Satz das obere Ende des Wiederholungsbereichs erreicht.">
          <NumberInput value={step} unit="kg" ariaLabel="Steigerung" onChange={setStep} />
        </Field>
        <Button variant="secondary" className="mb-6" onClick={() => void saveStep()} disabled={step === loadStep(ex)}>
          Speichern
        </Button>
      </div>
      {ex.instructions && ex.instructions.length > 0 && (
        <ol className="list-decimal space-y-2 pl-5 text-[15px] leading-relaxed">
          {ex.instructions.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      )}
      {!ex.custom && <p className="text-xs text-ink-3">Anleitung auf Englisch, aus free-exercise-db (gemeinfrei).</p>}
      {ex.custom === 1 && (
        <Button
          variant="danger"
          block
          onClick={async () => {
            await db.exercises.delete(ex.id)
            onClose()
            toast({ message: `${ex.name} gelöscht`, action: { label: 'Rückgängig', onClick: () => void db.exercises.put(ex) } })
          }}
        >
          Übung löschen
        </Button>
      )}
    </div>
  )
}

function NewExercise({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [equipment, setEquipment] = useState<Equipment>('dumbbell')
  const [pattern, setPattern] = useState<Pattern>('isolation')
  const [primary, setPrimary] = useState<Muscle>('chest')
  const [compound, setCompound] = useState(false)
  const [unit, setUnit] = useState<'reps' | 'seconds'>('reps')
  const save = async () => {
    if (!name.trim()) return
    await createCustomExercise({ name: name.trim(), equipment, pattern, primary: [primary], secondary: [], jointStress: [], compound, unit, instructions: [] })
    onDone()
  }
  return (
    <div className="space-y-4 pb-2">
      <Field label="Name">
        <TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Y-Raises am Kabel" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Gerät">
          <select className={selectCls} value={equipment} onChange={(e) => setEquipment(e.target.value as Equipment)}>
            {Object.entries(EQUIPMENT_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Hauptmuskel">
          <select className={selectCls} value={primary} onChange={(e) => setPrimary(e.target.value as Muscle)}>
            {Object.entries(MUSCLE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Bewegung">
        <select
          className={selectCls}
          value={pattern}
          onChange={(e) => {
            const p = e.target.value as Pattern
            setPattern(p)
            setCompound(p !== 'isolation')
          }}
        >
          {Object.entries(PATTERN_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </Field>
      <div className="-mx-4 rounded-2xl">
        <Toggle label="Grundübung" hint="Mehrere Gelenke bewegen sich: längere Pause, weniger Wdh." checked={compound} onChange={setCompound} />
      </div>
      <Segmented
        value={unit}
        options={[
          { value: 'reps', label: 'Wiederholungen' },
          { value: 'seconds', label: 'Sekunden halten' },
        ]}
        onChange={setUnit}
      />
      <Button block size="lg" disabled={!name.trim()} onClick={() => void save()}>
        Übung speichern
      </Button>
    </div>
  )
}

export default function ExerciseLibrary() {
  const [open, setOpen] = useState<Exercise | null>(null)
  const [creating, setCreating] = useState(false)
  return (
    <Screen
      back
      title="Übungen"
      actions={
        <Button size="sm" variant="ghost" onClick={() => setCreating(true)}>
          <IconPlus size={18} /> Neu
        </Button>
      }
    >
      <ExercisePicker onPick={setOpen} />
      <Sheet open={!!open} onClose={() => setOpen(null)} title={open?.name}>
        {open && <Detail ex={open} onClose={() => setOpen(null)} />}
      </Sheet>
      <Sheet open={creating} onClose={() => setCreating(false)} title="Neue Übung">
        <NewExercise onDone={() => setCreating(false)} />
      </Sheet>
      <p className="mt-4 text-center text-xs text-ink-3">Standard-Steigerung: {Object.entries(DEFAULT_LOAD_STEP).filter(([, v]) => v > 0).map(([k, v]) => `${EQUIPMENT_LABEL[k as Equipment].toLowerCase()} ${fmt2(v)} kg`).join(', ')}.</p>
    </Screen>
  )
}
