import { useState, type ReactNode } from 'react'
import type { GoalType } from '../../db'
import { fmt1, fmt2, fmtInt } from '../../lib/format'
import {
  ACTIVITY_RANGE,
  activityLevelFor,
  calculateTargets,
  FAT_RANGE,
  GOALS,
  PROTEIN_RANGE,
  type TargetInputs,
  type TargetResult,
} from '../../lib/nutrition'
import { IconChevronDown, IconEdit } from '../../ui/icons'
import { AnimatedNumber, Button, cx, Notice, NumberInput, Toggle } from '../../ui/kit'

const SOURCES = {
  frankenfield: { label: 'Frankenfield 2005', href: 'https://pure.psu.edu/en/publications/comparison-of-predictive-equations-for-resting-metabolic-rate-in-/' },
  iraki: { label: 'Iraki 2019', href: 'https://pubmed.ncbi.nlm.nih.gov/31247944/' },
  helms: { label: 'Helms 2014', href: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4033492/' },
  morton: { label: 'Morton 2018', href: 'https://pubmed.ncbi.nlm.nih.gov/28698222/' },
}

function Source({ s }: { s: keyof typeof SOURCES }) {
  return (
    <a href={SOURCES[s].href} target="_blank" rel="noreferrer" className="font-semibold text-brand-ink underline-offset-2 active:underline">
      {SOURCES[s].label}
    </a>
  )
}

function SetByYou({ onReset }: { onReset: () => void }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-[12px] font-bold text-brand-ink">von dir gesetzt</span>
      <button type="button" onClick={onReset} className="text-[12px] font-semibold text-ink-2 underline">
        zurücksetzen
      </button>
    </span>
  )
}

function Step({ n, title, value, children }: { n: number; title: string; value: ReactNode; children: ReactNode }) {
  return (
    <div className="border-t border-line py-4 first:border-t-0">
      <div className="flex items-center gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-fill text-[13px] font-bold text-ink-2">{n}</span>
        <span className="flex-1 text-[16px] font-semibold">{title}</span>
        <span className="text-[16px] font-bold">{value}</span>
      </div>
      <div className="mt-2 space-y-2.5 pl-10 text-[14px] leading-relaxed text-ink-2">{children}</div>
    </div>
  )
}

function Slider({ value, min, max, step, onChange, label }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; label: string }) {
  return <input type="range" aria-label={label} className="w-full" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} />
}

function goalAdjustLabel(goal: GoalType, pct: number): string {
  if (goal === 'maintain') return 'Erhalt'
  return `${pct > 0 ? '+' : ''}${pct} %`
}

/**
 * The calorie split as one tall segmented bar: each part its own block with a 2 px
 * gap, its share printed inside in white or near-black (by the fill's luminance),
 * and a legend naming the parts in block order.
 */
function SplitBar({ parts }: { parts: { label: string; kcal: number; color: string; ink: string }[] }) {
  const total = Math.max(1, parts.reduce((s, p) => s + p.kcal, 0))
  return (
    <div>
      <div className="flex h-7 gap-[2px]" role="img" aria-label={parts.map((p) => `${p.label} ${Math.round((p.kcal / total) * 100)} %`).join(', ')}>
        {parts
          .filter((p) => p.kcal > 0)
          .map((p) => {
            const share = Math.round((p.kcal / total) * 100)
            return (
              <div key={p.label} className="flex items-center overflow-hidden rounded-[4px] px-2" style={{ width: `${(p.kcal / total) * 100}%`, background: p.color }}>
                {share >= 12 && (
                  <span className="text-[12px] font-bold" style={{ color: p.ink }}>
                    {share} %
                  </span>
                )}
              </div>
            )
          })}
      </div>
      <div className="mt-2 flex gap-4 text-[12px] font-semibold text-ink-2">
        {parts.map((p) => (
          <span key={p.label} className="flex items-center gap-1.5">
            <span className="size-2 rounded-[2px]" style={{ background: p.color }} />
            {p.label}
          </span>
        ))}
        <span className="ml-auto">Anteil der Kalorien</span>
      </div>
    </div>
  )
}

