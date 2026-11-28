// The optional language model for the plan: "explain this plan" sends the plan as JSON
// and shows the answer; "adapt it" turns a request into changed questionnaire answers,
// and the rule engine builds the new plan, so the same volume, spacing, time and
// equipment checks apply before anything is used.

import { useState } from 'react'
import { aiConfig, askText } from '../../../adapters/vision'
import type { Exercise } from '../../../db'
import { ADAPT_PROMPT, EXPLAIN_PROMPT, parseAdapt } from '../../../lib/ai'
import { EQUIPMENT_CHOICES, generatePlan, JOINT_LABEL, PLAN_GOALS, splitFor, type GeneratedPlan, type PlanAnswers } from '../../../lib/planner'
import { GROUP_LABEL, GROUPS, volumeOf } from '../../../lib/volume'
import { adoptPlan, deletePlan, reactivatePlan, type PlanBundle } from '../../../store/plans'
import { IconSparkle } from '../../../ui/icons'
import { Button, Notice, Sheet, Spinner, TextInput } from '../../../ui/kit'
import { haptic } from '../../../ui/motion'
import { useToast } from '../../../ui/toast'
import { VolumeBars } from './VolumeBars'

function planJson(bundle: PlanBundle, exercises: ReadonlyMap<string, Exercise>): string {
  const rows = bundle.days.flatMap((d) => d.exercises)
  const volume = volumeOf(rows.map((x) => ({ exercise: exercises.get(x.exerciseId), sets: x.sets })))
  return JSON.stringify({
    name: bundle.plan.name,
    days: bundle.days.map((d) => ({
      name: d.name,
      weekday: d.weekday,
      exercises: d.exercises.map((x) => ({ name: exercises.get(x.exerciseId)?.name, sets: x.sets, reps: `${x.repMin}-${x.repMax}`, restSec: x.restSec, superset: !!x.supersetWith })),
    })),
    weeklyHardSets: Object.fromEntries(GROUPS.map((g) => [g, volume[g]])),
  })
}

function describeChange(a: PlanAnswers, b: PlanAnswers): string[] {
  const out: string[] = []
  if (a.daysPerWeek !== b.daysPerWeek) out.push(`${b.daysPerWeek} Tage pro Woche (${splitFor(b).label})`)
  if (a.minutes !== b.minutes) out.push(`${b.minutes} Minuten pro Einheit`)
  if (a.equipment !== b.equipment) out.push(EQUIPMENT_CHOICES[b.equipment].label)
  if (a.goal !== b.goal) out.push(PLAN_GOALS[b.goal].label)
  if (a.injuries.join() !== b.injuries.join()) out.push(b.injuries.length ? `schont ${b.injuries.map((j) => JOINT_LABEL[j]).join(', ')}` : 'keine Gelenke geschont')
  if (a.priority.join() !== b.priority.join()) out.push(b.priority.length ? `Schwerpunkt ${b.priority.map((g) => GROUP_LABEL[g]).join(' und ')}` : 'keine Schwerpunkte')
  return out
}

