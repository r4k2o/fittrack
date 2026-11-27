import { describe, expect, it } from 'vitest'
import { addDays } from './dates'
import type { TargetInputs } from './nutrition'
import { adaptiveProposal, kcalCorrection, rateStatus, weeklyReview } from './review'
import { emptyVolume } from './volume'

/** The plan's worked example: a man of 80 kg, 180 cm and 25 years, factor 1.55, lean bulk. */
function buildInputsFor(): TargetInputs {
  return { sex: 'male', ageYears: 25, heightCm: 180, weightKg: 80, bodyFatPct: null, useLeanMass: false, activityFactor: 1.55, goal: 'bulk' }
}

/** A straight trend from `start` kg changing by `perWeek` kg a week, daily for `days` days. */
function trend(end: string, days: number, start: number, perWeek: number) {
  return Array.from({ length: days }, (_, i) => ({ date: addDays(end, i - days + 1), value: start + (perWeek / 7) * i }))
}

describe('weekly review', () => {
  it('reduces calories toward the band edge when the gain is too fast', () => {
    // 0.7% a week at 80 kg is above the lean-bulk band of 0.25–0.5%
    expect(kcalCorrection(0.7, [0.25, 0.5], 80)).toBe(-150)
    expect(kcalCorrection(-1.3, [-1, -0.5], 80)).toBe(250)
    expect(kcalCorrection(0.4, [0.25, 0.5], 80)).toBe(0)
  })

  it('names the rate, the band and one suggestion', () => {
    const r = weeklyReview({
      week: '2026-11-16',
      trend: trend('2026-11-22', 28, 79, 0.56),
      goal: 'bulk',
      adherence: { logged: 6, onTarget: 4 },
      sets: { ...emptyVolume(), chest: 12, back: 12, shoulders: 12, quads: 12, hamstrings: 12, glutes: 12, biceps: 12, triceps: 12, calves: 12, abs: 12 },
      sleepMin: [
        { date: '2026-11-16', value: 420 },
        { date: '2026-11-17', value: 450 },
      ],
      steps: [{ date: '2026-11-16', value: 9000 }],
      cardioMin: 60,
    })
    expect(r.rate).toBeCloseTo(0.69, 1)
    expect(r.status).toBe('fast') // over the 0.5% a week guardrail for gains
    expect(r.weightChangeKg).toBeCloseTo(0.56, 2)
    expect(r.avgSleepMin).toBe(435)
    expect(r.suggestion?.kcalDelta).toBe(-150)
    expect(r.suggestion?.text).toBe('Zunahme im Trend: 0,7 % pro Woche, über dem Ziel von 0,25 % bis 0,5 %. 150 kcal am Tag weniger?')
  })

  it('falls back to the least-trained group when the weight is on track', () => {
    const r = weeklyReview({
      week: '2026-11-16',
      trend: trend('2026-11-22', 28, 80, 0.3),
      goal: 'bulk',
      adherence: null,
      sets: { ...emptyVolume(), chest: 6, back: 12, shoulders: 12, quads: 12, hamstrings: 12, glutes: 12, biceps: 12, triceps: 12, calves: 8, abs: 12 },
      sleepMin: [],
      steps: [],
      cardioMin: 0,
    })
    expect(r.status).toBe('on')
    expect(r.suggestion?.text).toMatch(/^Brust: nur 6 harte Sätze, unter 10/)
  })

  it('flags a rate faster than the guardrails', () => {
    expect(rateStatus(-1.2, [-1, -0.5])).toBe('fast')
    expect(rateStatus(0.3, null)).toBeNull()
  })
})

describe('target correction from real data', () => {
  const inputs = buildInputsFor()
  it('proposes new targets when measured expenditure differs by more than 5%', () => {
    // Formula maintenance for the worked example is 2,798 kcal; measured 2,680 is −4.2%: no proposal.
    expect(adaptiveProposal(2680, inputs)).toBeNull()
    const p = adaptiveProposal(2600, inputs, 80.4)!
    expect(p.currentKcal).toBe(2798)
    expect(p.diffPct).toBeCloseTo(-7.08, 1)
    expect(p.result.method).toBe('adaptive')
    expect(p.result.maintenanceKcal).toBe(2600)
    expect(p.result.kcal).toBe(2860) // lean bulk +10%
    expect(p.inputs.weightKg).toBe(80.4)
  })
  it('compares later estimates with the measured maintenance in use', () => {
    const measured = { ...inputs, maintenanceOverride: 2600 }
    expect(adaptiveProposal(2650, measured)).toBeNull()
    expect(adaptiveProposal(2800, measured)?.result.maintenanceKcal).toBe(2800)
  })
})
