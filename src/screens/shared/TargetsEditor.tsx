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
      <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-[12px] font-bold text-brand-ink">set by you</span>
      <button type="button" onClick={onReset} className="text-[12px] font-semibold text-ink-2 underline">
        reset
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
  if (goal === 'maintain') return 'maintenance'
  return `${pct > 0 ? '+' : ''}${pct}%`
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
      <div className="flex h-7 gap-[2px]" role="img" aria-label={parts.map((p) => `${p.label} ${Math.round((p.kcal / total) * 100)}%`).join(', ')}>
        {parts
          .filter((p) => p.kcal > 0)
          .map((p) => {
            const share = Math.round((p.kcal / total) * 100)
            return (
              <div key={p.label} className="flex items-center overflow-hidden rounded-[4px] px-2" style={{ width: `${(p.kcal / total) * 100}%`, background: p.color }}>
                {share >= 12 && (
                  <span className="text-[12px] font-bold" style={{ color: p.ink }}>
                    {share}%
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
        <span className="ml-auto">share of calories</span>
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
      <div className="card tone-brand tinted p-5 text-center">
        <p className="text-[13px] font-semibold text-ink-2">Daily target</p>
        {editKcal ? (
          <div className="mx-auto mt-2 flex max-w-64 items-center gap-2">
            <NumberInput value={r.kcal} integer unit="kcal" autoFocus ariaLabel="Calorie target" onChange={(n) => n != null && n >= 800 && n <= 6000 && set({ kcalOverride: n })} />
            <Button size="md" variant="secondary" onClick={() => setEditKcal(false)}>
              Done
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
              <IconEdit size={13} /> Tap the number to set it yourself
            </button>
          )}
        </div>

        <div className="mt-5 text-left">
          <SplitBar
            parts={[
              { label: 'Protein', kcal: r.proteinG * 4, color: 'var(--protein)', ink: '#ffffff' },
              { label: 'Carbs', kcal: r.carbsG * 4, color: 'var(--carbs)', ink: '#0b0b0b' },
              { label: 'Fat', kcal: r.fatG * 9, color: 'var(--fat)', ink: '#ffffff' },
            ]}
          />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-left">
          {[
            { label: 'Protein', g: r.proteinG, perKg: r.proteinG / inputs.weightKg },
            { label: 'Carbs', g: r.carbsG, perKg: r.carbsPerKg },
            { label: 'Fat', g: r.fatG, perKg: r.fatG / inputs.weightKg },
          ].map((m) => (
            <div key={m.label} className="rounded-[18px] bg-surface/75 px-3 py-2.5">
              <div className="text-[12px] font-semibold text-ink-2">{m.label}</div>
              <div className="text-[22px] font-bold tracking-tight">
                {fmtInt(m.g)}
                <span className="text-[14px] font-semibold text-ink-2"> g</span>
              </div>
              <div className="text-[12px] text-ink-3">{fmt1(m.perKg)} g per kg</div>
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
          Why these numbers
          <IconChevronDown className={cx('text-ink-2 transition-transform duration-300', open && 'rotate-180')} />
        </button>
        {open && (
          <div className="animate-fade px-5 pb-3">
            <Step n={1} title="Resting energy" value={`${fmtInt(r.restingKcal)} kcal`}>
              {r.method === 'mifflin' ? (
                <p>
                  Mifflin-St Jeor: 10 × {fmt2(inputs.weightKg)} kg + 6.25 × {fmt2(inputs.heightCm)} cm − 5 × {inputs.ageYears} years {inputs.sex === 'male' ? '+ 5' : '− 161'}
                </p>
              ) : (
                <p>Katch-McArdle: 370 + 21.6 × {fmt1(inputs.weightKg * (1 - (inputs.bodyFatPct ?? 0) / 100))} kg lean mass</p>
              )}
              <p>
                Most often within 10% of measured values among the equations compared (<Source s="frankenfield" />
                ).
              </p>
              {inputs.bodyFatPct != null && (
                <div className="-mx-4 rounded-[20px] bg-fill">
                  <Toggle label="Use lean mass" hint={`From your body-fat reading of ${fmt1(inputs.bodyFatPct)}%`} checked={inputs.useLeanMass} onChange={(v) => set({ useLeanMass: v })} />
                </div>
              )}
            </Step>
            <Step n={2} title="Maintenance" value={`${fmtInt(r.maintenanceKcal)} kcal`}>
              {inputs.maintenanceOverride ? (
                <div className="-mx-4 rounded-[20px] bg-fill px-4 py-3">
                  <p className="font-semibold text-ink">From your own data: {fmtInt(inputs.maintenanceOverride)} kcal</p>
                  <p className="mt-0.5">
                    Average intake minus the weight trend's change × 7,700 kcal per kg, over 14 days. The formula gives {fmtInt(r.formulaMaintenanceKcal)} kcal.
                  </p>
                  <button type="button" className="mt-1 text-[14px] font-semibold text-brand-ink" onClick={() => set({ maintenanceOverride: undefined })}>
                    Use the formula again
                  </button>
                </div>
              ) : null}
              <p>
                × activity factor {fmt2(inputs.activityFactor)} ({level.label.toLowerCase()}: {level.detail.toLowerCase()})
              </p>
              <Slider label="Activity factor" value={inputs.activityFactor} min={ACTIVITY_RANGE[0]} max={ACTIVITY_RANGE[1]} step={0.025} onChange={(v) => set({ activityFactor: v })} />
              <p>Standard multipliers, and the weakest link: after 14 logged days the app can correct it from your own intake and weight trend.</p>
            </Step>
            <Step n={3} title={`Goal: ${goal.label.toLowerCase()}`} value={goalAdjustLabel(inputs.goal, r.goalAdjustPct)}>
              {inputs.goal !== 'maintain' && (
                <>
                  <Slider
                    label="Calorie adjustment"
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
                    A loss of 0.5–1% of body weight a week (<Source s="helms" />
                    ).
                  </>
                ) : inputs.goal === 'bulk' ? (
                  <>
                    A surplus of about 10–20% for 0.25–0.5% of body weight a week (<Source s="iraki" />
                    ).
                  </>
                ) : (
                  'Calories match maintenance.'
                )}
              </p>
            </Step>
            <Step n={4} title="Protein" value={`${fmtInt(r.proteinG)} g`}>
              <p>
                {fmt1(r.proteinPerKg)} g/kg × {fmt2(inputs.weightKg)} kg
              </p>
              <Slider
                label="Protein per kg"
                value={r.proteinPerKg}
                min={PROTEIN_RANGE[0]}
                max={PROTEIN_RANGE[1]}
                step={0.1}
                onChange={(v) => set({ proteinPerKg: Math.round(v * 10) / 10 === goal.proteinPerKg ? undefined : Math.round(v * 10) / 10 })}
              />
              {r.setByYou.proteinPerKg && <SetByYou onReset={() => set({ proteinPerKg: undefined })} />}
              <p>
                No further lean-mass gain above about 1.6 g/kg on average (<Source s="morton" />
                ); more in a deficit (<Source s="helms" />
                ).
              </p>
            </Step>
            <Step n={5} title="Fat" value={`${fmtInt(r.fatG)} g`}>
              <p>{fmt2(r.fatPerKg)} g/kg × {fmt2(inputs.weightKg)} kg, never below 0.5 g/kg</p>
              <Slider
                label="Fat per kg"
                value={r.fatPerKg}
                min={FAT_RANGE[0]}
                max={FAT_RANGE[1]}
                step={0.05}
                onChange={(v) => set({ fatPerKg: Math.round(v * 100) / 100 === goal.fatPerKg ? undefined : Math.round(v * 100) / 100 })}
              />
              {r.setByYou.fatPerKg && <SetByYou onReset={() => set({ fatPerKg: undefined })} />}
              <p>
                0.5–1.5 g/kg (<Source s="iraki" />
                ); 15–30% of calories (<Source s="helms" />
                ).
              </p>
            </Step>
            <Step n={6} title="Carbohydrate" value={`${fmtInt(r.carbsG)} g`}>
              <p>
                ({fmtInt(r.kcal)} − 4 × {fmtInt(r.proteinG)} − 9 × {fmtInt(r.fatG)}) ÷ 4 = {fmt1(r.carbsPerKg)} g/kg
              </p>
              <p>
                At least 3–5 g/kg supports training (<Source s="iraki" />
                ); the app warns below 3.
              </p>
            </Step>
          </div>
        )}
      </div>
    </div>
  )
}
