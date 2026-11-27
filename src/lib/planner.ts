// The training plan generator: seven answers become a split, a weekly schedule and a
// prescription per exercise. It is a deterministic rule engine that runs offline:
//
// 1. Weekly volume: 10 hard sets per group for beginners, 12 for intermediates, 14 for
//    advanced lifters (10 on a cut), 3 more for up to two priority groups, never above
//    20. Assisting sets count half (see volume.ts).
// 2. Each session fills movement slots (squat, hinge, pushes, pulls) with the best-ranked
//    exercise that fits the equipment and avoids flagged joints, then adds isolation
//    work where weekly sets fall short of the target.
// 3. Time: 3 minutes per compound set, 2 per isolation set, 5 minutes of warm-up. When
//    a session runs over, opposing muscles are paired as supersets first, then sets
//    and exercises are cut, and the plan says what it cut.
// 4. Sessions for the same muscle sit at least 48 hours apart on the default weekdays.
// 5. Main compounds 6–10 reps, other compounds 8–12, isolation 10–15, with 1–3 reps in
//    reserve and 2–3 minutes' rest on compounds, 1–2 on isolation. A strength focus puts
//    one heavy lift of 3–6 reps first in every session.

import type { Equipment, Exercise, Experience, Joint } from '../db'
import { DEFAULT_LOAD_STEP } from './training'
import {
  addCredits,
  countsAsCompound,
  emptyVolume,
  GROUP_LABEL,
  GROUPS,
  groupCredits,
  OPPOSING,
  primaryGroups,
  sessionMinutes,
  VOLUME_CEILING,
  weekdayGap,
  type Group,
  type Volume,
} from './volume'

export const GENERATOR_VERSION = 1

export type EquipmentChoice = 'full' | 'barbell' | 'dumbbell' | 'machines' | 'bodyweight'
export type PlanGoal = 'muscle' | 'strength' | 'cut'
export type DayKind = 'full' | 'upper' | 'lower' | 'push' | 'pull' | 'legs'
export type Slot = 'squat' | 'lunge' | 'hinge' | 'hip' | 'hpush' | 'incline' | 'vpush' | 'hpull' | 'vpull'
export type SplitKey = 'full-body' | 'upper-lower' | 'upper-lower-ppl' | 'ppl' | 'upper' | 'push-pull' | 'lower'
/** Body regions a plan can leave out entirely, e.g. no legs gives an upper-body plan. */
export type Region = 'legs' | 'chest' | 'back' | 'shoulders' | 'arms' | 'abs'
export type Role = 'main' | 'compound' | 'accessory'

export interface PlanAnswers {
  daysPerWeek: number
  minutes: number
  experience: Experience
  equipment: EquipmentChoice
  injuries: Joint[]
  goal: PlanGoal
  /** Up to two groups that get 3 extra weekly sets. */
  priority: Group[]
  /** Regions to leave out: no target, no direct work, and a split without them. */
  exclude?: Region[]
  /** One weekday per training day, 0 = Monday. The default spreads the days 48 hours apart. */
  weekdays?: number[]
}

export type PlannerExercise = Pick<
  Exercise,
  'id' | 'name' | 'primary' | 'secondary' | 'equipment' | 'pattern' | 'jointStress' | 'compound' | 'unit' | 'level'
>

export interface PlannedExercise {
  /** Identifies the row within the generated plan; supersets refer to it. */
  key: string
  exerciseId: string
  sets: number
  repMin: number
  repMax: number
  targetRir: number
  restSec: number
  pairWith: string | null
  role: Role
}

export interface PlannedDay {
  name: string
  kind: DayKind
  weekday: number
  exercises: PlannedExercise[]
  minutes: number
}

export type NoteKind = 'shortfall' | 'cut' | 'superset' | 'injury' | 'strength' | 'ceiling'

export interface PlanNote {
  kind: NoteKind
  group?: Group
  text: string
}

export interface GeneratedPlan {
  name: string
  split: SplitKey
  daysPerWeek: number
  answers: PlanAnswers
  generatorVersion: number
  days: PlannedDay[]
  volume: Volume
  targets: Volume
  notes: PlanNote[]
}

// ---- Questionnaire options ------------------------------------------------------------

export const DAYS_OPTIONS = [2, 3, 4, 5, 6] as const
export const MINUTES_OPTIONS = [30, 45, 60, 75, 90] as const

export const EXPERIENCE_OPTIONS: readonly { value: Experience; label: string }[] = [
  { value: 'beginner', label: 'Unter 1 Jahr' },
  { value: 'intermediate', label: '1–3 Jahre' },
  { value: 'advanced', label: 'Über 3 Jahre' },
]

export const EQUIPMENT_CHOICES: Record<EquipmentChoice, { label: string; hint: string; allowed: readonly Equipment[] }> = {
  full: {
    label: 'Fitnessstudio',
    hint: 'Langhanteln, Kurzhanteln, Kabelzug, Maschinen',
    allowed: ['barbell', 'ezbar', 'trapbar', 'dumbbell', 'kettlebell', 'cable', 'machine', 'smith', 'bodyweight', 'band', 'other'],
  },
  barbell: { label: 'Langhantel und Rack', hint: 'Dazu Bank, Klimmzugstange, Bänder', allowed: ['barbell', 'ezbar', 'bodyweight', 'band'] },
  dumbbell: { label: 'Kurzhanteln und Bank', hint: 'Dazu Kettlebells, Körpergewicht, Bänder', allowed: ['dumbbell', 'kettlebell', 'bodyweight', 'band'] },
  machines: { label: 'Nur Maschinen', hint: 'Maschinen, Kabelzug, Multipresse', allowed: ['machine', 'cable', 'smith'] },
  bodyweight: { label: 'Körpergewicht und Bänder', hint: 'Zuhause oder unterwegs', allowed: ['bodyweight', 'band'] },
}

export const PLAN_GOALS: Record<PlanGoal, { label: string; hint: string }> = {
  muscle: { label: 'Muskelaufbau', hint: 'Sätze nach Erfahrung, 6–15 Wiederholungen' },
  strength: { label: 'Kraft', hint: 'Zuerst eine schwere Übung mit 3–6 Wiederholungen' },
  cut: { label: 'Muskeln halten in der Diät', hint: 'Weniger Volumen: 10 Sätze pro Woche' },
}

