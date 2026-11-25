// The optional language model for the plan: "explain this plan" sends the plan as JSON
// and shows the answer; "adapt it" turns a request into changed questionnaire answers,
// and the rule engine builds the new plan, so the same volume, spacing, time and
// equipment checks apply before anything is used.

import { useState } from 'react'
import { aiConfig, askText } from '../../../adapters/vision'
import type { Exercise } from '../../../db'
import { ADAPT_PROMPT, EXPLAIN_PROMPT, parseAdapt } from '../../../lib/ai'
import { EQUIPMENT_CHOICES, generatePlan, PLAN_GOALS, SPLITS, type GeneratedPlan, type PlanAnswers } from '../../../lib/planner'
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
  if (a.daysPerWeek !== b.daysPerWeek) out.push(`${b.daysPerWeek} days a week (${SPLITS[b.daysPerWeek].label.toLowerCase()})`)
  if (a.minutes !== b.minutes) out.push(`${b.minutes} minutes a session`)
  if (a.equipment !== b.equipment) out.push(EQUIPMENT_CHOICES[b.equipment].label)
  if (a.goal !== b.goal) out.push(PLAN_GOALS[b.goal].label)
  if (a.injuries.join() !== b.injuries.join()) out.push(b.injuries.length ? `avoiding ${b.injuries.join(', ')}` : 'no joints flagged')
  if (a.priority.join() !== b.priority.join()) out.push(b.priority.length ? `priority ${b.priority.map((g) => GROUP_LABEL[g]).join(' and ')}` : 'no priority muscles')
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
      if (!cfg) throw new Error('Add a key under More → Photo logging first.')
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
      if (!cfg) throw new Error('Add a key under More → Photo logging first.')
      const reply = await askText(cfg, ADAPT_PROMPT(JSON.stringify({ ...answers, weekdays: undefined }), request.trim()), true)
      let parsed: ReturnType<typeof parseAdapt>
      try {
        parsed = parseAdapt(reply, answers)
      } catch {
        throw new Error('The model suggested answers the questionnaire does not allow, so nothing changed. Try wording the request differently.')
      }
      const changes = describeChange(answers, parsed.answers)
      if (!changes.length) throw new Error(parsed.note || 'The model saw nothing to change for that request.')
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
      message: 'New plan in use',
      action: {
        label: 'Undo',
        onClick: async () => {
          await deletePlan(id)
          await reactivatePlan(previous)
        },
      },
    })
  }

  return (
    <Sheet open={open} onClose={onClose} title="Ask the model">
      <div className="space-y-4 pb-2">
        <Notice>The plan goes to your model provider as JSON. Changes are built by the app's own rules, so they pass the same volume, spacing, time and equipment checks.</Notice>
        <section>
          <Button block variant="secondary" onClick={() => void explain()} disabled={busy != null}>
            {busy === 'explain' ? <Spinner /> : <IconSparkle size={18} />} Explain this plan
          </Button>
          {explanation && <p className="mt-3 whitespace-pre-wrap rounded-[18px] bg-fill p-3 text-[15px] leading-relaxed">{explanation}</p>}
        </section>
        {answers && (
          <section>
            <p className="mb-1.5 px-1 text-[13px] font-semibold text-ink-2">Adapt it</p>
            <TextInput placeholder="e.g. a week of travel with only a hotel gym" value={request} onChange={(e) => setRequest(e.target.value)} />
            <Button block className="mt-2" onClick={() => void adapt()} disabled={busy != null || !request.trim()}>
              {busy === 'adapt' ? <Spinner /> : 'Propose a change'}
            </Button>
          </section>
        )}
        {error && <Notice tone="danger">{error}</Notice>}
        {proposal && (
          <section className="rounded-[20px] bg-fill p-3">
            <p className="text-[15px] font-semibold">{proposal.plan.name}</p>
            <p className="mt-0.5 text-[14px] text-ink-2">Changed: {proposal.changes.join('; ')}.</p>
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
                Discard
              </Button>
              <Button className="flex-1" onClick={() => void use()}>
                Use this plan
              </Button>
            </div>
          </section>
        )}
      </div>
    </Sheet>
  )
}
