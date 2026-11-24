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
import { IconChevronDown, IconWarn } from '../../ui/icons'
import { Button, cx, NumberInput, Toggle } from '../../ui/kit'

const SOURCES = {
  frankenfield: { label: 'Frankenfield 2005', href: 'https://pure.psu.edu/en/publications/comparison-of-predictive-equations-for-resting-metabolic-rate-in-/' },
  iraki: { label: 'Iraki 2019', href: 'https://pubmed.ncbi.nlm.nih.gov/31247944/' },
  helms: { label: 'Helms 2014', href: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4033492/' },
  morton: { label: 'Morton 2018', href: 'https://pubmed.ncbi.nlm.nih.gov/28698222/' },
}

function Source({ s }: { s: keyof typeof SOURCES }) {
  return (
    <a href={SOURCES[s].href} target="_blank" rel="noreferrer" className="font-medium text-accent underline-offset-2 active:underline">
      {SOURCES[s].label}
    </a>
  )
}

function SetByYou({ onReset }: { onReset: () => void }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">set by you</span>
      <button type="button" onClick={onReset} className="text-xs font-semibold text-muted underline">
        reset
      </button>
    </span>
  )
}

function Step({ n, title, value, children }: { n: number; title: string; value: ReactNode; children: ReactNode }) {
  return (
    <div className="border-t border-line py-4 first:border-t-0">
      <div className="flex items-baseline gap-3">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-sunken text-xs font-bold text-muted">{n}</span>
        <span className="flex-1 font-semibold">{title}</span>
        <span className="font-semibold tabular-nums">{value}</span>
      </div>
      <div className="mt-2 space-y-2 pl-9 text-sm text-muted">{children}</div>
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

/** Large calorie figure, the macro split, warnings and the expandable "Why these numbers". */
export function TargetsEditor({ inputs, onChange, defaultOpen = false }: { inputs: TargetInputs; onChange: (i: TargetInputs) => void; defaultOpen?: boolean }) {
  const r: TargetResult = calculateTargets(inputs)
  const [open, setOpen] = useState(defaultOpen)
  const [editKcal, setEditKcal] = useState(false)
  const goal = GOALS[inputs.goal]
  const set = (patch: Partial<TargetInputs>) => onChange({ ...inputs, ...patch })
  const kcalFrom = { p: r.proteinG * 4, c: r.carbsG * 4, f: r.fatG * 9 }
  const kcalTotal = Math.max(1, kcalFrom.p + kcalFrom.c + kcalFrom.f)
  const level = activityLevelFor(inputs.activityFactor)

  return (
    <div className="space-y-4">
      <div className="rounded-3xl bg-surface p-5 text-center">
        <p className="text-sm font-medium text-muted">Daily target</p>
        {editKcal ? (
          <div className="mx-auto mt-2 flex max-w-60 items-center gap-2">
            <NumberInput value={r.kcal} integer unit="kcal" autoFocus ariaLabel="Calorie target" onChange={(n) => n != null && n >= 800 && n <= 6000 && set({ kcalOverride: n })} />
            <Button size="sm" variant="secondary" onClick={() => setEditKcal(false)}>
              Done
            </Button>
          </div>
        ) : (
          <button type="button" onClick={() => setEditKcal(true)} className="mt-1 text-5xl font-bold tracking-tight tabular-nums">
            {fmtInt(r.kcal)}
            <span className="ml-1 text-lg font-semibold text-muted">kcal</span>
          </button>
        )}
        <div className="mt-2 flex justify-center">{r.setByYou.kcal ? <SetByYou onReset={() => set({ kcalOverride: undefined })} /> : <span className="text-xs text-faint">Tap the number to set it yourself</span>}</div>

        <div className="mt-5 flex h-3 overflow-hidden rounded-full" aria-hidden>
          <span style={{ width: `${(kcalFrom.p / kcalTotal) * 100}%`, background: 'var(--protein)' }} />
          <span style={{ width: `${(kcalFrom.c / kcalTotal) * 100}%`, background: 'var(--carbs)' }} />
          <span style={{ width: `${(kcalFrom.f / kcalTotal) * 100}%`, background: 'var(--fat)' }} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-left">
          {[
            { label: 'Protein', g: r.proteinG, perKg: r.proteinG / inputs.weightKg, color: 'var(--protein)', share: kcalFrom.p },
            { label: 'Carbs', g: r.carbsG, perKg: r.carbsPerKg, color: 'var(--carbs)', share: kcalFrom.c },
            { label: 'Fat', g: r.fatG, perKg: r.fatG / inputs.weightKg, color: 'var(--fat)', share: kcalFrom.f },
          ].map((m) => (
            <div key={m.label} className="rounded-2xl bg-sunken px-3 py-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                <span className="size-2 rounded-full" style={{ background: m.color }} />
                {m.label}
              </div>
              <div className="text-xl font-bold tabular-nums">
                {fmtInt(m.g)}
                <span className="text-sm font-semibold text-muted"> g</span>
              </div>
              <div className="text-xs tabular-nums text-faint">
                {fmt1(m.perKg)} g/kg · {Math.round((m.share / kcalTotal) * 100)}%
              </div>
            </div>
          ))}
        </div>
      </div>

      {r.warnings.map((w) => (
        <div key={w.code} className="flex gap-3 rounded-2xl bg-warn-soft px-4 py-3 text-sm text-warn">
          <IconWarn size={18} className="mt-0.5 shrink-0" />
          <span>{w.message}</span>
        </div>
      ))}

      <div className="rounded-3xl bg-surface">
        <button type="button" onClick={() => setOpen(!open)} className="flex min-h-14 w-full items-center justify-between px-5 font-semibold" aria-expanded={open}>
          Why these numbers
          <IconChevronDown className={cx('text-muted transition-transform', open && 'rotate-180')} />
        </button>
        {open && (
          <div className="px-5 pb-3">
            <Step n={1} title="Resting energy" value={`${fmtInt(r.restingKcal)} kcal`}>
              {r.method === 'mifflin' ? (
                <p className="tabular-nums">
                  Mifflin-St Jeor: 10 × {fmt2(inputs.weightKg)} kg + 6.25 × {fmt2(inputs.heightCm)} cm − 5 × {inputs.ageYears} years {inputs.sex === 'male' ? '+ 5' : '− 161'}
                </p>
              ) : (
                <p className="tabular-nums">
                  Katch-McArdle: 370 + 21.6 × {fmt1(inputs.weightKg * (1 - (inputs.bodyFatPct ?? 0) / 100))} kg lean mass
                </p>
              )}
              <p>
                Most often within 10% of measured values among the equations compared (<Source s="frankenfield" />
                ).
              </p>
              {inputs.bodyFatPct != null && (
                <div className="-mx-4 rounded-2xl bg-sunken">
                  <Toggle label="Use lean mass" hint={`From your body-fat reading of ${fmt1(inputs.bodyFatPct)}%`} checked={inputs.useLeanMass} onChange={(v) => set({ useLeanMass: v })} />
                </div>
              )}
            </Step>
            <Step n={2} title="Maintenance" value={`${fmtInt(r.maintenanceKcal)} kcal`}>
              <p className="tabular-nums">
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
              <p className="tabular-nums">
                {fmt1(r.proteinPerKg)} g/kg × {fmt2(inputs.weightKg)} kg
              </p>
              <Slider label="Protein per kg" value={r.proteinPerKg} min={PROTEIN_RANGE[0]} max={PROTEIN_RANGE[1]} step={0.1} onChange={(v) => set({ proteinPerKg: Math.round(v * 10) / 10 === goal.proteinPerKg ? undefined : Math.round(v * 10) / 10 })} />
              {r.setByYou.proteinPerKg && <SetByYou onReset={() => set({ proteinPerKg: undefined })} />}
              <p>
                No further lean-mass gain above about 1.6 g/kg on average (<Source s="morton" />
                ); more in a deficit (<Source s="helms" />
                ).
              </p>
            </Step>
            <Step n={5} title="Fat" value={`${fmtInt(r.fatG)} g`}>
              <p className="tabular-nums">
                {fmt2(r.fatPerKg)} g/kg × {fmt2(inputs.weightKg)} kg, never below 0.5 g/kg
              </p>
              <Slider label="Fat per kg" value={r.fatPerKg} min={FAT_RANGE[0]} max={FAT_RANGE[1]} step={0.05} onChange={(v) => set({ fatPerKg: Math.round(v * 100) / 100 === goal.fatPerKg ? undefined : Math.round(v * 100) / 100 })} />
              {r.setByYou.fatPerKg && <SetByYou onReset={() => set({ fatPerKg: undefined })} />}
              <p>
                0.5–1.5 g/kg (<Source s="iraki" />
                ); 15–30% of calories (<Source s="helms" />
                ).
              </p>
            </Step>
            <Step n={6} title="Carbohydrate" value={`${fmtInt(r.carbsG)} g`}>
              <p className="tabular-nums">
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