export const JOINTS: readonly Joint[] = ['shoulder', 'elbow', 'wrist', 'lowerBack', 'hip', 'knee']

export const JOINT_LABEL: Record<Joint, string> = {
  shoulder: 'Schulter',
  elbow: 'Ellbogen',
  wrist: 'Handgelenk',
  lowerBack: 'Unterer Rücken',
  hip: 'Hüfte',
  knee: 'Knie',
}

export const REGIONS: readonly Region[] = ['legs', 'chest', 'back', 'shoulders', 'arms', 'abs']

export const REGION_LABEL: Record<Region, string> = {
  legs: 'Beine',
  chest: 'Brust',
  back: 'Rücken',
  shoulders: 'Schultern',
  arms: 'Arme',
  abs: 'Bauch',
}

export const REGION_GROUPS: Record<Region, readonly Group[]> = {
  legs: ['quads', 'hamstrings', 'glutes', 'calves'],
  chest: ['chest'],
  back: ['back'],
  shoulders: ['shoulders'],
  arms: ['biceps', 'triceps'],
  abs: ['abs'],
}

export function excludedGroups(exclude: readonly Region[] | undefined): Set<Group> {
  return new Set((exclude ?? []).flatMap((r) => REGION_GROUPS[r]))
}

/** Default weekdays (0 = Monday): every pair of sessions for the same muscle 48 hours apart. */
export const DEFAULT_WEEKDAYS: Record<number, readonly number[]> = {
  2: [0, 3],
  3: [0, 2, 4],
  4: [0, 1, 3, 4],
  5: [0, 1, 2, 4, 5],
  6: [0, 1, 2, 3, 4, 5],
}

export const PRIORITY_EXTRA_SETS = 3
const MAX_SETS_PER_EXERCISE = 4
const MAX_DIRECT_SETS_PER_SESSION = 10

// ---- Splits ---------------------------------------------------------------------------

interface DayTemplate {
  name: string
  kind: DayKind
  slots: readonly Slot[]
}

const FULL_A: DayTemplate = { name: 'Ganzkörper A', kind: 'full', slots: ['squat', 'hpush', 'hpull', 'vpush', 'hinge'] }
const FULL_B: DayTemplate = { name: 'Ganzkörper B', kind: 'full', slots: ['hinge', 'vpull', 'incline', 'lunge', 'hpull'] }
const FULL_C: DayTemplate = { name: 'Ganzkörper C', kind: 'full', slots: ['hpush', 'squat', 'vpull', 'vpush', 'hip'] }
const UPPER_A: DayTemplate = { name: 'Oberkörper A', kind: 'upper', slots: ['hpush', 'hpull', 'vpush', 'vpull'] }
const LOWER_A: DayTemplate = { name: 'Unterkörper A', kind: 'lower', slots: ['squat', 'hinge', 'lunge'] }
const UPPER_B: DayTemplate = { name: 'Oberkörper B', kind: 'upper', slots: ['vpush', 'vpull', 'incline', 'hpull'] }
const LOWER_B: DayTemplate = { name: 'Unterkörper B', kind: 'lower', slots: ['hinge', 'squat', 'hip'] }
const PUSH_A: DayTemplate = { name: 'Push A', kind: 'push', slots: ['hpush', 'vpush', 'incline'] }
const PULL_A: DayTemplate = { name: 'Pull A', kind: 'pull', slots: ['vpull', 'hpull'] }
const LEGS_A: DayTemplate = { name: 'Beine A', kind: 'legs', slots: ['squat', 'hinge', 'lunge'] }
const PUSH_B: DayTemplate = { name: 'Push B', kind: 'push', slots: ['vpush', 'incline', 'hpush'] }
const PULL_B: DayTemplate = { name: 'Pull B', kind: 'pull', slots: ['hpull', 'vpull'] }
const LEGS_B: DayTemplate = { name: 'Beine B', kind: 'legs', slots: ['hinge', 'squat', 'hip'] }
const UPPER_C: DayTemplate = { name: 'Oberkörper C', kind: 'upper', slots: ['incline', 'hpull', 'vpush', 'vpull'] }
const LOWER_C: DayTemplate = { name: 'Unterkörper C', kind: 'lower', slots: ['squat', 'hip', 'lunge'] }
const PUSH_C: DayTemplate = { name: 'Push C', kind: 'push', slots: ['incline', 'hpush', 'vpush'] }

export const SPLITS: Record<number, { key: SplitKey; label: string; days: readonly DayTemplate[] }> = {
  2: { key: 'full-body', label: 'Ganzkörper', days: [FULL_A, FULL_B] },
  3: { key: 'full-body', label: 'Ganzkörper', days: [FULL_A, FULL_B, FULL_C] },
  4: { key: 'upper-lower', label: 'Ober- / Unterkörper', days: [UPPER_A, LOWER_A, UPPER_B, LOWER_B] },
  5: {
    key: 'upper-lower-ppl',
    label: 'Ober-, Unterkörper, Push, Pull, Beine',
    days: [
      { ...UPPER_A, name: 'Oberkörper' },
      { ...LOWER_A, name: 'Unterkörper' },
      { ...PUSH_B, name: 'Push' },
      { ...PULL_A, name: 'Pull' },
      { ...LEGS_B, name: 'Beine' },
    ],
  },
  6: { key: 'ppl', label: 'Push, Pull, Beine', days: [PUSH_A, PULL_A, LEGS_A, PUSH_B, PULL_B, LEGS_B] },
}

type Split = { key: SplitKey; label: string; days: readonly DayTemplate[]; weekdays: readonly number[]; note?: string }