export function PlanAssistant({
  open,
  onClose,
  bundle,
  answers,
  exercises,
  library,
}: {
  open: boolean
  onClose: () => void
  bundle: PlanBundle
  answers: PlanAnswers | null
  exercises: ReadonlyMap<string, Exercise>
  library: readonly Exercise[]
}) {
  const toast = useToast()
  const [busy, setBusy] = useState<'explain' | 'adapt' | null>(null)
  const [explanation, setExplanation] = useState<string | null>(null)
  const [request, setRequest] = useState('')
  const [proposal, setProposal] = useState<{ plan: GeneratedPlan; note: string; changes: string[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const explain = async () => {
    setError(null)
    setBusy('explain')
    try {
      const cfg = await aiConfig()
      if (!cfg) throw new Error('Trag zuerst unter Mehr → Foto-Erfassung einen Schlüssel ein.')
      setExplanation((await askText(cfg, EXPLAIN_PROMPT(planJson(bundle, exercises)))).trim())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const adapt = async () => {
    if (!answers || !request.trim()) return
    setError(null)
    setProposal(null)
    setBusy('adapt')
    try {
      const cfg = await aiConfig()
      if (!cfg) throw new Error('Trag zuerst unter Mehr → Foto-Erfassung einen Schlüssel ein.')
      const reply = await askText(cfg, ADAPT_PROMPT(JSON.stringify({ ...answers, weekdays: undefined }), request.trim()), true)
      let parsed: ReturnType<typeof parseAdapt>
      try {
        parsed = parseAdapt(reply, answers)
      } catch {
        throw new Error('Das Modell hat Antworten vorgeschlagen, die der Fragebogen nicht kennt. Nichts geändert; formulier die Bitte anders.')
      }
      const changes = describeChange(answers, parsed.answers)
      if (!changes.length) throw new Error(parsed.note || 'Das Modell sah für diese Bitte nichts zu ändern.')
      setProposal({ plan: generatePlan(parsed.answers, library), note: parsed.note, changes })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const use = async () => {
    if (!proposal) return
    const previous = bundle.plan.id
    const id = await adoptPlan(proposal.plan)
    haptic('success')
    setProposal(null)
    setRequest('')
    onClose()
    toast({
      message: 'Neuer Plan aktiv',
      action: {
        label: 'Rückgängig',
        onClick: async () => {
          await deletePlan(id)
          await reactivatePlan(previous)
        },
      },
    })
  }

  return (
    <Sheet open={open} onClose={onClose} title="KI fragen">
      <div className="space-y-4 pb-2">
        <Notice>Der Plan geht als JSON an deinen KI-Anbieter. Änderungen baut die App mit ihren eigenen Regeln, also mit denselben Prüfungen für Sätze, Abstände, Zeit und Geräte.</Notice>
        <section>
          <Button block variant="secondary" onClick={() => void explain()} disabled={busy != null}>
            {busy === 'explain' ? <Spinner /> : <IconSparkle size={18} />} Plan erklären
          </Button>
          {explanation && <p className="mt-3 whitespace-pre-wrap rounded-[18px] bg-fill p-3 text-[15px] leading-relaxed">{explanation}</p>}
        </section>
        {answers && (
          <section>
            <p className="mb-1.5 px-1 text-[13px] font-semibold text-ink-2">Anpassen</p>
            <TextInput placeholder="z. B. eine Woche Urlaub, nur Hotel-Gym" value={request} onChange={(e) => setRequest(e.target.value)} />
            <Button block className="mt-2" onClick={() => void adapt()} disabled={busy != null || !request.trim()}>
              {busy === 'adapt' ? <Spinner /> : 'Änderung vorschlagen'}
            </Button>
          </section>
        )}
        {error && <Notice tone="danger">{error}</Notice>}
        {proposal && (
          <section className="rounded-[20px] bg-fill p-3">
            <p className="text-[15px] font-semibold">{proposal.plan.name}</p>
            <p className="mt-0.5 text-[14px] text-ink-2">Geändert: {proposal.changes.join('; ')}.</p>
            {proposal.note && <p className="mt-1 text-[14px] text-ink-2">{proposal.note}</p>}
            <div className="mt-3">
              <VolumeBars volume={proposal.plan.volume} targets={proposal.plan.targets} />
            </div>
            {proposal.plan.notes
              .filter((n) => n.kind !== 'superset')
              .slice(0, 4)
              .map((n) => (
                <p key={n.text} className="mt-2 text-[13px] text-ink-2">
                  {n.text}
                </p>
              ))}
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" onClick={() => setProposal(null)}>
                Verwerfen
              </Button>
              <Button className="flex-1" onClick={() => void use()}>
                Plan übernehmen
              </Button>
            </div>
          </section>
        )}
      </div>
    </Sheet>
  )
}
