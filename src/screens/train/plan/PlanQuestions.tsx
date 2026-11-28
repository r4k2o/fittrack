// The questions on one scrolling screen. Every answer can be changed later.

import type { ReactNode } from 'react'
import type { Joint } from '../../../db'
import {
  DAYS_OPTIONS,
  EQUIPMENT_CHOICES,
  excludedGroups,
  JOINT_LABEL,
  JOINTS,
  MINUTES_OPTIONS,
  PLAN_GOALS,
  REGION_LABEL,
  REGIONS,
  splitFor,
  type EquipmentChoice,
  type PlanAnswers,
  type PlanGoal,
  type Region,
} from '../../../lib/planner'
import { GROUP_LABEL, GROUPS, WEEKDAY_SHORT } from '../../../lib/volume'
import { IconCheck } from '../../../ui/icons'
import { Chip, cx, Segmented } from '../../../ui/kit'

function Question({ n, title, hint, children }: { n: number; title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="card p-4" aria-labelledby={`q${n}`}>
      <div className="mb-3">
        <h2 id={`q${n}`} className="text-[17px] font-semibold tracking-[-0.01em]">
          {title}
        </h2>
        {hint && <p className="mt-0.5 text-[13px] text-ink-2">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

function Choices<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string; hint: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" className="-mx-1 space-y-1">
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cx('press flex w-full items-center gap-3 rounded-[16px] px-3 py-2.5 text-left transition-colors', on ? 'bg-fill' : 'active:bg-fill')}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-semibold">{o.label}</span>
              <span className="block text-[13px] text-ink-2">{o.hint}</span>
            </span>
            <span className={cx('flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors', on ? 'btn-accent border-transparent' : 'border-line')}>
              {on && <IconCheck size={14} strokeWidth={3.2} className="animate-pop" />}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function PlanQuestions({ value, onChange }: { value: PlanAnswers; onChange: (v: PlanAnswers) => void }) {
  const set = <K extends keyof PlanAnswers>(k: K, v: PlanAnswers[K]) => onChange({ ...value, [k]: v })
  const toggleJoint = (j: Joint) => set('injuries', value.injuries.includes(j) ? value.injuries.filter((x) => x !== j) : [...value.injuries, j])
  const exclude = value.exclude ?? []
  const toggleRegion = (r: Region) => {
    const next = exclude.includes(r) ? exclude.filter((x) => x !== r) : [...exclude, r]
    const out = excludedGroups(next)
    // priorities in a left-out region make no sense any more
    onChange({ ...value, exclude: next, priority: value.priority.filter((g) => !out.has(g)), weekdays: undefined })
  }
  const split = splitFor(value)
  const out = excludedGroups(exclude)
  return (
    <div className="space-y-3">
      <Question n={1} title="Tage pro Woche" hint={`${split.label}: ${split.weekdays.map((d) => WEEKDAY_SHORT[d]).join(', ')}`}>
        <Segmented
          value={value.daysPerWeek}
          options={DAYS_OPTIONS.map((d) => ({ value: d as number, label: String(d) }))}
          onChange={(d) => onChange({ ...value, daysPerWeek: d, weekdays: undefined })}
        />
        {split.note && <p className="mt-2 text-[13px] text-ink-2">{split.note}</p>}
      </Question>

      <Question n={2} title="Minuten pro Einheit" hint="Mit Aufwärmen und Pausen">
        <Segmented value={value.minutes} options={MINUTES_OPTIONS.map((m) => ({ value: m as number, label: String(m) }))} onChange={(m) => set('minutes', m)} />
      </Question>

      <Question n={3} title="Trainingserfahrung" hint="Jahre mit regelmäßigem Training">
        <Segmented
          value={value.experience}
          options={[
            { value: 'beginner', label: 'Unter 1' },
            { value: 'intermediate', label: '1–3' },
            { value: 'advanced', label: 'Über 3' },
          ]}
          onChange={(e) => set('experience', e)}
        />
      </Question>

      <Question n={4} title="Geräte">
        <Choices<EquipmentChoice>
          value={value.equipment}
          options={(Object.keys(EQUIPMENT_CHOICES) as EquipmentChoice[]).map((k) => ({ value: k, label: EQUIPMENT_CHOICES[k].label, hint: EQUIPMENT_CHOICES[k].hint }))}
          onChange={(e) => set('equipment', e)}
        />
      </Question>

      <Question n={5} title="Was möchtest du nicht trainieren?" hint="Ohne Beine wird es zum Beispiel ein reiner Oberkörperplan.">
        <div className="flex flex-wrap gap-2">
          <Chip active={exclude.length === 0} onClick={() => onChange({ ...value, exclude: [], weekdays: undefined })}>
            Alles trainieren
          </Chip>
          {REGIONS.map((r) => {
            const on = exclude.includes(r)
            const last = !on && exclude.length >= REGIONS.length - 1
            return (
              <Chip key={r} active={on} className={last ? 'opacity-40' : undefined} onClick={() => !last && toggleRegion(r)}>
                {on && <IconCheck size={14} strokeWidth={3} />}
                {REGION_LABEL[r]}
              </Chip>
            )
          })}
        </div>
      </Question>

      <Question n={6} title="Verletzungen oder Schmerzen" hint="Übungen, die diese Gelenke belasten, fallen weg">
        <div className="flex flex-wrap gap-2">
          <Chip active={value.injuries.length === 0} onClick={() => set('injuries', [])}>
            Keine
          </Chip>
          {JOINTS.map((j) => (
            <Chip key={j} active={value.injuries.includes(j)} onClick={() => toggleJoint(j)}>
              {JOINT_LABEL[j]}
            </Chip>
          ))}
        </div>
      </Question>

      <Question n={7} title="Ziel">
        <Choices<PlanGoal>
          value={value.goal}
          options={(Object.keys(PLAN_GOALS) as PlanGoal[]).map((k) => ({ value: k, label: PLAN_GOALS[k].label, hint: PLAN_GOALS[k].hint }))}
          onChange={(g) => set('goal', g)}
        />
      </Question>

      <Question n={8} title="Schwerpunkte" hint="Optional, bis zu zwei: je 3 Sätze mehr pro Woche">
        <div className="flex flex-wrap gap-2">
          {GROUPS.filter((g) => !out.has(g)).map((g) => {
            const on = value.priority.includes(g)
            const full = !on && value.priority.length >= 2
            return (
              <Chip
                key={g}
                active={on}
                className={full ? 'opacity-40' : undefined}
                onClick={() => {
                  if (on) set('priority', value.priority.filter((x) => x !== g))
                  else if (!full) set('priority', [...value.priority, g])
                }}
              >
                {GROUP_LABEL[g]}
              </Chip>
            )
          })}
        </div>
      </Question>
    </div>
  )
}