/** Upper body only (legs left out): full upper days up to three a week, then push and pull alternating. */
const UPPER_SPLITS: Record<number, Split> = {
  2: { key: 'upper', label: 'Oberkörper', days: [UPPER_A, UPPER_B], weekdays: [0, 3] },
  3: { key: 'upper', label: 'Oberkörper', days: [UPPER_A, UPPER_B, UPPER_C], weekdays: [0, 2, 4] },
  4: { key: 'push-pull', label: 'Push / Pull', days: [PUSH_A, PULL_A, PUSH_B, PULL_B], weekdays: [0, 1, 3, 4] },
  5: { key: 'push-pull', label: 'Push / Pull', days: [PUSH_A, PULL_A, PUSH_B, PULL_B, PUSH_C], weekdays: [0, 1, 2, 3, 4] },
  6: { key: 'push-pull', label: 'Push / Pull', days: [PUSH_A, PULL_A, PUSH_B, PULL_B, PUSH_C, { ...PULL_A, name: 'Pull C' }], weekdays: [0, 1, 2, 3, 4, 5] },
}

/** Legs only: more than three days a week leave no 48 hours between sessions. */
const LOWER_SPLITS: Record<number, Split> = {
  2: { key: 'lower', label: 'Unterkörper', days: [LOWER_A, LOWER_B], weekdays: [0, 3] },
  3: { key: 'lower', label: 'Unterkörper', days: [LOWER_A, LOWER_B, LOWER_C], weekdays: [0, 2, 4] },
}

/** The split for the answers: full, upper-only when legs are left out, lower-only when the upper body is. */
export function splitFor(a: Pick<PlanAnswers, 'daysPerWeek' | 'exclude'>): Split {
  const out = new Set(a.exclude ?? [])
  const upperOut = out.has('chest') && out.has('back') && out.has('shoulders') && out.has('arms')
  if (out.has('legs') && !upperOut) return UPPER_SPLITS[a.daysPerWeek]
  if (upperOut && !out.has('legs')) {
    const s = LOWER_SPLITS[Math.min(3, a.daysPerWeek)]
    return a.daysPerWeek > 3 ? { ...s, note: 'Nur Beine: Mehr als 3 Einheiten pro Woche ließen keine 48 Stunden Pause, daher 3.' } : s
  }
  return { ...SPLITS[a.daysPerWeek], weekdays: DEFAULT_WEEKDAYS[a.daysPerWeek] }
}

/** Which group a movement slot is for; a slot is skipped when its group is left out. */
const SLOT_GROUP: Record<Slot, Group> = {
  squat: 'quads',
  lunge: 'quads',
  hinge: 'hamstrings',
  hip: 'glutes',
  hpush: 'chest',
  incline: 'chest',
  vpush: 'shoulders',
  hpull: 'back',
  vpull: 'back',
}

const KIND_GROUPS: Record<DayKind, ReadonlySet<Group>> = {
  full: new Set(GROUPS),
  upper: new Set(['chest', 'back', 'shoulders', 'biceps', 'triceps', 'abs']),
  lower: new Set(['quads', 'hamstrings', 'glutes', 'calves', 'abs']),
  push: new Set(['chest', 'shoulders', 'triceps', 'abs']),
  pull: new Set(['back', 'biceps', 'shoulders', 'abs']),
  legs: new Set(['quads', 'hamstrings', 'glutes', 'calves', 'abs']),
}

// ---- Exercise ranking -------------------------------------------------------------------

const ids = (list: readonly string[]): readonly string[] => list.map((id) => (id.startsWith('ft:') ? id : `fedb:${id}`))

/** Best first. A slot takes the first candidate that fits; later weeks' days rotate through. */
const SLOT_CANDIDATES: Record<Slot, readonly string[]> = {
  squat: ids(['Barbell_Squat', 'Hack_Squat', 'Leg_Press', 'Smith_Machine_Squat', 'Goblet_Squat', 'Dumbbell_Squat', 'Box_Squat', 'Front_Barbell_Squat', 'Squats_-_With_Bands', 'Bodyweight_Squat']),
  lunge: ids([
    'ft:bulgarian_split_squat',
    'Split_Squat_with_Dumbbells',
    'Dumbbell_Rear_Lunge',
    'Dumbbell_Lunges',
    'Barbell_Lunge',
    'Barbell_Walking_Lunge',
    'Dumbbell_Step_Ups',
    'ft:leg_press_single_leg',
    'ft:bodyweight_split_squat',
    'ft:bodyweight_reverse_lunge',
  ]),
  hinge: ids([
    'Romanian_Deadlift',
    'Barbell_Deadlift',
    'Stiff-Legged_Dumbbell_Deadlift',
    'Trap_Bar_Deadlift',
    'Stiff-Legged_Barbell_Deadlift',
    'Good_Morning',
    'ft:kettlebell_swing',
    'Pull_Through',
    'Hyperextensions_Back_Extensions',
    'ft:single_leg_rdl',
    'Band_Good_Morning',
  ]),
  hip: ids(['Barbell_Hip_Thrust', 'ft:machine_hip_thrust', 'ft:dumbbell_hip_thrust', 'Barbell_Glute_Bridge', 'Pull_Through', 'Butt_Lift_Bridge', 'Single_Leg_Glute_Bridge']),
  hpush: ids([
    'Barbell_Bench_Press_-_Medium_Grip',
    'Dumbbell_Bench_Press',
    'Machine_Bench_Press',
    'Leverage_Chest_Press',
    'Smith_Machine_Bench_Press',
    'Cable_Chest_Press',
    'Pushups',
    'Dips_-_Chest_Version',
    'Dumbbell_Bench_Press_with_Neutral_Grip',
    'Push-Ups_With_Feet_Elevated',
    'Bench_Press_-_With_Bands',
    'Incline_Push-Up',
    'Dumbbell_Floor_Press',
    'Floor_Press',
  ]),
  incline: ids(['Incline_Dumbbell_Press', 'Barbell_Incline_Bench_Press_-_Medium_Grip', 'Leverage_Incline_Chest_Press', 'Smith_Machine_Incline_Bench_Press', 'Push-Ups_With_Feet_Elevated']),
  vpush: ids([
    'Dumbbell_Shoulder_Press',
    'Standing_Military_Press',
    'Machine_Shoulder_Military_Press',
    'Seated_Barbell_Military_Press',
    'Smith_Machine_Overhead_Shoulder_Press',
    'Arnold_Dumbbell_Press',
    'Standing_Dumbbell_Press',
    'ft:landmine_press',
    'ft:pike_push_up',
    'Shoulder_Press_-_With_Bands',
    'Handstand_Push-Ups',
  ]),
  hpull: ids([
    'Seated_Cable_Rows',
    'Bent_Over_Barbell_Row',
    'Dumbbell_Incline_Row',
    'One-Arm_Dumbbell_Row',
    'Leverage_Iso_Row',
    'Lying_T-Bar_Row',
    'T-Bar_Row_with_Handle',
    'ft:pendlay_row',
    'Seated_One-arm_Cable_Pulley_Rows',
    'Smith_Machine_Bent_Over_Row',
    'Inverted_Row_with_Straps',
    'ft:band_row',
    'Bent_Over_Two-Dumbbell_Row',
    'Leverage_High_Row',
  ]),
  vpull: ids([
    'Wide-Grip_Lat_Pulldown',
    'Pullups',
    'Chin-Up',
    'ft:assisted_pull_up_machine',
    'Close-Grip_Front_Lat_Pulldown',
    'Underhand_Cable_Pulldowns',
    'V-Bar_Pulldown',
    'One_Arm_Lat_Pulldown',
    'Band_Assisted_Pull-Up',
    'ft:band_lat_pulldown',
    'Weighted_Pull_Ups',
  ]),
}

