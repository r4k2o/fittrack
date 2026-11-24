#!/usr/bin/env node
// Builds src/data/exercises.json from free-exercise-db (public domain, Unlicense).
//
//   curl -L -o /tmp/exercises.json \
//     https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json
//   npm run exercises -- /tmp/exercises.json
//
// The source holds 800+ exercises. This keeps about 150 common lifts and adds the
// tags the plan generator needs: movement slot (pattern), normalised equipment and
// the joints an exercise loads (used to leave exercises out for a flagged joint).
// Bump LIBRARY_VERSION whenever the output changes so installed apps re-seed.

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const LIBRARY_VERSION = 2

const here = dirname(fileURLToPath(import.meta.url))
const src = process.argv[2]
if (!src) {
  console.error('usage: npm run exercises -- <path to free-exercise-db exercises.json>')
  process.exit(1)
}

const MUSCLES = {
  abdominals: 'abs',
  abductors: 'abductors',
  adductors: 'adductors',
  biceps: 'biceps',
  calves: 'calves',
  chest: 'chest',
  forearms: 'forearms',
  glutes: 'glutes',
  hamstrings: 'hamstrings',
  lats: 'lats',
  'lower back': 'lowerBack',
  'middle back': 'midBack',
  neck: 'neck',
  quadriceps: 'quads',
  shoulders: 'shoulders',
  traps: 'traps',
  triceps: 'triceps',
}

const EQUIPMENT = {
  barbell: 'barbell',
  'e-z curl bar': 'ezbar',
  dumbbell: 'dumbbell',
  kettlebells: 'kettlebell',
  cable: 'cable',
  machine: 'machine',
  'body only': 'bodyweight',
  bands: 'band',
}

