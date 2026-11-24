// Questionnaire, then preview: "Use this plan" saves it as the active plan,
// "Regenerate" offers a different mix of exercises for the same answers.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adoptPlan } from '../../../store/plans'
import { IconRepeat } from '../../../ui/icons'
import { Button, Screen, Spinner, StickyFooter } from '../../../ui/kit'
import { haptic } from '../../../ui/motion'
import { useToast } from '../../../ui/toast'
import { PlanPreview } from './PlanPreview'
import { PlanQuestions } from './PlanQuestions'
import { usePlanDraft } from './usePlanDraft'

export default function NewPlan() {
  const navigate = useNavigate()
  const toast = useToast()
  const draft = usePlanDraft()
  const [step, setStep] = useState<'questions' | 'preview'>('questions')
  const [saving, setSaving] = useState(false)

  const use = async () => {
    if (!draft.plan) return
    setSaving(true)
    await adoptPlan(draft.plan)
    haptic('success')
    toast({ message: 'Plan saved. Your week is on Train.' })
    navigate('/train', { replace: true })
  }

  return (
    <Screen
      tone="train"
      back={step === 'preview' ? undefined : '/train'}
      title={step === 'questions' ? 'New plan' : 'Your plan'}
      subtitle={step === 'questions' ? 'Seven questions, about a minute' : undefined}
      large={false}
      actions={
        step === 'preview' ? (
          <Button size="sm" variant="glass" onClick={() => setStep('questions')}>
            Change answers
          </Button>
        ) : undefined
      }
      bottomPad={false}
      className="pb-[calc(env(safe-area-inset-bottom)+7rem)]"
    >
      {!draft.answers ? (
        <div className="flex justify-center py-16 text-ink-2">
          <Spinner />
        </div>
      ) : step === 'questions' ? (
        <>
          <p className="mb-3 px-1 text-[15px] text-ink-2">The plan follows published rules for weekly sets, rest and exercise choice. You can edit everything afterwards.</p>
          <PlanQuestions value={draft.answers} onChange={(a) => draft.setAnswers(a)} />
          <StickyFooter>
            <Button
              block
              size="lg"
              disabled={!draft.plan}
              onClick={() => {
                haptic()
                draft.resetVariant()
                setStep('preview')
                window.scrollTo({ top: 0 })
              }}
            >
              Build my plan
            </Button>
          </StickyFooter>
        </>
      ) : draft.plan ? (
        <>
          <PlanPreview plan={draft.plan} exercises={draft.exercises} />
          <StickyFooter>
            <Button
              size="lg"
              variant="secondary"
              aria-label="Regenerate with other exercises"
              onClick={() => {
                haptic()
                draft.regenerate()
              }}
            >
              <IconRepeat size={19} /> Regenerate
            </Button>
            <Button size="lg" className="flex-1" disabled={saving} onClick={() => void use()}>
              Use this plan
            </Button>
          </StickyFooter>
        </>
      ) : null}
    </Screen>
  )
}