/** The heavy first lift of a strength-focus session: barbell lifts before the rest. */
const STRENGTH_MAIN: Partial<Record<Slot, readonly string[]>> = {
  squat: ids(['Barbell_Squat', 'Box_Squat', 'Front_Barbell_Squat', 'Smith_Machine_Squat']),
  hinge: ids(['Barbell_Deadlift', 'Trap_Bar_Deadlift', 'Sumo_Deadlift']),
  hip: ids(['Barbell_Hip_Thrust']),
  hpush: ids(['Barbell_Bench_Press_-_Medium_Grip', 'Smith_Machine_Bench_Press']),
  incline: ids(['Barbell_Incline_Bench_Press_-_Medium_Grip', 'Smith_Machine_Incline_Bench_Press']),
  vpush: ids(['Standing_Military_Press', 'Seated_Barbell_Military_Press', 'Smith_Machine_Overhead_Shoulder_Press']),
  hpull: ids(['Bent_Over_Barbell_Row', 'ft:pendlay_row']),
  vpull: ids(['Weighted_Pull_Ups']),
}

/** When nothing in a slot fits, the next movement that trains the same muscles. */
const FALLBACK: Record<Slot, readonly Slot[]> = {
  squat: ['lunge'],
  lunge: ['squat'],
  hinge: ['hip'],
  hip: ['hinge'],
  hpush: ['incline'],
  incline: ['hpush'],
  vpush: ['incline', 'hpush'],
  hpull: ['vpull'],
  vpull: ['hpull'],
}

/** Extra work per group, isolation first, then compounds that suit a second exercise. */
const ACCESSORIES: Record<Group, readonly string[]> = {
  chest: ids([
    'Cable_Crossover',
    'Butterfly',
    'Dumbbell_Flyes',
    'Incline_Cable_Flye',
    'Low_Cable_Crossover',
    'Incline_Dumbbell_Flyes',
    'Flat_Bench_Cable_Flyes',
    'Cross_Over_-_With_Bands',
    'Dumbbell_Bench_Press_with_Neutral_Grip',
    'Pushups',
    'Push-Ups_With_Feet_Elevated',
    'Incline_Push-Up',
  ]),
  back: ids([
    'Straight-Arm_Pulldown',
    'Seated_One-arm_Cable_Pulley_Rows',
    'One_Arm_Lat_Pulldown',
    'Dumbbell_Incline_Row',
    'One-Arm_Dumbbell_Row',
    'Leverage_Iso_Row',
    'Close-Grip_Front_Lat_Pulldown',
    'Underhand_Cable_Pulldowns',
    'Chin-Up',
    'Inverted_Row_with_Straps',
    'ft:band_row',
    'ft:band_lat_pulldown',
  ]),
  shoulders: ids([
    'Side_Lateral_Raise',
    'Cable_Seated_Lateral_Raise',
    'ft:machine_lateral_raise',
    'Lateral_Raise_-_With_Bands',
    'Reverse_Machine_Flyes',
    'Face_Pull',
    'Reverse_Flyes',
    'Cable_Rear_Delt_Fly',
    'ft:band_face_pull',
    'Band_Pull_Apart',
    'Back_Flyes_-_With_Bands',
    'ft:landmine_press',
  ]),
  biceps: ids([
    'Dumbbell_Bicep_Curl',
    'Standing_Biceps_Cable_Curl',
    'EZ-Bar_Curl',
    'Hammer_Curls',
    'Incline_Dumbbell_Curl',
    'Preacher_Curl',
    'Machine_Preacher_Curls',
    'Cable_Hammer_Curls_-_Rope_Attachment',
    'Barbell_Curl',
    'ft:band_curl',
    'Concentration_Curls',
    'Spider_Curl',
  ]),
  triceps: ids([
    'Triceps_Pushdown_-_Rope_Attachment',
    'Cable_Rope_Overhead_Triceps_Extension',
    'EZ-Bar_Skullcrusher',
    'Standing_Dumbbell_Triceps_Extension',
    'Lying_Dumbbell_Tricep_Extension',
    'Machine_Triceps_Extension',
    'Triceps_Pushdown',
    'ft:band_pushdown',
    'ft:band_overhead_triceps',
    'Tricep_Dumbbell_Kickback',
    'Dips_-_Triceps_Version',
    'Bench_Dips',
    'Close-Grip_Barbell_Bench_Press',
    'Dumbbell_Floor_Press',
    'Floor_Press',
  ]),
  quads: ids([
    'Leg_Extensions',
    'ft:bulgarian_split_squat',
    'Leg_Press',
    'Hack_Squat',
    'Goblet_Squat',
    'Split_Squat_with_Dumbbells',
    'ft:leg_press_single_leg',
    'Dumbbell_Step_Ups',
    'Barbell_Lunge',
    'ft:bodyweight_split_squat',
    'Squats_-_With_Bands',
    'Bodyweight_Squat',
  ]),
  hamstrings: ids([
    'Seated_Leg_Curl',
    'Lying_Leg_Curls',
    'Standing_Leg_Curl',
    'Glute_Ham_Raise',
    'ft:band_leg_curl',
    'Natural_Glute_Ham_Raise',
    'Romanian_Deadlift',
    'Stiff-Legged_Dumbbell_Deadlift',
    'ft:single_leg_rdl',
    'ft:kettlebell_swing',
    'Band_Good_Morning',
    'Good_Morning',
  ]),
  glutes: ids([
    'Barbell_Hip_Thrust',
    'ft:machine_hip_thrust',
    'ft:dumbbell_hip_thrust',
    'One-Legged_Cable_Kickback',
    'Pull_Through',
    'Barbell_Glute_Bridge',
    'Butt_Lift_Bridge',
    'Single_Leg_Glute_Bridge',
  ]),
  calves: ids([
    'Standing_Calf_Raises',
    'Seated_Calf_Raise',
    'Calf_Press_On_The_Leg_Press_Machine',
    'Standing_Dumbbell_Calf_Raise',
    'Standing_Barbell_Calf_Raise',
    'ft:single_leg_calf_raise',
    'Calf_Raises_-_With_Bands',
  ]),
  abs: ids(['Cable_Crunch', 'Hanging_Leg_Raise', 'Ab_Crunch_Machine', 'Reverse_Crunch', 'Crunches', 'Plank', 'Dead_Bug', 'Ab_Roller', 'Side_Bridge']),
}

