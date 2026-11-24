// Onboarding: install and welcome, about you, goal and activity, targets.
// One decision per screen, progress dots, Back everywhere, no account, no email,
// no "calculating" interstitials. Training questions follow in phase 2.

import { useState } from 'react'
import type { GoalType, Sex } from '../../db'
import { isIos, isStandalone } from '../../hooks'
import { DISCLAIMER } from '../../lib/copy'
import { ageOn, localDay } from '../../lib/dates'
import { validateAbout, type AboutDraft } from '../../lib/validate'
import { ACTIVITY_LEVELS, GOALS, type TargetInputs } from '../../lib/nutrition'
import { buildInputs, completeOnboarding, saveProfileAndTargets, type AboutYou } from '../../store/profile'
import { IconCheck, IconChevronLeft, IconPhone, IconPlus, IconShare } from '../../ui/icons'
import { Button, cx, Dots, Field, IconButton, Notice, NumberInput, Segmented, TextInput } from '../../ui/kit'
import { TargetsEditor } from '../shared/TargetsEditor'

type Overrides = Pick<TargetInputs, 'goalAdjustPct' | 'proteinPerKg' | 'fatPerKg' | 'kcalOverride' | 'useLeanMass'>

function InstallCard() {
  return (
    <div className="flex min-h-dvh flex-col justify-center px-6 pb-10 pt-[env(safe-area-inset-top)]">
      <div className="mx-auto w-full max-w-sm rounded-3xl bg-surface p-6">
        <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <IconPhone size={28} />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Install Fittrack first</h1>
        <ol className="mt-5 space-y-4 text-[15px]">
          <li className="flex gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sunken text-sm font-bold">1</span>
            <span>
              Tap <IconShare size={18} className="inline -translate-y-0.5 text-accent" /> <b>Share</b> in Safari's toolbar.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sunken text-sm font-bold">2</span>
            <span>
              Choose <IconPlus size={18} className="inline -translate-y-0.5" /> <b>Add to Home Screen</b>. On iOS 26 and later, leave "Open as Web App" on.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sunken text-sm font-bold">3</span>
            <span>Open Fittrack from its new icon and start there.</span>
          </li>
        </ol>
        <p className="mt-5 text-sm text-muted">Your data lives in the installed app, which keeps its own storage, separate from Safari's.</p>
      </div>
    </div>
  )
}

