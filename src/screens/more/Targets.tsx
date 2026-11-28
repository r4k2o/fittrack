import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Sex } from '../../db'
import { ageOn, formatDate, localDay } from '../../lib/dates'
import { fmt1 } from '../../lib/format'
import type { TargetInputs } from '../../lib/nutrition'
import { latestMetric } from '../../store/metrics'
import { getProfile, saveProfileAndTargets, targetFor } from '../../store/profile'
import { Button, EmptyState, Notice, Screen } from '../../ui/kit'
import { useToast } from '../../ui/toast'
import { TargetsEditor } from '../shared/TargetsEditor'

export default function Targets() {
  const navigate = useNavigate()
  const toast = useToast()
  const [inputs, setInputs] = useState<TargetInputs | null>(null)
  const [saved, setSaved] = useState<{ from: string; weightKg: number } | null>(null)
  const [about, setAbout] = useState<{ sex: Sex; birthDate: string; heightCm: number; bodyFatPct: number | null } | null>(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    void (async () => {
      const today = localDay()
      const [p, t, w, bf] = await Promise.all([getProfile(), targetFor(today), latestMetric('weight'), latestMetric('bodyFat')])
      if (!p || !t || !w) {
        setMissing(true)
        return
      }
      setAbout({ sex: p.sex, birthDate: p.birthDate, heightCm: p.heightCm, bodyFatPct: bf?.value ?? null })
      setSaved({ from: t.effectiveFrom, weightKg: t.inputs.weightKg })
      // recalculate with today's age, height and latest weight; keep everything set by hand
      setInputs({ ...t.inputs, sex: p.sex, heightCm: p.heightCm, ageYears: ageOn(p.birthDate, today), weightKg: w.value, bodyFatPct: bf?.value ?? null, activityFactor: p.activityFactor })
    })()
  }, [])

  if (missing)
    return (
      <Screen back title="Ziele">
        <EmptyState title="Noch keine Ziele">Füll zuerst dein Profil aus.</EmptyState>
      </Screen>
    )
  if (!inputs || !about || !saved) return null

  const save = async () => {
    await saveProfileAndTargets({ ...about, weightKg: inputs.weightKg }, inputs)
    toast({ message: 'Ziele ab heute gespeichert' })
    navigate(-1)
  }

  return (
    <Screen back title="Kalorien und Makros" subtitle={`Gültig seit ${formatDate(saved.from)}`}>
      <div className="space-y-4 pt-2">
        {Math.abs(saved.weightKg - inputs.weightKg) >= 0.1 && (
          <Notice>
            Dein Gewicht hat sich seit diesen Zielen geändert ({fmt1(saved.weightKg)} → {fmt1(inputs.weightKg)} kg). Die Zahlen unten nutzen das neue Gewicht; speichern übernimmt sie.
          </Notice>
        )}
        <TargetsEditor inputs={inputs} onChange={setInputs} defaultOpen />
        <Button block size="lg" onClick={() => void save()}>
          Ziele speichern
        </Button>
        <p className="pb-4 text-center text-sm text-ink-2">Speichern gilt ab heute. Diagramme vergleichen jeden Tag mit dem Ziel, das an dem Tag galt.</p>
      </div>
    </Screen>
  )
}
