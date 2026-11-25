// Onboarding, seven short screens: install and welcome, about you, goal and activity,
// targets, training questions (skippable), plan preview and optional extras.
// One decision per screen, progress dots, Back everywhere, no account, no email,
// no "calculating" interstitials.

import { useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { adoptPlan } from '../../store/plans'
import { PlanPreview } from '../train/plan/PlanPreview'
import { PlanQuestions } from '../train/plan/PlanQuestions'
import { usePlanDraft } from '../train/plan/usePlanDraft'
import type { GoalType, Sex } from '../../db'
import { isIos, isStandalone } from '../../hooks'
import { DISCLAIMER } from '../../lib/copy'
import { ageOn, localDay } from '../../lib/dates'
import { ACTIVITY_LEVELS, GOALS, type TargetInputs } from '../../lib/nutrition'
import { validateAbout, type AboutDraft } from '../../lib/validate'
import { buildInputs, completeOnboarding, saveProfileAndTargets, type AboutYou } from '../../store/profile'
import { IconCamera, IconCheck, IconChevronDown, IconChevronLeft, IconHeart, IconLock, IconPhone, IconPlus, IconRepeat, IconShare, IconShield, IconTrendDown, IconTrendFlat, IconTrendUp, IconWifiOff, IconZap } from '../../ui/icons'
import { Button, cx, Dots, Field, Group, IconButton, IconTile, ListRow, Notice, NumberInput, Segmented, Spinner, TextInput } from '../../ui/kit'
import { haptic } from '../../ui/motion'
import { TargetsEditor } from '../shared/TargetsEditor'

type Overrides = Pick<TargetInputs, 'goalAdjustPct' | 'proteinPerKg' | 'fatPerKg' | 'kcalOverride' | 'useLeanMass'>

function InstallCard() {
  const steps = [
    {
      icon: <IconShare size={18} />,
      text: (
        <>
          Tap <b>Share</b> in Safari's toolbar.
        </>
      ),
    },
    {
      icon: <IconPlus size={18} />,
      text: (
        <>
          Choose <b>Add to Home Screen</b>. On iOS 26 and later, leave "Open as Web App" on.
        </>
      ),
    },
    { icon: <IconPhone size={18} />, text: <>Open Fittrack from its new icon and start there.</> },
  ]
  return (
    <div className="tone-brand relative flex min-h-dvh flex-col justify-center px-5 pb-10 pt-[env(safe-area-inset-top)]">
      <div aria-hidden className="ambient pointer-events-none fixed inset-0 -z-10" />
      <img src={`${import.meta.env.BASE_URL}pwa-192.png`} alt="" className="mx-auto size-20 rounded-[22px] shadow-float" />
      <h1 className="mt-6 text-center text-title">Install Fittrack</h1>
      <p className="mt-2 text-center text-[16px] text-ink-2">It runs from your Home Screen, like any app.</p>
      <div className="card mx-auto mt-8 w-full max-w-sm space-y-4 p-5">
        {steps.map((s, i) => (
          <div key={i} className="flex items-start gap-3">
            <IconTile tone="brand" size={34}>
              {s.icon}
            </IconTile>
            <p className="pt-1.5 text-[15px] leading-snug">{s.text}</p>
          </div>
        ))}
      </div>
      <p className="mx-auto mt-5 max-w-sm text-center text-[13px] text-ink-2">Your data lives in the installed app, which keeps its own storage, separate from Safari's.</p>
    </div>
  )
}

const FEATURES = [
  { icon: <IconLock size={18} />, tone: 'brand' as const, title: 'Private by design', text: 'No account. Everything stays on this phone.' },
  { icon: <IconWifiOff size={18} />, tone: 'indigo' as const, title: 'Works offline', text: 'Log at the gym or in the shop without signal.' },
  { icon: <IconZap size={18} />, tone: 'amber' as const, title: 'Fast logging', text: 'Repeat a meal in one tap; sets start from last time.' },
]

const GOAL_ICON: Record<GoalType, { icon: typeof IconTrendUp; tone: 'brand' | 'indigo' | 'food' }> = {
  bulk: { icon: IconTrendUp, tone: 'brand' },
  maintain: { icon: IconTrendFlat, tone: 'indigo' },
  cut: { icon: IconTrendDown, tone: 'food' },
}

function Intensity({ level }: { level: number }) {
  return (
    <span className="flex h-5 items-end gap-[3px]" aria-hidden>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={cx('w-1.5 rounded-full', i <= level ? 'bg-brand' : 'bg-fill-strong')} style={{ height: 4 + i * 3 }} />
      ))}
    </span>
  )
}