// [source id, pattern, joints, overrides]
// overrides: name, equipment, compound, unit, and secondary (in Fittrack's muscle keys)
// where the source's assisting muscles would distort the weekly-set count
// pattern: squat | hinge | hpush | hpull | vpush | vpull | isolation
// joints:  shoulder | elbow | wrist | lowerBack | hip | knee
const PICKS = [
  // Horizontal push
  ['Barbell_Bench_Press_-_Medium_Grip', 'hpush', ['shoulder', 'elbow', 'wrist'], { name: 'Barbell Bench Press' }],
  ['Barbell_Incline_Bench_Press_-_Medium_Grip', 'hpush', ['shoulder', 'elbow', 'wrist'], { name: 'Incline Barbell Bench Press' }],
  ['Decline_Barbell_Bench_Press', 'hpush', ['shoulder', 'elbow', 'wrist']],
  ['Close-Grip_Barbell_Bench_Press', 'hpush', ['shoulder', 'elbow', 'wrist'], { name: 'Close-Grip Bench Press' }],
  ['Floor_Press', 'hpush', ['elbow', 'wrist'], { name: 'Barbell Floor Press' }],
  ['Dumbbell_Bench_Press', 'hpush', ['shoulder', 'elbow']],
  ['Incline_Dumbbell_Press', 'hpush', ['shoulder', 'elbow']],
  ['Decline_Dumbbell_Bench_Press', 'hpush', ['shoulder', 'elbow']],
  ['Dumbbell_Bench_Press_with_Neutral_Grip', 'hpush', ['elbow'], { name: 'Neutral-Grip Dumbbell Press' }],
  ['Dumbbell_Floor_Press', 'hpush', ['elbow']],
  ['Machine_Bench_Press', 'hpush', ['shoulder', 'elbow'], { name: 'Machine Chest Press' }],
  ['Leverage_Chest_Press', 'hpush', ['shoulder', 'elbow'], { name: 'Lever Chest Press' }],
  ['Leverage_Incline_Chest_Press', 'hpush', ['shoulder', 'elbow'], { name: 'Lever Incline Chest Press' }],
  ['Smith_Machine_Bench_Press', 'hpush', ['shoulder', 'elbow', 'wrist']],
  ['Smith_Machine_Incline_Bench_Press', 'hpush', ['shoulder', 'elbow', 'wrist'], { name: 'Smith Machine Incline Press' }],
  ['Cable_Chest_Press', 'hpush', ['shoulder', 'elbow']],
  ['Pushups', 'hpush', ['shoulder', 'elbow', 'wrist'], { name: 'Push-Up' }],
  ['Push-Ups_With_Feet_Elevated', 'hpush', ['shoulder', 'elbow', 'wrist'], { name: 'Feet-Elevated Push-Up' }],
  ['Incline_Push-Up', 'hpush', ['shoulder', 'wrist']],
  ['Dips_-_Chest_Version', 'hpush', ['shoulder', 'elbow'], { name: 'Chest Dip', equipment: 'bodyweight' }],
  ['Dips_-_Triceps_Version', 'hpush', ['shoulder', 'elbow'], { name: 'Triceps Dip' }],
  ['Dip_Machine', 'hpush', ['shoulder', 'elbow']],
  // Chest isolation
  ['Dumbbell_Flyes', 'isolation', ['shoulder'], { name: 'Dumbbell Fly' }],
  ['Incline_Dumbbell_Flyes', 'isolation', ['shoulder'], { name: 'Incline Dumbbell Fly', compound: false }],
  ['Cable_Crossover', 'isolation', ['shoulder']],
  ['Low_Cable_Crossover', 'isolation', ['shoulder'], { name: 'Low-to-High Cable Fly' }],
  ['Flat_Bench_Cable_Flyes', 'isolation', ['shoulder'], { name: 'Flat Cable Fly' }],
  ['Incline_Cable_Flye', 'isolation', ['shoulder'], { name: 'Incline Cable Fly' }],
  ['Butterfly', 'isolation', ['shoulder'], { name: 'Pec Deck' }],
  ['Straight-Arm_Dumbbell_Pullover', 'isolation', ['shoulder'], { name: 'Dumbbell Pullover', compound: false }],
  // Vertical pull
  ['Pullups', 'vpull', ['shoulder', 'elbow'], { name: 'Pull-Up' }],
  ['Chin-Up', 'vpull', ['shoulder', 'elbow']],
  ['Weighted_Pull_Ups', 'vpull', ['shoulder', 'elbow'], { name: 'Weighted Pull-Up', equipment: 'bodyweight' }],
  ['Band_Assisted_Pull-Up', 'vpull', ['shoulder', 'elbow'], { equipment: 'band' }],
  ['Wide-Grip_Lat_Pulldown', 'vpull', ['shoulder', 'elbow'], { name: 'Lat Pulldown' }],
  ['Close-Grip_Front_Lat_Pulldown', 'vpull', ['shoulder', 'elbow'], { name: 'Close-Grip Lat Pulldown' }],
  ['Underhand_Cable_Pulldowns', 'vpull', ['elbow'], { name: 'Underhand Lat Pulldown' }],
  ['V-Bar_Pulldown', 'vpull', ['elbow']],
  ['One_Arm_Lat_Pulldown', 'vpull', ['shoulder', 'elbow'], { name: 'Single-Arm Lat Pulldown' }],
  ['Straight-Arm_Pulldown', 'isolation', ['shoulder']],
  // Horizontal pull
  ['Bent_Over_Barbell_Row', 'hpull', ['lowerBack', 'elbow'], { name: 'Barbell Row' }],
  ['Reverse_Grip_Bent-Over_Rows', 'hpull', ['lowerBack', 'elbow'], { name: 'Reverse-Grip Barbell Row' }],
  ['One-Arm_Dumbbell_Row', 'hpull', ['elbow']],
  ['Bent_Over_Two-Dumbbell_Row', 'hpull', ['lowerBack', 'elbow'], { name: 'Bent-Over Dumbbell Row' }],
  ['Dumbbell_Incline_Row', 'hpull', ['elbow'], { name: 'Chest-Supported Dumbbell Row' }],
  ['Seated_Cable_Rows', 'hpull', ['elbow'], { name: 'Seated Cable Row' }],
  ['Seated_One-arm_Cable_Pulley_Rows', 'hpull', ['elbow'], { name: 'Single-Arm Cable Row' }],
  ['T-Bar_Row_with_Handle', 'hpull', ['lowerBack', 'elbow'], { name: 'T-Bar Row' }],
  ['Lying_T-Bar_Row', 'hpull', ['elbow'], { name: 'Chest-Supported T-Bar Row' }],
  ['Leverage_Iso_Row', 'hpull', ['elbow'], { name: 'Machine Row' }],
  ['Leverage_High_Row', 'hpull', ['shoulder', 'elbow'], { name: 'Machine High Row' }],
  ['Smith_Machine_Bent_Over_Row', 'hpull', ['lowerBack', 'elbow'], { name: 'Smith Machine Row' }],
  ['Inverted_Row_with_Straps', 'hpull', ['elbow'], { name: 'Inverted Row', equipment: 'bodyweight' }],
  ['Face_Pull', 'isolation', [], { compound: false }],
  ['Barbell_Shrug', 'isolation', []],
  ['Dumbbell_Shrug', 'isolation', []],
  // Squat pattern (bilateral and single-leg)
  ['Barbell_Squat', 'squat', ['knee', 'hip', 'lowerBack'], { name: 'Barbell Back Squat' }],
  ['Front_Barbell_Squat', 'squat', ['knee', 'wrist', 'lowerBack'], { name: 'Front Squat' }],
  ['Box_Squat', 'squat', ['knee', 'hip', 'lowerBack']],
  ['Goblet_Squat', 'squat', ['knee'], { equipment: 'dumbbell', secondary: ['glutes', 'hamstrings'] }],
  ['Dumbbell_Squat', 'squat', ['knee']],
  ['Hack_Squat', 'squat', ['knee'], { name: 'Hack Squat Machine' }],
  ['Leg_Press', 'squat', ['knee']],
  ['Smith_Machine_Squat', 'squat', ['knee', 'hip']],
  ['Bodyweight_Squat', 'squat', ['knee'], { name: 'Air Squat' }],
  ['Split_Squat_with_Dumbbells', 'squat', ['knee'], { name: 'Dumbbell Split Squat' }],
  ['Barbell_Lunge', 'squat', ['knee']],
  ['Dumbbell_Lunges', 'squat', ['knee'], { name: 'Dumbbell Lunge' }],
  ['Barbell_Walking_Lunge', 'squat', ['knee']],
  ['Dumbbell_Rear_Lunge', 'squat', ['knee'], { name: 'Dumbbell Reverse Lunge' }],
  ['Dumbbell_Step_Ups', 'squat', ['knee'], { name: 'Dumbbell Step-Up' }],
  // Hinge pattern
  ['Barbell_Deadlift', 'hinge', ['lowerBack', 'hip'], { name: 'Deadlift' }],
  ['Sumo_Deadlift', 'hinge', ['lowerBack', 'hip']],
  ['Trap_Bar_Deadlift', 'hinge', ['lowerBack', 'knee'], { equipment: 'trapbar' }],
  ['Romanian_Deadlift', 'hinge', ['lowerBack', 'hip']],
  ['Stiff-Legged_Barbell_Deadlift', 'hinge', ['lowerBack'], { name: 'Stiff-Leg Deadlift' }],
  ['Stiff-Legged_Dumbbell_Deadlift', 'hinge', ['lowerBack'], { name: 'Dumbbell Stiff-Leg Deadlift' }],
  ['Rack_Pulls', 'hinge', ['lowerBack'], { name: 'Rack Pull' }],
  ['Good_Morning', 'hinge', ['lowerBack']],
  ['Barbell_Hip_Thrust', 'hinge', ['hip']],
  ['Barbell_Glute_Bridge', 'hinge', ['hip']],
  ['Single_Leg_Glute_Bridge', 'hinge', [], { compound: true }],
  ['Pull_Through', 'hinge', [], { name: 'Cable Pull-Through' }],
  ['Hyperextensions_Back_Extensions', 'hinge', ['lowerBack'], { name: 'Back Extension', equipment: 'machine', compound: true }],
  ['Glute_Ham_Raise', 'isolation', ['knee'], { compound: false }],
  // Leg isolation
  ['Leg_Extensions', 'isolation', ['knee'], { name: 'Leg Extension' }],
  ['Lying_Leg_Curls', 'isolation', ['knee'], { name: 'Lying Leg Curl' }],
  ['Seated_Leg_Curl', 'isolation', ['knee']],
  ['Standing_Leg_Curl', 'isolation', ['knee']],
  ['One-Legged_Cable_Kickback', 'isolation', [], { name: 'Cable Glute Kickback' }],
  ['Thigh_Abductor', 'isolation', ['hip'], { name: 'Hip Abduction Machine' }],
  ['Thigh_Adductor', 'isolation', ['hip'], { name: 'Hip Adduction Machine' }],
  ['Standing_Calf_Raises', 'isolation', [], { name: 'Standing Calf Raise' }],
  ['Seated_Calf_Raise', 'isolation', []],
  ['Calf_Press_On_The_Leg_Press_Machine', 'isolation', [], { name: 'Leg Press Calf Raise' }],
  ['Standing_Dumbbell_Calf_Raise', 'isolation', []],
  ['Standing_Barbell_Calf_Raise', 'isolation', []],
  // Vertical push
  ['Standing_Military_Press', 'vpush', ['shoulder', 'elbow', 'lowerBack'], { name: 'Overhead Press' }],
  ['Seated_Barbell_Military_Press', 'vpush', ['shoulder', 'elbow'], { name: 'Seated Barbell Overhead Press' }],
  ['Dumbbell_Shoulder_Press', 'vpush', ['shoulder', 'elbow'], { name: 'Seated Dumbbell Shoulder Press' }],
  ['Standing_Dumbbell_Press', 'vpush', ['shoulder', 'elbow'], { name: 'Standing Dumbbell Press' }],
  ['Arnold_Dumbbell_Press', 'vpush', ['shoulder', 'elbow'], { name: 'Arnold Press' }],
  ['Machine_Shoulder_Military_Press', 'vpush', ['shoulder', 'elbow'], { name: 'Machine Shoulder Press' }],
  ['Smith_Machine_Overhead_Shoulder_Press', 'vpush', ['shoulder', 'elbow'], { name: 'Smith Machine Shoulder Press' }],
  ['Push_Press', 'vpush', ['shoulder', 'elbow'], { secondary: ['triceps'] }],
  ['Handstand_Push-Ups', 'vpush', ['shoulder', 'elbow', 'wrist'], { name: 'Handstand Push-Up' }],
  // Shoulder isolation
  ['Side_Lateral_Raise', 'isolation', ['shoulder'], { name: 'Dumbbell Lateral Raise' }],
  ['Cable_Seated_Lateral_Raise', 'isolation', ['shoulder'], { name: 'Cable Lateral Raise', secondary: [] }],
  ['Lateral_Raise_-_With_Bands', 'isolation', ['shoulder'], { name: 'Band Lateral Raise' }],
  ['Front_Dumbbell_Raise', 'isolation', ['shoulder'], { name: 'Dumbbell Front Raise' }],
  ['Reverse_Flyes', 'isolation', [], { name: 'Dumbbell Reverse Fly' }],
  ['Reverse_Machine_Flyes', 'isolation', [], { name: 'Reverse Pec Deck' }],
  ['Cable_Rear_Delt_Fly', 'isolation', []],
  ['Band_Pull_Apart', 'isolation', []],
  ['Upright_Barbell_Row', 'isolation', ['shoulder', 'wrist'], { name: 'Barbell Upright Row', compound: true }],
  ['Standing_Dumbbell_Upright_Row', 'isolation', ['shoulder'], { name: 'Dumbbell Upright Row', compound: true }],
  ['External_Rotation_with_Cable', 'isolation', [], { name: 'Cable External Rotation' }],
  // Biceps and forearms
  ['Barbell_Curl', 'isolation', ['elbow', 'wrist']],
  ['EZ-Bar_Curl', 'isolation', ['elbow']],
  ['Dumbbell_Bicep_Curl', 'isolation', ['elbow'], { name: 'Dumbbell Curl' }],
  ['Hammer_Curls', 'isolation', ['elbow'], { name: 'Hammer Curl' }],
  ['Incline_Dumbbell_Curl', 'isolation', ['elbow', 'shoulder']],
  ['Preacher_Curl', 'isolation', ['elbow']],
  ['Machine_Preacher_Curls', 'isolation', ['elbow'], { name: 'Machine Preacher Curl' }],
  ['Standing_Biceps_Cable_Curl', 'isolation', ['elbow'], { name: 'Cable Curl' }],
  ['Cable_Hammer_Curls_-_Rope_Attachment', 'isolation', ['elbow'], { name: 'Cable Rope Hammer Curl' }],
  ['Concentration_Curls', 'isolation', ['elbow'], { name: 'Concentration Curl' }],
  ['Spider_Curl', 'isolation', ['elbow']],
  ['Reverse_Barbell_Curl', 'isolation', ['elbow', 'wrist'], { name: 'Reverse Curl' }],
  ['Palms-Up_Barbell_Wrist_Curl_Over_A_Bench', 'isolation', ['wrist'], { name: 'Wrist Curl' }],
  ['Palms-Down_Wrist_Curl_Over_A_Bench', 'isolation', ['wrist'], { name: 'Reverse Wrist Curl' }],
  // Triceps
  ['Triceps_Pushdown', 'isolation', ['elbow']],
  ['Triceps_Pushdown_-_Rope_Attachment', 'isolation', ['elbow'], { name: 'Rope Pushdown' }],
  ['Cable_Rope_Overhead_Triceps_Extension', 'isolation', ['elbow', 'shoulder'], { name: 'Overhead Cable Triceps Extension' }],
  ['EZ-Bar_Skullcrusher', 'isolation', ['elbow'], { name: 'EZ-Bar Skull Crusher' }],
  ['Lying_Dumbbell_Tricep_Extension', 'isolation', ['elbow'], { name: 'Dumbbell Skull Crusher', secondary: [] }],
  ['Standing_Dumbbell_Triceps_Extension', 'isolation', ['elbow', 'shoulder'], { name: 'Overhead Dumbbell Triceps Extension' }],
  ['Tricep_Dumbbell_Kickback', 'isolation', ['elbow'], { name: 'Dumbbell Kickback' }],
  ['Machine_Triceps_Extension', 'isolation', ['elbow']],
  ['Bench_Dips', 'isolation', ['shoulder', 'elbow', 'wrist'], { name: 'Bench Dip', compound: true }],
  // Core
  ['Plank', 'isolation', [], { unit: 'seconds' }],
  ['Side_Bridge', 'isolation', ['shoulder'], { name: 'Side Plank', unit: 'seconds' }],
  ['Hanging_Leg_Raise', 'isolation', []],
  ['Cable_Crunch', 'isolation', []],
  ['Ab_Crunch_Machine', 'isolation', []],
  ['Ab_Roller', 'isolation', ['lowerBack', 'shoulder'], { name: 'Ab Wheel Rollout', equipment: 'bodyweight' }],
  ['Crunches', 'isolation', [], { name: 'Crunch' }],
  ['Reverse_Crunch', 'isolation', []],
  ['Russian_Twist', 'isolation', ['lowerBack']],
  ['Pallof_Press', 'isolation', [], { secondary: [] }],
  ['Dead_Bug', 'isolation', [], { compound: false }],
  // Bands and bodyweight (library v2), so "bodyweight and bands" fills every slot
  ['Squats_-_With_Bands', 'squat', ['knee'], { name: 'Band Squat' }],
  ['Band_Good_Morning', 'hinge', ['lowerBack']],
  ['Butt_Lift_Bridge', 'hinge', [], { name: 'Glute Bridge', compound: true }],
  ['Bench_Press_-_With_Bands', 'hpush', ['shoulder', 'elbow'], { name: 'Band Bench Press' }],
  ['Shoulder_Press_-_With_Bands', 'vpush', ['shoulder', 'elbow'], { name: 'Band Shoulder Press' }],
  ['Cross_Over_-_With_Bands', 'isolation', ['shoulder'], { name: 'Band Chest Fly', compound: false, secondary: ['shoulders'] }],
  ['Back_Flyes_-_With_Bands', 'isolation', [], { name: 'Band Reverse Fly', compound: false, secondary: ['midBack'] }],
  ['Calf_Raises_-_With_Bands', 'isolation', [], { name: 'Band Calf Raise' }],
  ['Natural_Glute_Ham_Raise', 'isolation', ['knee'], { name: 'Nordic Hamstring Curl', compound: false, secondary: ['glutes'] }],
]

