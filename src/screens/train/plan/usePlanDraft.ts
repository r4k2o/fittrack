import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import type { Exercise } from '../../../db'
import { generatePlan, type PlanAnswers } from '../../../lib/planner'
import { defaultAnswers, libraryExercises } from '../../../store/plans'

/** The questionnaire answers and the plan they give; shared by New plan and onboarding. */
export function usePlanDraft() {
  const initial = useLiveQuery(() => defaultAnswers(), [])
  const library = useLiveQuery(() => libraryExercises(), [])
  const [answers, setAnswers] = useState<PlanAnswers | null>(null)
  const [variant, setVariant] = useState(0)
  useEffect(() => {
    if (initial && !answers) setAnswers(initial)
  }, [initial, answers])
  const exercises = useMemo(() => new Map<string, Exercise>((library ?? []).map((e) => [e.id, e])), [library])
  const plan = useMemo(() => (answers && library?.length ? generatePlan(answers, library, { variant }) : null), [answers, library, variant])
  return {
    answers,
    setAnswers,
    plan,
    exercises,
    regenerate: () => setVariant((v) => v + 1),
    resetVariant: () => setVariant(0),
  }
}
