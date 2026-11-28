// Onboarding, seven short screens: install and welcome, about you, goal and activity,
// targets, training questions (skippable), plan preview and optional extras.
// One decision per screen, progress dots, back everywhere, no account, no email,
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
          In Safari unten auf <b>Teilen</b> tippen.
        </>
      ),
    },
    {
      icon: <IconPlus size={18} />,
      text: (
        <>
          <b>Zum Home-Bildschirm</b> wählen. Ab iOS 26 „Als Web-App öffnen“ eingeschaltet lassen.
        </>
      ),
    },
    { icon: <IconPhone size={18} />, text: <>Fittrack über das neue Symbol öffnen und dort starten.</> },
  ]
  return (
    <div className="relative flex min-h-dvh flex-col justify-center px-5 pb-10 pt-[env(safe-area-inset-top)]">
      <img src={`${import.meta.env.BASE_URL}pwa-192.png`} alt="" className="mx-auto size-20 rounded-[22px] shadow-float" />
      <h1 className="mt-6 text-center text-title">Fittrack installieren</h1>
      <p className="mt-2 text-center text-[16px] text-ink-2">Sie läuft vom Home-Bildschirm wie jede andere App.</p>
      <div className="card mx-auto mt-8 w-full max-w-sm space-y-4 p-5">
        {steps.map((s, i) => (
          <div key={i} className="flex items-start gap-3">
            <IconTile size={34}>{s.icon}</IconTile>
            <p className="pt-1.5 text-[15px] leading-snug">{s.text}</p>
          </div>
        ))}
      </div>
      <p className="mx-auto mt-5 max-w-sm text-center text-[13px] text-ink-2">Deine Daten liegen in der installierten App, die ihren eigenen Speicher hat, getrennt von Safari.</p>
    </div>
  )
}

const FEATURES = [
  { icon: <IconLock size={18} />, title: 'Privat', text: 'Kein Konto. Alles bleibt auf diesem iPhone.' },
  { icon: <IconWifiOff size={18} />, title: 'Offline', text: 'Funktioniert im Gym und im Supermarkt ohne Netz.' },
  { icon: <IconZap size={18} />, title: 'Schnell', text: 'Mahlzeiten mit einem Tipp wiederholen, Sätze starten mit den Werten vom letzten Mal.' },
]