// Common lifts that free-exercise-db lacks. Names and tags only; no third-party text.
const EXTRAS = [
  { id: 'ft:bulgarian_split_squat', name: 'Bulgarian Split Squat', primary: ['quads'], secondary: ['glutes', 'hamstrings'], equipment: 'dumbbell', pattern: 'squat', joints: ['knee'], compound: true },
  { id: 'ft:pendlay_row', name: 'Pendlay Row', primary: ['midBack'], secondary: ['lats', 'biceps', 'shoulders'], equipment: 'barbell', pattern: 'hpull', joints: ['lowerBack', 'elbow'], compound: true },
  { id: 'ft:landmine_press', name: 'Landmine Press', primary: ['shoulders'], secondary: ['chest', 'triceps'], equipment: 'barbell', pattern: 'vpush', joints: ['elbow'], compound: true },
  { id: 'ft:kettlebell_swing', name: 'Kettlebell Swing', primary: ['hamstrings'], secondary: ['glutes', 'lowerBack', 'shoulders'], equipment: 'kettlebell', pattern: 'hinge', joints: ['lowerBack'], compound: true },
  { id: 'ft:assisted_pull_up_machine', name: 'Assisted Pull-Up Machine', primary: ['lats'], secondary: ['biceps', 'midBack'], equipment: 'machine', pattern: 'vpull', joints: ['shoulder', 'elbow'], compound: true },
  { id: 'ft:machine_lateral_raise', name: 'Machine Lateral Raise', primary: ['shoulders'], secondary: [], equipment: 'machine', pattern: 'isolation', joints: ['shoulder'], compound: false },
  { id: 'ft:leg_press_single_leg', name: 'Single-Leg Leg Press', primary: ['quads'], secondary: ['glutes', 'hamstrings'], equipment: 'machine', pattern: 'squat', joints: ['knee'], compound: true },
  // Library v2
  { id: 'ft:machine_hip_thrust', name: 'Hip Thrust Machine', primary: ['glutes'], secondary: ['hamstrings'], equipment: 'machine', pattern: 'hinge', joints: ['hip'], compound: true },
  { id: 'ft:dumbbell_hip_thrust', name: 'Dumbbell Hip Thrust', primary: ['glutes'], secondary: ['hamstrings'], equipment: 'dumbbell', pattern: 'hinge', joints: ['hip'], compound: true },
  { id: 'ft:single_leg_rdl', name: 'Single-Leg Romanian Deadlift', primary: ['hamstrings'], secondary: ['glutes', 'lowerBack'], equipment: 'bodyweight', pattern: 'hinge', joints: ['lowerBack'], compound: true },
  { id: 'ft:bodyweight_split_squat', name: 'Bodyweight Split Squat', primary: ['quads'], secondary: ['glutes', 'hamstrings'], equipment: 'bodyweight', pattern: 'squat', joints: ['knee'], compound: true },
  { id: 'ft:bodyweight_reverse_lunge', name: 'Bodyweight Reverse Lunge', primary: ['quads'], secondary: ['glutes', 'hamstrings'], equipment: 'bodyweight', pattern: 'squat', joints: ['knee'], compound: true },
  { id: 'ft:pike_push_up', name: 'Pike Push-Up', primary: ['shoulders'], secondary: ['triceps', 'chest'], equipment: 'bodyweight', pattern: 'vpush', joints: ['shoulder', 'elbow', 'wrist'], compound: true },
  { id: 'ft:band_row', name: 'Band Row', primary: ['midBack'], secondary: ['lats', 'biceps', 'shoulders'], equipment: 'band', pattern: 'hpull', joints: ['elbow'], compound: true },
  { id: 'ft:band_lat_pulldown', name: 'Band Lat Pulldown', primary: ['lats'], secondary: ['biceps', 'midBack'], equipment: 'band', pattern: 'vpull', joints: ['shoulder', 'elbow'], compound: true },
  { id: 'ft:band_face_pull', name: 'Band Face Pull', primary: ['shoulders'], secondary: ['midBack'], equipment: 'band', pattern: 'isolation', joints: [], compound: false },
  { id: 'ft:band_curl', name: 'Band Curl', primary: ['biceps'], secondary: ['forearms'], equipment: 'band', pattern: 'isolation', joints: ['elbow'], compound: false },
  { id: 'ft:band_pushdown', name: 'Band Triceps Pushdown', primary: ['triceps'], secondary: [], equipment: 'band', pattern: 'isolation', joints: ['elbow'], compound: false },
  { id: 'ft:band_overhead_triceps', name: 'Band Overhead Triceps Extension', primary: ['triceps'], secondary: [], equipment: 'band', pattern: 'isolation', joints: ['elbow', 'shoulder'], compound: false },
  { id: 'ft:band_leg_curl', name: 'Band Leg Curl', primary: ['hamstrings'], secondary: [], equipment: 'band', pattern: 'isolation', joints: ['knee'], compound: false },
  { id: 'ft:single_leg_calf_raise', name: 'Single-Leg Calf Raise', primary: ['calves'], secondary: [], equipment: 'bodyweight', pattern: 'isolation', joints: [], compound: false },
]