/** Every ranked list, best first within each, for choosing replacements outside the generator. */
export const RANKING: readonly string[] = [...new Set([...Object.values(SLOT_CANDIDATES).flat(), ...Object.values(ACCESSORIES).flat()])]

const UPPER_GROUPS: ReadonlySet<Group> = new Set(['chest', 'back', 'shoulders', 'biceps', 'triceps'])
const PUSH_GROUPS: ReadonlySet<Group> = new Set(['chest', 'shoulders', 'triceps'])

// ---- Helpers ------------------------------------------------------------------------------

export function weeklyTargets(a: Pick<PlanAnswers, 'experience' | 'goal' | 'priority' | 'exclude'>): Volume {
  const base = a.goal === 'cut' ? 10 : a.experience === 'beginner' ? 10 : a.experience === 'intermediate' ? 12 : 14
  const out = excludedGroups(a.exclude)
  const v = emptyVolume()
  for (const g of GROUPS) v[g] = out.has(g) ? 0 : Math.min(VOLUME_CEILING, base + (a.priority.includes(g) ? PRIORITY_EXTRA_SETS : 0))
  return v
}

/** Weekdays only count when there is one per training day, each 0–6 and none repeated. */
export function validWeekdays(weekdays: readonly number[] | undefined, daysPerWeek: number): number[] | undefined {
  if (!weekdays || weekdays.length !== daysPerWeek) return undefined
  const set = new Set(weekdays)
  if (set.size !== weekdays.length || weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return undefined
  return [...weekdays].sort((a, b) => a - b)
}

export function normalizeAnswers(a: PlanAnswers): PlanAnswers {
  const daysPerWeek = Math.min(6, Math.max(2, Math.round(a.daysPerWeek || 3)))
  const minutes = MINUTES_OPTIONS.reduce((best, m) => (Math.abs(m - a.minutes) < Math.abs(best - a.minutes) ? m : best), 60 as number)
  const injuries = JOINTS.filter((j) => a.injuries.includes(j))
  let exclude = REGIONS.filter((r) => a.exclude?.includes(r))
  // Leaving out both the legs and the whole upper body would leave nothing to train.
  if (exclude.includes('legs') && ['chest', 'back', 'shoulders', 'arms'].every((r) => exclude.includes(r as Region))) exclude = []
  const out = excludedGroups(exclude)
  const priority = GROUPS.filter((g) => a.priority.includes(g) && !out.has(g)).slice(0, 2)
  const split = splitFor({ daysPerWeek, exclude })
  const weekdays = validWeekdays(a.weekdays, split.days.length)
  return {
    daysPerWeek,
    minutes,
    experience: EXPERIENCE_OPTIONS.some((o) => o.value === a.experience) ? a.experience : 'intermediate',
    equipment: a.equipment in EQUIPMENT_CHOICES ? a.equipment : 'full',
    injuries,
    goal: a.goal in PLAN_GOALS ? a.goal : 'muscle',
    priority,
    ...(exclude.length ? { exclude } : {}),
    ...(weekdays ? { weekdays } : {}),
  }
}

/** Exercises that suit the equipment, avoid flagged joints and, for beginners, are not expert lifts. */
export function exercisePool<T extends PlannerExercise>(answers: Pick<PlanAnswers, 'equipment' | 'injuries' | 'experience'>, library: readonly T[]): T[] {
  const allowed = new Set<Equipment>(EQUIPMENT_CHOICES[answers.equipment].allowed)
  const flagged = new Set(answers.injuries)
  return library.filter(
    (e) => allowed.has(e.equipment) && !e.jointStress.some((j) => flagged.has(j)) && !(answers.experience === 'beginner' && e.level === 'expert'),
  )
}

/** Swaps for an exercise: same movement pattern and a shared main muscle group. */
export function alternativesFor<T extends PlannerExercise>(ex: PlannerExercise, library: readonly T[], answers?: Pick<PlanAnswers, 'equipment' | 'injuries' | 'experience'>): T[] {
  const pool = answers ? exercisePool(answers, library) : [...library]
  const groups = primaryGroups(ex)
  return pool
    .filter((e) => e.id !== ex.id && e.pattern === ex.pattern && primaryGroups(e).some((g) => groups.includes(g)))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Exercises that take load in small steps; a strength focus needs one. */
function loadable(e: PlannerExercise): boolean {
  return DEFAULT_LOAD_STEP[e.equipment] > 0 || e.id === 'fedb:Weighted_Pull_Ups'
}

export function prescriptionFor(e: PlannerExercise, role: Role, strength: boolean): Pick<PlannedExercise, 'repMin' | 'repMax' | 'targetRir' | 'restSec'> {
  const compound = countsAsCompound(e)
  if (e.unit === 'seconds') return { repMin: 30, repMax: 60, targetRir: 1, restSec: 60 }
  if (role === 'main' && strength && loadable(e)) return { repMin: 3, repMax: 6, targetRir: 2, restSec: 180 }
  if (role === 'main') return { repMin: 6, repMax: 10, targetRir: 2, restSec: 180 }
  if (compound) return { repMin: 8, repMax: 12, targetRir: 2, restSec: 150 }
  return { repMin: 10, repMax: 15, targetRir: 1, restSec: 90 }
}

const fmtSets = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

function listText(items: readonly string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} und ${items[items.length - 1]}`
}

// ---- The generator -------------------------------------------------------------------------

interface WorkItem extends PlannedExercise {
  ex: PlannerExercise
}

interface WorkDay {
  name: string
  kind: DayKind
  weekday: number
  items: WorkItem[]
}

type Failure = 'time' | 'pool' | 'spacing' | 'ceiling' | 'session'

export interface GenerateOptions {
  /** Shifts the choice among the top candidates, so "Regenerate" offers a different mix. */
  variant?: number
}

export function generatePlan(input: PlanAnswers, library: readonly PlannerExercise[], options: GenerateOptions = {}): GeneratedPlan {
  const answers = normalizeAnswers(input)
  const { minutes, experience, goal, priority } = answers
  const variant = Math.max(0, Math.floor(options.variant ?? 0))
  const strength = goal === 'strength'
  const out = excludedGroups(answers.exclude)
  // Nothing whose main muscle is left out, so no slot or accessory can bring it back.
  const pool = exercisePool(answers, library).filter((e) => !primaryGroups(e).some((g) => out.has(g)))
  const byId = new Map(pool.map((e) => [e.id, e]))
  const split = splitFor(answers)
  const weekdays = answers.weekdays ?? [...split.weekdays]
  const targets = weeklyTargets(answers)
  const usage = new Map<string, number>()
  const rotate = experience !== 'beginner'
  let seq = 0

  const days: WorkDay[] = split.days.map((t, i) => ({ name: t.name, kind: t.kind, weekday: weekdays[i], items: [] }))

  const isStrengthMain = (it: WorkItem) => strength && it.role === 'main'
  const timed = (d: WorkDay) => d.items.map((it) => ({ id: it.key, compound: countsAsCompound(it.ex), sets: it.sets, pairWith: it.pairWith }))
  const minutesOf = (d: WorkDay) => sessionMinutes(timed(d))
  const volume = () => {
    const v = emptyVolume()
    for (const d of days) for (const it of d.items) addCredits(v, groupCredits(it.ex), it.sets)
    return v
  }
  const overCeiling = () => {
    const v = volume()
    return GROUPS.some((g) => v[g] > VOLUME_CEILING + 1e-9)
  }
  const directSets = (d: WorkDay, g: Group) => d.items.reduce((n, it) => n + (primaryGroups(it.ex).includes(g) ? it.sets : 0), 0)
  const spacingOk = (d: WorkDay, g: Group) =>
    directSets(d, g) > 0 || days.every((o) => o === d || directSets(o, g) === 0 || weekdayGap(o.weekday, d.weekday) >= 2)

  const makeItem = (ex: PlannerExercise, sets: number, role: Role): WorkItem => ({
    key: `p${seq++}`,
    exerciseId: ex.id,
    ex,
    sets,
    ...prescriptionFor(ex, role, strength),
    pairWith: null,
    role,
  })

  /** First fitting candidate; non-beginners rotate to the least-used one for variety. */
  const pick = (candidates: readonly string[], d: WorkDay, fixed: boolean): PlannerExercise | undefined => {
    const list: PlannerExercise[] = []
    for (const id of candidates) {
      const e = byId.get(id)
      if (e && !list.includes(e) && !d.items.some((it) => it.exerciseId === id)) list.push(e)
    }
    if (list.length === 0) return undefined
    if (fixed) return list[0]
    if (variant > 0) {
      const shift = variant % Math.min(3, list.length)
      list.unshift(...list.splice(shift, 1))
    }
    if (!rotate) return list[0]
    let best = list[0]
    for (const e of list) if ((usage.get(e.id) ?? 0) < (usage.get(best.id) ?? 0)) best = e
    return best
  }
  const countUse = (e: PlannerExercise) => usage.set(e.id, (usage.get(e.id) ?? 0) + 1)

  const unlink = (d: WorkDay, it: WorkItem) => {
    const partner = it.pairWith ? d.items.find((o) => o.key === it.pairWith) : undefined
    if (partner) partner.pairWith = null
    it.pairWith = null
  }
  const link = (a: WorkItem, b: WorkItem) => {
    a.pairWith = b.key
    b.pairWith = a.key
  }
  const canPair = (a: WorkItem, b: WorkItem) => {
    if (a === b || a.pairWith || b.pairWith || isStrengthMain(a) || isStrengthMain(b)) return false
    const ga = primaryGroups(a.ex)
    const gb = primaryGroups(b.ex)
    if (countsAsCompound(a.ex) && countsAsCompound(b.ex)) {
      // Heavy leg lifts never share a superset; upper-body pushes and pulls do.
      if (!ga.every((g) => UPPER_GROUPS.has(g)) || !gb.every((g) => UPPER_GROUPS.has(g))) return false
      const push = (gs: Group[]) => gs.some((g) => PUSH_GROUPS.has(g))
      const pull = (gs: Group[]) => gs.includes('back')
      return (push(ga) && pull(gb)) || (pull(ga) && push(gb))
    }
    return ga.some((x) => gb.some((y) => OPPOSING[x].includes(y)))
  }
  const saving = (a: WorkItem, b: WorkItem) => {
    const per = (it: WorkItem) => (countsAsCompound(it.ex) ? 3 : 2)
    return Math.min(a.sets, b.sets) * (Math.min(per(a), per(b)) - 1)
  }
  /** Pairs supersets until the day fits, preferring pairs with `prefer`, then the biggest saving. */
  const fitByPairing = (d: WorkDay, prefer?: WorkItem) => {
    while (minutesOf(d) > minutes) {
      let best: [WorkItem, WorkItem] | null = null
      let bestScore = -1
      for (let i = 0; i < d.items.length; i++) {
        for (let j = i + 1; j < d.items.length; j++) {
          const a = d.items[i]
          const b = d.items[j]
          if (!canPair(a, b)) continue
          const score = saving(a, b) * 10 + (prefer && (a === prefer || b === prefer) ? 100 : 0)
          if (score > bestScore) {
            best = [a, b]
            bestScore = score
          }
        }
      }
      if (!best || saving(best[0], best[1]) <= 0) return false
      link(best[0], best[1])
    }
    return true
  }

  const notes: PlanNote[] = []
  const trimmed = new Set<string>()
  const dropped: string[] = []
  const nonLoadableMain = new Set<string>()

  // 1. Compounds, slot by slot.
  for (const [i, t] of split.days.entries()) {
    const d = days[i]
    for (const slot of t.slots) {
      if (out.has(SLOT_GROUP[slot])) continue
      const main = d.items.length === 0
      const heavy = main && strength
      let ex: PlannerExercise | undefined
      for (const s of [slot, ...FALLBACK[slot]].filter((x) => !out.has(SLOT_GROUP[x]))) {
        ex = pick(heavy ? [...(STRENGTH_MAIN[s] ?? []), ...SLOT_CANDIDATES[s]] : SLOT_CANDIDATES[s], d, heavy)
        if (ex) break
      }
      if (!ex) continue
      d.items.push(makeItem(ex, 3, main ? 'main' : 'compound'))
      countUse(ex)
      if (heavy && !loadable(ex)) nonLoadableMain.add(d.name)
    }
  }

  // 2. Compounds alone must not push any group over the ceiling.
  for (let guard = 0; guard < 200; guard++) {
    const v = volume()
    const over = GROUPS.find((g) => v[g] > VOLUME_CEILING + 1e-9)
    if (!over) break
    let target: { d: WorkDay; it: WorkItem } | null = null
    let targetScore = Infinity
    for (const [di, d] of days.entries()) {
      for (const [ii, it] of d.items.entries()) {
        const c = groupCredits(it.ex)[over]
        if (!c) continue
        // Assisting credit before primary, secondary lifts before the main one, later days first.
        const score = (it.role === 'main' ? 1000 : 0) + (c === 1 ? 100 : 0) - di * 10 - ii
        if (score < targetScore) {
          targetScore = score
          target = { d, it }
        }
      }
    }
    if (!target) break
    const { d, it } = target
    if (it.sets > 2) it.sets--
    else {
      unlink(d, it)
      d.items.splice(d.items.indexOf(it), 1)
      dropped.push(`${it.ex.name} (${d.name})`)
    }
    if (!notes.some((n) => n.kind === 'ceiling' && n.group === over))
      notes.push({ kind: 'ceiling', group: over, text: `${GROUP_LABEL[over]} auf ${VOLUME_CEILING} Sätze pro Woche begrenzt, mehr bringt laut Studienlage nichts.` })
  }

  // 3. Compounds must fit the session: supersets first, then fewer sets, then fewer lifts.
  for (const d of days) {
    for (let guard = 0; guard < 60 && minutesOf(d) > minutes; guard++) {
      if (fitByPairing(d)) break
      const fewer = [...d.items].reverse().find((it) => it.role === 'compound' && it.sets > 2) ?? d.items.find((it) => it.role === 'main' && it.sets > 2)
      if (fewer) {
        fewer.sets--
        trimmed.add(d.name)
        continue
      }
      const drop = [...d.items].reverse().find((it) => it.role === 'compound')
      if (!drop) break
      unlink(d, drop)
      d.items.splice(d.items.indexOf(drop), 1)
      dropped.push(`${drop.ex.name} (${d.name})`)
    }
  }

  // 4. Isolation and second exercises where weekly sets fall short, priority groups first.
  const accessoryCandidates = (g: Group): string[] => {
    const ranked = ACCESSORIES[g].filter((id) => {
      const e = byId.get(id)
      return !!e && primaryGroups(e).includes(g)
    })
    const rest = pool
      .filter((e) => primaryGroups(e).includes(g) && !ranked.includes(e.id))
      .sort((a, b) => Number(countsAsCompound(a)) - Number(countsAsCompound(b)) || a.name.localeCompare(b.name))
      .map((e) => e.id)
    return [...ranked, ...rest]
  }
  const candidateCache = new Map<Group, string[]>()
  const candidatesFor = (g: Group) => {
    let c = candidateCache.get(g)
    if (!c) candidateCache.set(g, (c = accessoryCandidates(g)))
    return c
  }

  const tryChange = (d: WorkDay, g: Group, apply: () => WorkItem): 'ok' | Failure => {
    const snapshot = d.items.map((it) => ({ ...it }))
    const changed = apply()
    let result: 'ok' | Failure = 'ok'
    if (overCeiling()) result = 'ceiling'
    else if (directSets(d, g) > MAX_DIRECT_SETS_PER_SESSION) result = 'session'
    else if (!fitByPairing(d, changed)) result = 'time'
    if (result !== 'ok') d.items = snapshot
    return result
  }

  const placeSet = (g: Group, deficit: number): 'ok' | Failure => {
    const candidates = candidatesFor(g)
    if (candidates.length === 0) return 'pool'
    const open = days
      .map((d, i) => ({ d, i }))
      .filter(({ d }) => KIND_GROUPS[d.kind].has(g))
      .filter(({ d }) => spacingOk(d, g))
    if (open.length === 0) return 'spacing'
    open.sort((a, b) => directSets(a.d, g) - directSets(b.d, g) || minutesOf(a.d) - minutesOf(b.d) || a.i - b.i)
    let failure: Failure = 'time'
    const existingOn = (d: WorkDay) =>
      d.items
        .filter((it) => it.role === 'accessory' && primaryGroups(it.ex).includes(g) && it.sets < MAX_SETS_PER_EXERCISE)
        .sort((a, b) => a.sets - b.sets)[0]
    // A small gap is closed with one more set where an exercise for it already exists.
    if (deficit <= 1) {
      for (const { d } of open) {
        const existing = existingOn(d)
        if (!existing) continue
        const r = tryChange(d, g, () => {
          const it = d.items.find((o) => o.key === existing.key)!
          it.sets++
          return it
        })
        if (r === 'ok') return 'ok'
        if (r !== 'time') failure = r
      }
    }
    for (const { d } of open) {
      const existing = existingOn(d)
      if (existing) {
        const r = tryChange(d, g, () => {
          const it = d.items.find((o) => o.key === existing.key)!
          it.sets++
          return it
        })
        if (r === 'ok') return 'ok'
        if (r !== 'time') failure = r
      }
      const ex = pick(candidates, d, false)
      if (!ex) continue
      const r = tryChange(d, g, () => {
        const it = makeItem(ex, 2, 'accessory')
        d.items.push(it)
        return it
      })
      if (r === 'ok') {
        countUse(ex)
        return 'ok'
      }
      if (r !== 'time') failure = r
    }
    return failure
  }

  const blocked = new Map<Group, Failure>()
  for (let guard = 0; guard < 2000; guard++) {
    const v = volume()
    const need = GROUPS.filter((g) => !blocked.has(g) && v[g] < targets[g])
    if (need.length === 0) break
    need.sort(
      (a, b) =>
        Number(priority.includes(b)) - Number(priority.includes(a)) ||
        v[a] / targets[a] - v[b] / targets[b] ||
        GROUPS.indexOf(a) - GROUPS.indexOf(b),
    )
    const g = need[0]
    const r = placeSet(g, targets[g] - v[g])
    if (r !== 'ok') blocked.set(g, r)
  }

  // 5. Order supersets next to each other, then report.
  for (const d of days) {
    const ordered: WorkItem[] = []
    for (const it of d.items) {
      if (ordered.includes(it)) continue
      ordered.push(it)
      const partner = it.pairWith ? d.items.find((o) => o.key === it.pairWith) : undefined
      if (partner && !ordered.includes(partner)) ordered.push(partner)
    }
    d.items = ordered
    for (const it of d.items) {
      if (it.pairWith && !isStrengthMain(it)) {
        const short = countsAsCompound(it.ex) ? 90 : 60
        it.restSec = Math.min(it.restSec, short)
      }
    }
  }

  const finalVolume = volume()
  for (const g of GROUPS) {
    if (finalVolume[g] >= targets[g]) continue
    const reason = blocked.get(g) ?? 'time'
    const head = `${GROUP_LABEL[g]}: ${fmtSets(finalVolume[g])} von ${targets[g]} Sätzen pro Woche.`
    let tail: string
    if (reason === 'pool') {
      tail = answers.injuries.length ? ' Mit deinen Geräten trainiert sie nichts direkt, ohne ein markiertes Gelenk zu belasten.' : ' Mit deinen Geräten trainiert sie nichts direkt.'
    } else if (reason === 'spacing') tail = ' Eine weitere Einheit dafür läge keine 48 Stunden nach der letzten.'
    else if (reason === 'ceiling') tail = ` Mehr würde einen anderen Muskel über ${VOLUME_CEILING} Sätze pro Woche bringen.`
    else if (reason === 'session') tail = ` Mehr hieße über ${MAX_DIRECT_SETS_PER_SESSION} Sätze davon in einer Einheit.`
    else tail = ` Mehr passt nicht in ${minutes} Minuten. Mehr Zeit, ein Tag mehr oder als Schwerpunkt wählen hilft.`
    notes.push({ kind: 'shortfall', group: g, text: head + tail })
  }
  if (split.note) notes.push({ kind: 'cut', text: split.note })
  const supersetDays = days.filter((d) => d.items.some((it) => it.pairWith)).map((d) => d.name)
  if (supersetDays.length) notes.push({ kind: 'superset', text: `Supersätze an ${listText(supersetDays)} halten die Einheiten unter ${minutes} Minuten.` })
  if (trimmed.size) notes.push({ kind: 'cut', text: `An ${listText([...trimmed])} auf 2 Sätze gekürzt, damit ${minutes} Minuten reichen.` })
  if (dropped.length) notes.push({ kind: 'cut', text: `Weggelassen wegen der Zeit oder der Obergrenze: ${listText(dropped)}.` })
  if (nonLoadableMain.size)
    notes.push({ kind: 'strength', text: 'Für Kraft braucht es eine Übung mit Zusatzgewicht. Mit Körpergewicht und Bändern bleibt die erste Übung bei 6–10 Wiederholungen.' })
  if (answers.injuries.length)
    notes.push({
      kind: 'injury',
      text: `Übungen, die ${listText(answers.injuries.map((j) => (j === 'lowerBack' ? 'den unteren Rücken' : j === 'hip' ? 'die Hüfte' : j === 'wrist' ? 'das Handgelenk' : j === 'knee' ? 'das Knie' : j === 'elbow' ? 'den Ellbogen' : 'die Schulter')))} belasten, sind weggelassen. Das ersetzt keine Diagnose: Hör bei Schmerzen auf und lass dich untersuchen.`,
    })

  return {
    name: `${split.label}, ${days.length} Tage`,
    split: split.key,
    daysPerWeek: days.length,
    answers,
    generatorVersion: GENERATOR_VERSION,
    days: days.map((d) => ({
      name: d.name,
      kind: d.kind,
      weekday: d.weekday,
      minutes: minutesOf(d),
      exercises: d.items.map((it) => ({
        key: it.key,
        exerciseId: it.exerciseId,
        sets: it.sets,
        repMin: it.repMin,
        repMax: it.repMax,
        targetRir: it.targetRir,
        restSec: it.restSec,
        pairWith: it.pairWith,
        role: it.role,
      })),
    })),
    volume: finalVolume,
    targets,
    notes,
  }
}