export default function Onboarding() {
  const [step, setStep] = useState(0)
  const [adult, setAdult] = useState(false)
  const [about, setAbout] = useState<AboutDraft>({ sex: null, birthDate: '', heightCm: null, weightKg: null, bodyFatPct: null })
  const [goal, setGoal] = useState<GoalType>('bulk')
  const [activity, setActivity] = useState(1.55)
  const [overrides, setOverrides] = useState<Overrides>({ useLeanMass: false })
  const [showErrors, setShowErrors] = useState(false)
  const [saving, setSaving] = useState(false)

  if (isIos() && !isStandalone()) return <InstallCard />

  const check = validateAbout(about)
  const aboutYou: AboutYou | null = check.ok
    ? { sex: about.sex as Sex, birthDate: about.birthDate, heightCm: about.heightCm as number, weightKg: about.weightKg as number, bodyFatPct: about.bodyFatPct }
    : null
  const inputs = aboutYou ? buildInputs(aboutYou, activity, goal, overrides) : null

  const next = () => {
    if (step === 1 && !check.ok) {
      setShowErrors(true)
      return
    }
    setStep(step + 1)
    window.scrollTo(0, 0)
  }

  const finish = async () => {
    if (!aboutYou || !inputs) return
    setSaving(true)
    await saveProfileAndTargets(aboutYou, inputs)
    // the app shell moves on to Today once it reads the saved flag back
    await completeOnboarding(new Date().toISOString())
  }

  const footer = (
    <div className="fixed inset-x-0 bottom-0 z-20 bg-canvas/95 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 backdrop-blur-md">
      <div className="mx-auto max-w-xl">
        {step === 0 && (
          <Button block size="lg" disabled={!adult} onClick={next}>
            Start
          </Button>
        )}
        {(step === 1 || step === 2) && (
          <Button block size="lg" onClick={next}>
            Continue
          </Button>
        )}
        {step === 3 && (
          <Button block size="lg" disabled={saving} onClick={finish}>
            Save targets and start
          </Button>
        )}
      </div>
    </div>
  )

  return (
    <div className="mx-auto min-h-dvh max-w-xl px-4 pb-32 pt-[env(safe-area-inset-top)]">
      <div className="flex min-h-14 items-center">
        {step > 0 ? (
          <IconButton label="Back" onClick={() => setStep(step - 1)}>
            <IconChevronLeft />
          </IconButton>
        ) : (
          <span className="size-11" />
        )}
        <div className="flex-1">
          <Dots count={4} active={step} />
        </div>
        <span className="size-11" />
      </div>

      {step === 0 && (
        <section className="pt-6">
          <img src={`${import.meta.env.BASE_URL}pwa-192.png`} alt="" className="size-16 rounded-2xl" />
          <h1 className="mt-5 text-3xl font-bold tracking-tight">Fittrack</h1>
          <p className="mt-2 text-lg text-muted">A private logbook for food, training and body weight.</p>
          <div className="mt-6 flex items-center gap-3 rounded-2xl bg-accent-soft px-4 py-3 font-semibold text-accent">
            <IconCheck size={20} />
            Your data stays on this phone.
          </div>
          {!isStandalone() && (
            <Notice className="mt-3">Installing to the Home Screen protects your data from browser clean-up. On an iPhone, open this page in Safari and use Share → Add to Home Screen.</Notice>
          )}
          <div className="mt-6 rounded-2xl bg-surface p-4 text-sm leading-relaxed text-muted">{DISCLAIMER}</div>
          <label className="mt-4 flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl bg-surface px-4">
            <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="size-6 accent-[var(--accent)]" />
            <span className="font-medium">I am 18 or older and have read this notice</span>
          </label>
        </section>
      )}

      {step === 1 && (
        <section className="space-y-5 pt-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">About you</h1>
            <p className="mt-1 text-muted">These go into the energy equation. Metric units.</p>
          </div>
          <Field group label="Sex" hint="The equation differs for men and women." error={showErrors && check.errors.sex}>
            <Segmented
              value={about.sex ?? ('' as Sex)}
              options={[
                { value: 'male' as Sex, label: 'Male' },
                { value: 'female' as Sex, label: 'Female' },
              ]}
              onChange={(sex) => setAbout({ ...about, sex })}
            />
          </Field>
          <Field label="Birth date" error={showErrors && check.errors.birthDate}>
            <TextInput type="date" value={about.birthDate} max={localDay()} onChange={(e) => setAbout({ ...about, birthDate: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Height" error={showErrors && check.errors.heightCm}>
              <NumberInput value={about.heightCm} unit="cm" ariaLabel="Height" onChange={(heightCm) => setAbout({ ...about, heightCm })} />
            </Field>
            <Field label="Weight" error={showErrors && check.errors.weightKg}>
              <NumberInput value={about.weightKg} unit="kg" ariaLabel="Weight" onChange={(weightKg) => setAbout({ ...about, weightKg })} />
            </Field>
          </div>
          <Field label="Body fat (optional)" hint="Lets you use the lean-mass equation." error={showErrors && check.errors.bodyFatPct}>
            <NumberInput value={about.bodyFatPct} unit="%" ariaLabel="Body fat" onChange={(bodyFatPct) => setAbout({ ...about, bodyFatPct })} />
          </Field>
          {about.birthDate && ageOn(about.birthDate, localDay()) < 18 && (
            <Notice tone="warn">Under 18 the app sets no deficit target. Please talk to a doctor or dietitian before changing how you eat.</Notice>
          )}
        </section>
      )}

      {step === 2 && (
        <section className="space-y-6 pt-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Goal and activity</h1>
            <p className="mt-1 text-muted">You can change both later under More.</p>
          </div>
          <div className="space-y-2" role="radiogroup" aria-label="Goal">
            {(Object.keys(GOALS) as GoalType[]).map((g) => (
              <button
                key={g}
                type="button"
                role="radio"
                aria-checked={goal === g}
                onClick={() => {
                  setGoal(g)
                  setOverrides({ ...overrides, goalAdjustPct: undefined })
                }}
                className={cx('block w-full rounded-3xl border-2 bg-surface p-4 text-left transition', goal === g ? 'border-accent' : 'border-transparent')}
              >
                <span className="flex items-center justify-between">
                  <span className="text-lg font-bold">{GOALS[g].label}</span>
                  {goal === g && <IconCheck className="text-accent" />}
                </span>
                <span className="mt-0.5 block text-sm text-muted">{GOALS[g].blurb}</span>
              </button>
            ))}
          </div>
          <div>
            <h2 className="mb-2 font-semibold">How active are you, training included?</h2>
            <div className="divide-y divide-line overflow-hidden rounded-3xl bg-surface" role="radiogroup" aria-label="Activity">
              {ACTIVITY_LEVELS.map((l) => (
                <button
                  key={l.factor}
                  type="button"
                  role="radio"
                  aria-checked={activity === l.factor}
                  onClick={() => setActivity(l.factor)}
                  className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left active:bg-sunken"
                >
                  <span className={cx('flex size-6 shrink-0 items-center justify-center rounded-full border-2', activity === l.factor ? 'border-accent bg-accent text-accent-ink' : 'border-line')}>
                    {activity === l.factor && <IconCheck size={14} strokeWidth={3} />}
                  </span>
                  <span>
                    <span className="block font-semibold">{l.label}</span>
                    <span className="block text-sm text-muted">{l.detail}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {step === 3 && inputs && (
        <section className="space-y-4 pt-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Your targets</h1>
            <p className="mt-1 text-muted">Every number can be changed, now or later.</p>
          </div>
          <TargetsEditor
            inputs={inputs}
            onChange={(i) => {
              setActivity(i.activityFactor)
              setOverrides({ goalAdjustPct: i.goalAdjustPct, proteinPerKg: i.proteinPerKg, fatPerKg: i.fatPerKg, kcalOverride: i.kcalOverride, useLeanMass: i.useLeanMass })
            }}
          />
        </section>
      )}

      {footer}
    </div>
  )
}