/** Large calorie figure, the macro split, warnings and the expandable "Why these numbers". */
export function TargetsEditor({ inputs, onChange, defaultOpen = false }: { inputs: TargetInputs; onChange: (i: TargetInputs) => void; defaultOpen?: boolean }) {
  const r: TargetResult = calculateTargets(inputs)
  const [open, setOpen] = useState(defaultOpen)
  const [editKcal, setEditKcal] = useState(false)
  const goal = GOALS[inputs.goal]
  const set = (patch: Partial<TargetInputs>) => onChange({ ...inputs, ...patch })
  const level = activityLevelFor(inputs.activityFactor)

  return (
    <div className="space-y-3">
      <div className="card p-5 text-center">
        <p className="text-[13px] font-semibold text-ink-2">Tagesziel</p>
        {editKcal ? (
          <div className="mx-auto mt-2 flex max-w-64 items-center gap-2">
            <NumberInput value={r.kcal} integer unit="kcal" autoFocus ariaLabel="Kalorienziel" onChange={(n) => n != null && n >= 800 && n <= 6000 && set({ kcalOverride: n })} />
            <Button size="md" variant="secondary" onClick={() => setEditKcal(false)}>
              Fertig
            </Button>
          </div>
        ) : (
          <button type="button" onClick={() => setEditKcal(true)} className="press mt-1 inline-flex items-baseline gap-1.5">
            <AnimatedNumber value={r.kcal} className="text-[56px] font-bold leading-none tracking-[-0.045em]" />
            <span className="text-[18px] font-semibold text-ink-2">kcal</span>
          </button>
        )}
        <div className="mt-2 flex justify-center">
          {r.setByYou.kcal ? (
            <SetByYou onReset={() => set({ kcalOverride: undefined })} />
          ) : (
            <button type="button" onClick={() => setEditKcal(true)} className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-3">
              <IconEdit size={13} /> Zahl antippen, um sie selbst festzulegen
            </button>
          )}
        </div>

        <div className="mt-5 text-left">
          <SplitBar
            parts={[
              { label: 'Eiweiß', kcal: r.proteinG * 4, color: 'var(--protein)', ink: '#ffffff' },
              { label: 'Kohlenhydrate', kcal: r.carbsG * 4, color: 'var(--carbs)', ink: '#0b0b0b' },
              { label: 'Fett', kcal: r.fatG * 9, color: 'var(--fat)', ink: '#ffffff' },
            ]}
          />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-left">
          {[
            { label: 'Eiweiß', g: r.proteinG, perKg: r.proteinG / inputs.weightKg },
            { label: 'Kohlenh.', g: r.carbsG, perKg: r.carbsPerKg },
            { label: 'Fett', g: r.fatG, perKg: r.fatG / inputs.weightKg },
          ].map((m) => (
            <div key={m.label} className="rounded-[16px] bg-fill px-3 py-2.5">
              <div className="text-[12px] font-semibold text-ink-2">{m.label}</div>
              <div className="text-[22px] font-bold tracking-tight">
                {fmtInt(m.g)}
                <span className="text-[14px] font-semibold text-ink-2"> g</span>
              </div>
              <div className="text-[12px] text-ink-3">{fmt1(m.perKg)} g pro kg</div>
            </div>
          ))}
        </div>
      </div>

      {r.warnings.map((w) => (
        <Notice key={w.code} tone="warn">
          {w.message}
        </Notice>
      ))}

      <div className="card">
        <button type="button" onClick={() => setOpen(!open)} className="flex min-h-14 w-full items-center justify-between px-5 text-[16px] font-semibold" aria-expanded={open}>
          Wie die Zahlen entstehen
          <IconChevronDown className={cx('text-ink-2 transition-transform duration-300', open && 'rotate-180')} />
        </button>
        {open && (
          <div className="animate-fade px-5 pb-3">
            <Step n={1} title="Grundumsatz" value={`${fmtInt(r.restingKcal)} kcal`}>
              {r.method === 'mifflin' ? (
                <p>
                  Mifflin-St Jeor: 10 × {fmt2(inputs.weightKg)} kg + 6,25 × {fmt2(inputs.heightCm)} cm − 5 × {inputs.ageYears} Jahre {inputs.sex === 'male' ? '+ 5' : '− 161'}
                </p>
              ) : (
                <p>Katch-McArdle: 370 + 21,6 × {fmt1(inputs.weightKg * (1 - (inputs.bodyFatPct ?? 0) / 100))} kg fettfreie Masse</p>
              )}
              <p>
                Unter den verglichenen Formeln am häufigsten innerhalb von 10 % der Messwerte (<Source s="frankenfield" />
                ).
              </p>
              {inputs.bodyFatPct != null && (
                <div className="-mx-4 rounded-[20px] bg-fill">
                  <Toggle label="Fettfreie Masse nutzen" hint={`Aus deinem Körperfettwert von ${fmt1(inputs.bodyFatPct)} %`} checked={inputs.useLeanMass} onChange={(v) => set({ useLeanMass: v })} />
                </div>
              )}
            </Step>
            <Step n={2} title="Erhaltungsbedarf" value={`${fmtInt(r.maintenanceKcal)} kcal`}>
              {inputs.maintenanceOverride ? (
                <div className="-mx-4 rounded-[20px] bg-fill px-4 py-3">
                  <p className="font-semibold text-ink">Aus deinen Daten: {fmtInt(inputs.maintenanceOverride)} kcal</p>
                  <p className="mt-0.5">
                    Durchschnittliche Zufuhr minus Trendänderung × 7.700 kcal pro kg, über 14 Tage. Die Formel ergibt {fmtInt(r.formulaMaintenanceKcal)} kcal.
                  </p>
                  <button type="button" className="mt-1 text-[14px] font-semibold text-brand-ink" onClick={() => set({ maintenanceOverride: undefined })}>
                    Wieder die Formel nutzen
                  </button>
                </div>
              ) : null}
              <p>
                × Aktivitätsfaktor {fmt2(inputs.activityFactor)} ({level.label}: {level.detail})
              </p>
              <Slider label="Aktivitätsfaktor" value={inputs.activityFactor} min={ACTIVITY_RANGE[0]} max={ACTIVITY_RANGE[1]} step={0.025} onChange={(v) => set({ activityFactor: v })} />
              <p>Standardfaktoren und das schwächste Glied: Nach 14 erfassten Tagen korrigiert die App ihn aus deiner Zufuhr und deinem Gewichtstrend.</p>
            </Step>
            <Step n={3} title={`Ziel: ${goal.label}`} value={goalAdjustLabel(inputs.goal, r.goalAdjustPct)}>
              {inputs.goal !== 'maintain' && (
                <>
                  <Slider
                    label="Kalorienanpassung"
                    value={r.goalAdjustPct}
                    min={goal.adjustRange[0]}
                    max={goal.adjustRange[1]}
                    step={1}
                    onChange={(v) => set({ goalAdjustPct: v === goal.adjustPct ? undefined : v })}
                  />
                  {r.setByYou.goalAdjustPct && <SetByYou onReset={() => set({ goalAdjustPct: undefined })} />}
                </>
              )}
              <p>
                {inputs.goal === 'cut' ? (
                  <>
                    0,5–1 % Körpergewicht weniger pro Woche (<Source s="helms" />
                    ).
                  </>
                ) : inputs.goal === 'bulk' ? (
                  <>
                    Etwa 10–20 % Überschuss für 0,25–0,5 % Körpergewicht mehr pro Woche (<Source s="iraki" />
                    ).
                  </>
                ) : (
                  'Kalorien gleich Erhaltungsbedarf.'
                )}
              </p>
            </Step>
            <Step n={4} title="Eiweiß" value={`${fmtInt(r.proteinG)} g`}>
              <p>
                {fmt1(r.proteinPerKg)} g/kg × {fmt2(inputs.weightKg)} kg
              </p>
              <Slider
                label="Eiweiß pro kg"
                value={r.proteinPerKg}
                min={PROTEIN_RANGE[0]}
                max={PROTEIN_RANGE[1]}
                step={0.1}
                onChange={(v) => set({ proteinPerKg: Math.round(v * 10) / 10 === goal.proteinPerKg ? undefined : Math.round(v * 10) / 10 })}
              />
              {r.setByYou.proteinPerKg && <SetByYou onReset={() => set({ proteinPerKg: undefined })} />}
              <p>
                Über etwa 1,6 g/kg im Schnitt kein zusätzlicher Muskelaufbau (<Source s="morton" />
                ); im Defizit mehr (<Source s="helms" />
                ).
              </p>
            </Step>
            <Step n={5} title="Fett" value={`${fmtInt(r.fatG)} g`}>
              <p>{fmt2(r.fatPerKg)} g/kg × {fmt2(inputs.weightKg)} kg, nie unter 0,5 g/kg</p>
              <Slider
                label="Fett pro kg"
                value={r.fatPerKg}
                min={FAT_RANGE[0]}
                max={FAT_RANGE[1]}
                step={0.05}
                onChange={(v) => set({ fatPerKg: Math.round(v * 100) / 100 === goal.fatPerKg ? undefined : Math.round(v * 100) / 100 })}
              />
              {r.setByYou.fatPerKg && <SetByYou onReset={() => set({ fatPerKg: undefined })} />}
              <p>
                0,5–1,5 g/kg (<Source s="iraki" />
                ); 15–30 % der Kalorien (<Source s="helms" />
                ).
              </p>
            </Step>
            <Step n={6} title="Kohlenhydrate" value={`${fmtInt(r.carbsG)} g`}>
              <p>
                ({fmtInt(r.kcal)} − 4 × {fmtInt(r.proteinG)} − 9 × {fmtInt(r.fatG)}) ÷ 4 = {fmt1(r.carbsPerKg)} g/kg
              </p>
              <p>
                Mindestens 3–5 g/kg unterstützen das Training (<Source s="iraki" />
                ); die App warnt unter 3.
              </p>
            </Step>
          </div>
        )}
      </div>
    </div>
  )
}