const GOAL_ICON: Record<GoalType, { icon: typeof IconTrendUp }> = {
  bulk: { icon: IconTrendUp },
  maintain: { icon: IconTrendFlat },
  cut: { icon: IconTrendDown },
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
            Los geht's
          </Button>
        )}
        {(step === 1 || step === 2) && (
          <Button block size="lg" onClick={next}>
            Weiter
          </Button>
        )}
        {step === 3 && (
          <Button block size="lg" disabled={saving} onClick={() => void saveTargets()}>
            Ziele speichern
          </Button>
        )}
        {step === 4 && (
          <div className="flex gap-2">
            <Button size="lg" variant="secondary" onClick={() => go(6)}>
              Später
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
              Plan erstellen
            </Button>
          </div>
        )}
        {step === 5 && (
          <div className="flex gap-2">
            <Button size="lg" variant="secondary" aria-label="Mit anderen Übungen neu erstellen" onClick={() => draft.regenerate()}>
              <IconRepeat size={19} /> Neu mischen
            </Button>
            <Button size="lg" className="flex-1" disabled={saving || !draft.plan} onClick={() => void adoptDraft()}>
              Plan übernehmen
            </Button>
          </div>
        )}
        {step === 6 && (
          <Button block size="lg" disabled={saving} onClick={() => void finish()}>
            Fertig
          </Button>
        )}
      </div>
    </div>
  )

  return (
    <div className="relative mx-auto min-h-dvh max-w-xl px-4 pb-32 pt-[env(safe-area-inset-top)]">
      <div className="flex min-h-14 items-center">
        {step > 0 ? (
          <IconButton label="Zurück" onClick={() => setStep(step - 1)}>
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
          <img src={`${import.meta.env.BASE_URL}pwa-192.png`} alt="" className="animate-pop size-[72px] rounded-[20px] shadow-float" />
          <h1 className="mt-6 text-[40px] font-bold leading-none tracking-[-0.035em]">Fittrack</h1>
          <p className="mt-3 text-[19px] leading-snug text-ink-2">Dein privates Logbuch für Essen, Training und Gewicht.</p>

          <div className="mt-8 space-y-4">
            {FEATURES.map((f, i) => (
              <div key={f.title} className="animate-rise flex items-start gap-3.5" style={{ '--i': i + 1 } as CSSProperties}>
                <IconTile size={38}>{f.icon}</IconTile>
                <div>
                  <p className="text-[16px] font-semibold">{f.title}</p>
                  <p className="text-[14px] text-ink-2">{f.text}</p>
                </div>
              </div>
            ))}
          </div>

          {!isStandalone() && (
            <Notice className="mt-7">Auf dem Home-Bildschirm installiert sind deine Daten vor dem Aufräumen des Browsers geschützt. Auf dem iPhone: in Safari öffnen, dann Teilen → Zum Home-Bildschirm.</Notice>
          )}

          <div className="card mt-4 p-4">
            <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setNoticeOpen(!noticeOpen)} aria-expanded={noticeOpen}>
              <span className="text-[15px] font-semibold">Gesundheitshinweis</span>
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
                adult ? 'border-transparent btn-accent' : 'border-fill-strong',
              )}
            >
              {adult && <IconCheck size={16} strokeWidth={3.2} />}
            </span>
            <span className="text-[15px] font-medium">Ich bin mindestens 18 und habe den Hinweis gelesen</span>
          </label>
        </section>
      )}

      {step === 1 && (
        <section className="space-y-5 pt-2">
          <div>
            <h1 className="text-title">Über dich</h1>
            <p className="mt-1.5 text-[16px] text-ink-2">Daraus berechnet die App deinen Energiebedarf.</p>
          </div>
          <div className="card space-y-5 p-4">
            <Field group label="Geschlecht" hint="Die Formel unterscheidet sich für Männer und Frauen." error={showErrors && check.errors.sex}>
              <Segmented
                value={about.sex ?? ('' as Sex)}
                options={[
                  { value: 'male' as Sex, label: 'Männlich' },
                  { value: 'female' as Sex, label: 'Weiblich' },
                ]}
                onChange={(sex) => setAbout({ ...about, sex })}
              />
            </Field>
            <Field label="Geburtsdatum" error={showErrors && check.errors.birthDate}>
              <TextInput type="date" value={about.birthDate} max={localDay()} onChange={(e) => setAbout({ ...about, birthDate: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Größe" error={showErrors && check.errors.heightCm}>
                <NumberInput value={about.heightCm} unit="cm" ariaLabel="Größe" onChange={(heightCm) => setAbout({ ...about, heightCm })} />
              </Field>
              <Field label="Gewicht" error={showErrors && check.errors.weightKg}>
                <NumberInput value={about.weightKg} unit="kg" ariaLabel="Gewicht" onChange={(weightKg) => setAbout({ ...about, weightKg })} />
              </Field>
            </div>
            <Field label="Körperfett (optional)" hint="Ermöglicht die Formel mit fettfreier Masse." error={showErrors && check.errors.bodyFatPct}>
              <NumberInput value={about.bodyFatPct} unit="%" ariaLabel="Körperfett" onChange={(bodyFatPct) => setAbout({ ...about, bodyFatPct })} />
            </Field>
          </div>
          {about.birthDate && ageOn(about.birthDate, localDay()) < 18 && (
            <Notice tone="warn">Unter 18 setzt die App kein Defizit. Bitte sprich mit einer Ärztin, einem Arzt oder einer Ernährungsfachkraft, bevor du deine Ernährung umstellst.</Notice>
          )}
        </section>
      )}

      {step === 2 && (
        <section className="space-y-6 pt-2">
          <div>
            <h1 className="text-title">Dein Ziel</h1>
            <p className="mt-1.5 text-[16px] text-ink-2">Jederzeit unter Mehr änderbar.</p>
          </div>
          <div className="space-y-2.5" role="radiogroup" aria-label="Ziel">
            {(Object.keys(GOALS) as GoalType[]).map((g) => {
              const { icon: Icon } = GOAL_ICON[g]
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
                  <IconTile size={44}>
                    <Icon size={24} strokeWidth={2.4} />
                  </IconTile>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[18px] font-bold">{GOALS[g].label}</span>
                    <span className="block text-[14px] text-ink-2">{GOALS[g].blurb}</span>
                  </span>
                  <span className={cx('flex size-7 shrink-0 items-center justify-center rounded-full border-2', sel ? 'border-transparent btn-accent' : 'border-fill-strong')}>
                    {sel && <IconCheck size={16} strokeWidth={3.2} />}
                  </span>
                </button>
              )
            })}
          </div>
          <div>
            <h2 className="mb-2.5 px-1 text-[18px] font-semibold tracking-[-0.01em]">Wie aktiv bist du?</h2>
            <p className="-mt-1.5 mb-3 px-1 text-[14px] text-ink-2">Training eingerechnet.</p>
            <div className="card divide-y divide-line overflow-hidden" role="radiogroup" aria-label="Aktivität">
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
            <h1 className="text-title">Deine Ziele</h1>
            <p className="mt-1.5 text-[16px] text-ink-2">Jede Zahl lässt sich ändern, jetzt oder später.</p>
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
            <h1 className="text-title">Dein Training</h1>
            <p className="mt-1.5 text-[16px] text-ink-2">Ein paar Fragen, dann steht deine Trainingswoche. Du kannst das auch später unter Training machen.</p>
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
            <h1 className="text-title">Deine erste Woche</h1>
            <p className="mt-1.5 text-[16px] text-ink-2">So übernehmen, neu mischen für andere Übungen oder später unter Training anpassen.</p>
          </div>
          {draft.plan ? <PlanPreview plan={draft.plan} exercises={draft.exercises} /> : <Spinner />}
        </section>
      )}

      {step === 6 && (
        <section className="space-y-4 pt-2">
          <div>
            <h1 className="text-title">Optionale Extras</h1>
            <p className="mt-1.5 text-[16px] text-ink-2">Alles kann warten. Tippe auf eins, um es jetzt einzurichten, oder auf Fertig.</p>
          </div>
          {planSaved && <Notice tone="ok">Dein Plan ist gespeichert. „Heute“ zeigt das nächste Training.</Notice>}
          <Group>
            <ListRow icon={<IconHeart size={18} />} title="Apple-Health-Import" subtitle="Schritte, Gewicht, Schlaf per Kurzbefehl" onClick={() => void finish('/more/health')} />
            <ListRow icon={<IconCamera size={18} />} title="Foto-Erfassung" subtitle="Mit eigenem Schlüssel für ein Bildmodell" onClick={() => void finish('/more/ai')} />
            <ListRow
              icon={<IconShield size={18} />}
              title="Backups"
              subtitle="Nach 7 Tagen ohne Backup kommt eine Erinnerung"
              onClick={() => void finish('/more/backup')}
            />
          </Group>
        </section>
      )}

      {footer}
    </div>
  )
}