const STEPS = 7

export default function Onboarding() {
  const navigate = useNavigate()
  const draft = usePlanDraft()
  const [step, setStep] = useState(0)
  const [planSaved, setPlanSaved] = useState(false)
  const [adult, setAdult] = useState(false)
  const [about, setAbout] = useState<AboutDraft>({ sex: null, birthDate: '', heightCm: null, weightKg: null, bodyFatPct: null })
  const [goal, setGoal] = useState<GoalType>('bulk')
  const [activity, setActivity] = useState(1.55)
  const [overrides, setOverrides] = useState<Overrides>({ useLeanMass: false })
  const [showErrors, setShowErrors] = useState(false)
  const [saving, setSaving] = useState(false)
  const [noticeOpen, setNoticeOpen] = useState(false)

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
    haptic()
    setStep(step + 1)
    window.scrollTo(0, 0)
  }

  const go = (n: number) => {
    haptic()
    setStep(n)
    window.scrollTo(0, 0)
  }

  /** Saves the targets, then moves on to the training questions with the goal carried over. */
  const saveTargets = async () => {
    if (!aboutYou || !inputs) return
    setSaving(true)
    await saveProfileAndTargets(aboutYou, inputs)
    setSaving(false)
    if (draft.answers && !planSaved) draft.setAnswers({ ...draft.answers, goal: goal === 'cut' ? 'cut' : draft.answers.goal === 'cut' ? 'muscle' : draft.answers.goal })
    go(4)
  }

  const adoptDraft = async () => {
    if (!draft.plan) return
    setSaving(true)
    await adoptPlan(draft.plan)
    setSaving(false)
    setPlanSaved(true)
    go(6)
  }

  /** Finishes onboarding; the app shell then leaves the welcome flow (or `to` takes over). */
  const finish = async (to?: string) => {
    setSaving(true)
    haptic('success')
    await completeOnboarding(new Date().toISOString())
    if (to) navigate(to)
  }

  const footer = (
    <div className="fixed inset-x-0 bottom-0 z-20 px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-10" style={{ background: 'linear-gradient(to top, var(--page) 58%, transparent)' }}>
      <div className="mx-auto max-w-xl">
        {step === 0 && (
          <Button block size="lg" disabled={!adult} onClick={next}>
            Get started
          </Button>
        )}
        {(step === 1 || step === 2) && (
          <Button block size="lg" onClick={next}>
            Continue
          </Button>
        )}
        {step === 3 && (
          <Button block size="lg" disabled={saving} onClick={() => void saveTargets()}>
            Save targets
          </Button>
        )}
        {step === 4 && (
          <div className="flex gap-2">
            <Button size="lg" variant="secondary" onClick={() => go(6)}>
              Skip for now
            </Button>
            <Button
              size="lg"
              className="flex-1"
              disabled={!draft.plan}
              onClick={() => {
                draft.resetVariant()
                go(5)
              }}
            >
              Build my plan
            </Button>
          </div>
        )}
        {step === 5 && (
          <div className="flex gap-2">
            <Button size="lg" variant="secondary" aria-label="Regenerate with other exercises" onClick={() => draft.regenerate()}>
              <IconRepeat size={19} /> Regenerate
            </Button>
            <Button size="lg" className="flex-1" disabled={saving || !draft.plan} onClick={() => void adoptDraft()}>
              Use this plan
            </Button>
          </div>
        )}
        {step === 6 && (
          <Button block size="lg" disabled={saving} onClick={() => void finish()}>
            Done
          </Button>
        )}
      </div>
    </div>
  )

  return (
    <div className="tone-brand relative mx-auto min-h-dvh max-w-xl px-4 pb-32 pt-[env(safe-area-inset-top)]">
      <div aria-hidden className="ambient pointer-events-none fixed inset-x-0 top-0 -z-10 mx-auto h-[75vh] max-w-xl" />
      <div className="flex min-h-14 items-center">
        {step > 0 ? (
          <IconButton label="Back" onClick={() => setStep(step - 1)}>
            <IconChevronLeft />
          </IconButton>
        ) : (
          <span className="size-11" />
        )}
        <div className="flex-1">
          <Dots count={STEPS} active={step} />
        </div>
        <span className="size-11" />
      </div>

      {step === 0 && (
        <section className="pt-4">
          <img src={`${import.meta.env.BASE_URL}pwa-192.png`} alt="" className="animate-pop size-[72px] rounded-[20px] shadow-[0_16px_40px_-12px_color-mix(in_oklab,var(--brand)_70%,transparent)]" />
          <h1 className="mt-6 text-[40px] font-bold leading-none tracking-[-0.04em]">Fittrack</h1>
          <p className="mt-3 text-[19px] leading-snug text-ink-2">A private logbook for food, training and body weight.</p>

          <div className="mt-8 space-y-4">
            {FEATURES.map((f, i) => (
              <div key={f.title} className="animate-rise flex items-start gap-3.5" style={{ '--i': i + 1 } as CSSProperties}>
                <IconTile tone={f.tone} size={38}>
                  {f.icon}
                </IconTile>
                <div>
                  <p className="text-[16px] font-semibold">{f.title}</p>
                  <p className="text-[14px] text-ink-2">{f.text}</p>
                </div>
              </div>
            ))}
          </div>

          {!isStandalone() && (
            <Notice className="mt-7">Installing to the Home Screen protects your data from browser clean-up. On an iPhone, open this page in Safari and use Share → Add to Home Screen.</Notice>
          )}

          <div className="card mt-4 p-4">
            <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setNoticeOpen(!noticeOpen)} aria-expanded={noticeOpen}>
              <span className="text-[15px] font-semibold">Health notice</span>
              <IconChevronDown size={18} className={cx('text-ink-2 transition-transform duration-300', noticeOpen && 'rotate-180')} />
            </button>
            <p className={cx('mt-2 text-[14px] leading-relaxed text-ink-2', !noticeOpen && 'line-clamp-3')}>{DISCLAIMER}</p>
          </div>

          <label className="card press mt-3 flex min-h-[60px] cursor-pointer items-center gap-3 px-4">
            <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="peer sr-only" />
            <span
              aria-hidden
              className={cx(
                'flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-brand',
                adult ? 'border-transparent btn-primary' : 'border-fill-strong',
              )}
            >
              {adult && <IconCheck size={16} strokeWidth={3.2} />}
            </span>
            <span className="text-[15px] font-medium">I am 18 or older and have read this notice</span>
          </label>
        </section>
      )}

      {step === 1 && (
        <section className="space-y-5 pt-2">
          <div>
            <h1 className="text-title">About you</h1>
            <p className="mt-1.5 text-[16px] text-ink-2">These go into the energy equation. Metric units.</p>
          </div>
          <div className="card space-y-5 p-4">
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
          </div>
          {about.birthDate && ageOn(about.birthDate, localDay()) < 18 && (
            <Notice tone="warn">Under 18 the app sets no deficit target. Please talk to a doctor or dietitian before changing how you eat.</Notice>
          )}
        </section>
      )}

      {step === 2 && (
        <section className="space-y-6 pt-2">
          <div>
            <h1 className="text-title">Your goal</h1>
            <p className="mt-1.5 text-[16px] text-ink-2">You can change it any time under More.</p>
          </div>
          <div className="space-y-2.5" role="radiogroup" aria-label="Goal">
            {(Object.keys(GOALS) as GoalType[]).map((g) => {
              const { icon: Icon, tone } = GOAL_ICON[g]
              const sel = goal === g
              return (
                <button
                  key={g}
                  type="button"
                  role="radio"
                  aria-checked={sel}
                  onClick={() => {
                    haptic()
                    setGoal(g)
                    setOverrides({ ...overrides, goalAdjustPct: undefined })
                  }}
                  className={cx('card press flex w-full items-center gap-4 p-4 text-left transition-shadow', sel && 'ring-2 ring-brand')}
                >
                  <IconTile tone={tone} size={44}>
                    <Icon size={24} strokeWidth={2.4} />
                  </IconTile>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[18px] font-bold">{GOALS[g].label}</span>
                    <span className="block text-[14px] text-ink-2">{GOALS[g].blurb}</span>
                  </span>
                  <span className={cx('flex size-7 shrink-0 items-center justify-center rounded-full border-2', sel ? 'border-transparent btn-primary' : 'border-fill-strong')}>
                    {sel && <IconCheck size={16} strokeWidth={3.2} />}
                  </span>
                </button>
              )
            })}
          </div>
          <div>
            <h2 className="mb-2.5 px-1 text-[20px] font-bold tracking-tight">How active are you?</h2>
            <p className="-mt-1.5 mb-3 px-1 text-[14px] text-ink-2">Training included.</p>
            <div className="card divide-y divide-line overflow-hidden" role="radiogroup" aria-label="Activity">
              {ACTIVITY_LEVELS.map((l, i) => {
                const sel = activity === l.factor
                return (
                  <button
                    key={l.factor}
                    type="button"
                    role="radio"
                    aria-checked={sel}
                    onClick={() => {
                      haptic()
                      setActivity(l.factor)
                    }}
                    className={cx('flex min-h-16 w-full items-center gap-3.5 px-4 py-3 text-left transition-colors', sel ? 'bg-brand-soft' : 'active:bg-fill')}
                  >
                    <Intensity level={i + 1} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[16px] font-semibold">{l.label}</span>
                      <span className="block text-[13px] text-ink-2">{l.detail}</span>
                    </span>
                    {sel && <IconCheck size={20} strokeWidth={3} className="shrink-0 text-brand-ink" />}
                  </button>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {step === 3 && inputs && (
        <section className="space-y-4 pt-2">
          <div>
            <h1 className="text-title">Your targets</h1>
            <p className="mt-1.5 text-[16px] text-ink-2">Every number can be changed, now or later.</p>
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

      {step === 4 && (
        <section className="space-y-4 pt-2">
          <div>
            <h1 className="text-title">Your training</h1>
            <p className="mt-1.5 text-[16px] text-ink-2">Seven questions give you a week of training. You can skip this and do it later on Train.</p>
          </div>
          {draft.answers ? (
            <PlanQuestions value={draft.answers} onChange={draft.setAnswers} />
          ) : (
            <div className="flex justify-center py-10 text-ink-2">
              <Spinner />
            </div>
          )}
        </section>
      )}

      {step === 5 && (
        <section className="space-y-4 pt-2">
          <div>
            <h1 className="text-title">Your first week</h1>
            <p className="mt-1.5 text-[16px] text-ink-2">Use it as it is, regenerate for other exercises, or edit it later on Train.</p>
          </div>
          {draft.plan ? <PlanPreview plan={draft.plan} exercises={draft.exercises} /> : <Spinner />}
        </section>
      )}

      {step === 6 && (
        <section className="space-y-4 pt-2">
          <div>
            <h1 className="text-title">Optional extras</h1>
            <p className="mt-1.5 text-[16px] text-ink-2">Each can wait. Tap one to set it up now, or Done to open Today.</p>
          </div>
          {planSaved && <Notice tone="ok">Your plan is saved. Today shows the next workout.</Notice>}
          <Group>
            <ListRow icon={<IconHeart size={18} />} iconTone="pink" title="Apple Health import" subtitle="Steps, weight, sleep and workouts from a Shortcut" onClick={() => void finish('/more/health')} />
            <ListRow icon={<IconCamera size={18} />} iconTone="food" title="Photo logging" subtitle="Your own key for a vision model" onClick={() => void finish('/more/ai')} />
            <ListRow
              icon={<IconShield size={18} />}
              iconTone="amber"
              title="Backups"
              subtitle="Today reminds you after 7 days without one. Save the first now"
              onClick={() => void finish('/more/backup')}
            />
          </Group>
        </section>
      )}

      {footer}
    </div>
  )
}