const source = JSON.parse(readFileSync(resolve(src), 'utf8'))
const byId = new Map(source.map((x) => [x.id, x]))
const seen = new Set()
const out = []

for (const [id, pattern, joints, o = {}] of PICKS) {
  const x = byId.get(id)
  if (!x) throw new Error(`not in source: ${id}`)
  if (seen.has(id)) throw new Error(`duplicate pick: ${id}`)
  seen.add(id)
  let equipment = o.equipment ?? EQUIPMENT[x.equipment]
  if (!o.equipment && x.equipment === 'machine' && id.startsWith('Smith_Machine')) equipment = 'smith'
  if (!equipment) throw new Error(`no equipment mapping for ${id} (${x.equipment})`)
  const muscles = (list) =>
    list.map((m) => {
      const k = MUSCLES[m]
      if (!k) throw new Error(`unknown muscle ${m} in ${id}`)
      return k
    })
  out.push({
    id: `fedb:${id}`,
    name: o.name ?? x.name,
    primary: muscles(x.primaryMuscles),
    secondary: o.secondary ?? muscles(x.secondaryMuscles),
    equipment,
    pattern,
    joints,
    compound: o.compound ?? x.mechanic === 'compound',
    ...(o.unit ? { unit: o.unit } : {}),
    level: x.level,
    instructions: x.instructions,
  })
}
for (const e of EXTRAS) out.push({ ...e, level: 'beginner', instructions: [] })

const names = new Set()
for (const e of out) {
  if (names.has(e.name)) throw new Error(`duplicate name: ${e.name}`)
  names.add(e.name)
}
out.sort((a, b) => a.name.localeCompare(b.name))

const target = resolve(here, '../src/data/exercises.json')
writeFileSync(
  target,
  JSON.stringify({ version: LIBRARY_VERSION, source: 'free-exercise-db (Unlicense) plus Fittrack additions', exercises: out }, null, 1) + '\n',
)
console.log(`${out.length} exercises written to ${target}`)
