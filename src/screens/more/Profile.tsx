import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { GoalType, Sex } from '../../db'
import { localDay } from '../../lib/dates'
import { fmtInt } from '../../lib/format'
import { ACTIVITY_LEVELS, calculateTargets, GOALS, type TargetInputs } from '../../lib/nutrition'
import { validateAbout, type AboutDraft } from '../../lib/validate'
import { latestMetric } from '../../store/metrics'
import { buildInputs, getActiveGoal, getProfile, saveProfileAndTargets, targetFor } from '../../store/profile'
import { Button, Field, Notice, NumberInput, Screen, SectionTitle, Segmented, TextInput } from '../../ui/kit'
import { useToast } from '../../ui/toast'

type Overrides = Pick<TargetInputs, 'goalAdjustPct' | 'proteinPerKg' | 'fatPerKg' | 'kcalOverride' | 'useLeanMass'>

export default function Profile() {
  const navigate = useNavigate()
  const toast = useToast()
  const [about, setAbout] = useState<AboutDraft | null>(null)
  const [goal, setGoal] = useState<GoalType>('maintain')
  const [activity, setActivity] = useState(1.55)
  const [overrides, setOverrides] = useState<Overrides>({ useLeanMass: false })
  const [initialGoal, setInitialGoal] = useState<GoalType | null>(null)
  const [prevKcal, setPrevKcal] = useState<number | null>(null)

  useEffect(() => {
    void (async () => {
      const [p, w, bf, g, t] = await Promise.all([getProfile(), latestMetric('weight'), latestMetric('bodyFat'), getActiveGoal(), targetFor(localDay())])
      setAbout({ sex: p?.sex ?? null, birthDate: p?.birthDate ?? '', heightCm: p?.heightCm ?? null, weightKg: w?.value ?? null, bodyFatPct: bf?.value ?? null })
      setActivity(p?.activityFactor ?? 1.55)
      setGoal(g?.type ?? 'maintain')
      setInitialGoal(g?.type ?? null)
      setPrevKcal(t?.kcal ?? null)
      if (t) {
        const i = t.inputs
        setOverrides({ goalAdjustPct: i.goalAdjustPct, proteinPerKg: i.proteinPerKg, fatPerKg: i.fatPerKg, kcalOverride: i.kcalOverride, useLeanMass: i.useLeanMass })
      }
    })()
  }, [])

  if (!about) return null
  const check = validateAbout(about)
  const goalChanged = initialGoal != null && goal !== initialGoal
  // a new goal resets the goal's calorie shift; protein and fat set by hand stay
  const effective: Overrides = goalChanged ? { ...overrides, goalAdjustPct: undefined } : overrides
  const inputs = check.ok
    ? buildInputs({ sex: about.sex as Sex, birthDate: about.birthDate, heightCm: about.heightCm as number, weightKg: about.weightKg as number, bodyFatPct: about.bodyFatPct }, activity, goal, effective)
    : null
  const preview = inputs ? calculateTargets(inputs) : null

  const save = async () => {
    if (!inputs || !check.ok) return
    await saveProfileAndTargets({ sex: about.sex as Sex, birthDate: about.birthDate, heightCm: about.heightCm as number, weightKg: about.weightKg as number, bodyFatPct: about.bodyFatPct }, inputs)
    toast({ message: 'Profil gespeichert, Ziele ab heute neu berechnet' })
    navigate(-1)
  }

  return (
    <Screen back title="Profil und Ziel">
      <div className="space-y-4 pt-2">
        <Field group label="Geschlecht" error={check.errors.sex}>
          <Segmented
            value={about.sex ?? ('' as Sex)}
            options={[
              { value: 'male' as Sex, label: 'Männlich' },
              { value: 'female' as Sex, label: 'Weiblich' },
            ]}
            onChange={(sex) => setAbout({ ...about, sex })}
          />
        </Field>
        <Field label="Geburtsdatum" error={check.errors.birthDate}>
          <TextInput type="date" value={about.birthDate} max={localDay()} onChange={(e) => setAbout({ ...about, birthDate: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Größe" error={check.errors.heightCm}>
            <NumberInput value={about.heightCm} unit="cm" ariaLabel="Größe" onChange={(heightCm) => setAbout({ ...about, heightCm })} />
          </Field>
          <Field label="Aktuelles Gewicht" error={check.errors.weightKg}>
            <NumberInput value={about.weightKg} unit="kg" ariaLabel="Aktuelles Gewicht" onChange={(weightKg) => setAbout({ ...about, weightKg })} />
          </Field>
        </div>
        <Field label="Körperfett (optional)" error={check.errors.bodyFatPct}>
          <NumberInput value={about.bodyFatPct} unit="%" ariaLabel="Körperfett" onChange={(bodyFatPct) => setAbout({ ...about, bodyFatPct })} />
        </Field>

        <SectionTitle>Ziel</SectionTitle>
        <Segmented value={goal} options={(Object.keys(GOALS) as GoalType[]).map((g) => ({ value: g, label: GOALS[g].label }))} onChange={setGoal} />
        <p className="px-1 text-sm text-ink-2">{GOALS[goal].blurb}</p>

        <SectionTitle>Aktivität inklusive Training</SectionTitle>
        <div className="card overflow-hidden">
          {ACTIVITY_LEVELS.map((l) => (
            <label key={l.factor} className="flex min-h-14 cursor-pointer items-center gap-3 border-t border-line px-4 py-2 first:border-t-0">
              <input type="radio" name="activity" className="size-5 accent-[var(--brand)]" checked={Math.abs(activity - l.factor) < 0.001} onChange={() => setActivity(l.factor)} />
              <span>
                <span className="block font-semibold">{l.label}</span>
                <span className="block text-sm text-ink-2">{l.detail}</span>
              </span>
            </label>
          ))}
        </div>
        {!ACTIVITY_LEVELS.some((l) => Math.abs(activity - l.factor) < 0.001) && <p className="px-1 text-sm text-ink-2">Dein Faktor {String(activity).replace('.', ',')} wurde mit dem Regler unter Ziele gesetzt.</p>}

        {preview && (
          <Notice>
            Neue Ziele ab heute: <b>{fmtInt(preview.kcal)} kcal</b>, Eiweiß {preview.proteinG} g, Kohlenhydrate {preview.carbsG} g, Fett {preview.fatG} g
            {prevKcal != null && prevKcal !== preview.kcal ? ` (bisher ${fmtInt(prevKcal)} kcal)` : ''}. Frühere Tage behalten ihre Ziele.
          </Notice>
        )}
        <Button block size="lg" disabled={!check.ok} onClick={() => void save()}>
          Speichern
        </Button>
        <Button block variant="ghost" onClick={() => navigate('/more/targets')}>
          Ziele feinjustieren
        </Button>
      </div>
    </Screen>
  )
}
