// The seven questions on one scrolling screen. Every answer can be changed later.

import type { ReactNode } from 'react'
import type { Joint } from '../../../db'
import {
  DAYS_OPTIONS,
  DEFAULT_WEEKDAYS,
  EQUIPMENT_CHOICES,
  JOINT_LABEL,
  JOINTS,
  MINUTES_OPTIONS,
  PLAN_GOALS,
  SPLITS,
  type EquipmentChoice,
  type PlanAnswers,
  type PlanGoal,
} from '../../../lib/planner'
import { GROUP_LABEL, GROUPS, WEEKDAY_SHORT } from '../../../lib/volume'
import { IconCheck } from '../../../ui/icons'
import { Chip, cx, Segmented } from '../../../ui/kit'

function Question({ n, title, hint, children }: { n: number; title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="card p-4" aria-labelledby={`q${n}`}>
      <div className="mb-3 flex items-baseline gap-2">
        <span className="text-[13px] font-bold tabular-nums text-ink-3">{n}</span>
        <div className="min-w-0">
          <h2 id={`q${n}`} className="text-[17px] font-bold tracking-tight">
            {title}
          </h2>
          {hint && <p className="text-[13px] text-ink-2">{hint}</p>}
        </div>
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
            className={cx('press flex w-full items-center gap-3 rounded-[18px] px-3 py-2.5 text-left transition-colors', on ? 'bg-fill' : 'active:bg-fill')}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-semibold">{o.label}</span>
              <span className="block text-[13px] text-ink-2">{o.hint}</span>
            </span>
            <span className={cx('flex size-6 shrink-0 items-center justify-center rounded-full border-2', on ? 'border-transparent btn-primary' : 'border-line')}>
              {on && <IconCheck size={14} strokeWidth={3.2} />}
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
  const days = DEFAULT_WEEKDAYS[value.daysPerWeek] ?? []
  return (
    <div className="space-y-3">
      <Question n={1} title="Days per week" hint={`${SPLITS[value.daysPerWeek]?.label}: ${days.map((d) => WEEKDAY_SHORT[d]).join(', ')}`}>
        <Segmented
          value={value.daysPerWeek}
          options={DAYS_OPTIONS.map((d) => ({ value: d as number, label: String(d) }))}
          onChange={(d) => onChange({ ...value, daysPerWeek: d, weekdays: undefined })}
        />
      </Question>

      <Question n={2} title="Minutes per session" hint="Warm-up and rests included">
        <Segmented value={value.minutes} options={MINUTES_OPTIONS.map((m) => ({ value: m as number, label: String(m) }))} onChange={(m) => set('minutes', m)} />
      </Question>

      <Question n={3} title="Training experience" hint="Years of consistent training">
        <Segmented
          value={value.experience}
          options={[
            { value: 'beginner', label: 'Under 1' },
            { value: 'intermediate', label: '1–3' },
            { value: 'advanced', label: 'Over 3' },
          ]}
          onChange={(e) => set('experience', e)}
        />
      </Question>

      <Question n={4} title="Equipment">
        <Choices<EquipmentChoice>
          value={value.equipment}
          options={(Object.keys(EQUIPMENT_CHOICES) as EquipmentChoice[]).map((k) => ({ value: k, label: EQUIPMENT_CHOICES[k].label, hint: EQUIPMENT_CHOICES[k].hint }))}
          onChange={(e) => set('equipment', e)}
        />
      </Question>

      <Question n={5} title="Injuries or pain" hint="Exercises that load these joints are left out">
        <div className="flex flex-wrap gap-2">
          <Chip active={value.injuries.length === 0} onClick={() => set('injuries', [])}>
            None
          </Chip>
          {JOINTS.map((j) => (
            <Chip key={j} active={value.injuries.includes(j)} onClick={() => toggleJoint(j)}>
              {JOINT_LABEL[j]}
            </Chip>
          ))}
        </div>
      </Question>

      <Question n={6} title="Goal">
        <Choices<PlanGoal>
          value={value.goal}
          options={(Object.keys(PLAN_GOALS) as PlanGoal[]).map((k) => ({ value: k, label: PLAN_GOALS[k].label, hint: PLAN_GOALS[k].hint }))}
          onChange={(g) => set('goal', g)}
        />
      </Question>

      <Question n={7} title="Priority muscles" hint="Optional, up to two: 3 extra sets a week each">
        <div className="flex flex-wrap gap-2">
          {GROUPS.map((g) => {
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
