import { describe, expect, it } from 'vitest'
import { parseHealthDate, parseHealthLines, sleepNights, sleepScore, sleepStage, workoutType, type Night } from './health'

const local = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime()

describe('health dates', () => {
  it('reads ISO, Apple export, German, British and US forms', () => {
    expect(parseHealthDate('2026-11-16')?.getTime()).toBe(local(2026, 11, 16))
    expect(parseHealthDate('2026-11-16T07:02')?.getTime()).toBe(local(2026, 11, 16, 7, 2))
    expect(parseHealthDate('2026-11-16 07:02:11 +0100')?.toISOString()).toBe('2026-11-16T06:02:11.000Z')
    expect(parseHealthDate('2026-11-16T07:02:00Z')?.toISOString()).toBe('2026-11-16T07:02:00.000Z')
    expect(parseHealthDate('16.11.2026, 07:02')?.getTime()).toBe(local(2026, 11, 16, 7, 2))
    expect(parseHealthDate('16 Nov 2026 at 07:02')?.getTime()).toBe(local(2026, 11, 16, 7, 2))
    expect(parseHealthDate('16. März 2026')?.getTime()).toBe(local(2026, 3, 16))
    expect(parseHealthDate('Nov 16, 2026 at 7:02 PM')?.getTime()).toBe(local(2026, 11, 16, 19, 2))
    expect(parseHealthDate('31.02.2026')).toBeNull()
    expect(parseHealthDate('yesterday')).toBeNull()
  })

  it('recognises sleep stages and workout types in English and German', () => {
    expect(sleepStage('Core')).toBe('core')
    expect(sleepStage('HKCategoryValueSleepAnalysisAsleepDeep')).toBe('deep')
    expect(sleepStage('Wach')).toBe('awake')
    expect(sleepStage('Im Bett')).toBe('inBed')
    expect(sleepStage('Asleep (Unspecified)')).toBe('asleep')
    expect(workoutType('HKWorkoutActivityTypeRunning')).toBe('run')
    expect(workoutType('Radfahren')).toBe('cycle')
    expect(workoutType('Traditional Strength Training')).toBe('strength')
    expect(workoutType('Soccer')).toBe('sport')
    expect(workoutType('Yoga')).toBe('other')
  })
})

describe('health lines', () => {
  it('reduces each metric to one value per day', () => {
    const p = parseHealthLines(
      [
        'type;date;value',
        'steps;2026-11-16;6000;iPhone',
        'steps;2026-11-16;2000;iPhone',
        'steps;2026-11-16;7500;Watch',
        'steps;2026-11-17;8.423',
        'weight;2026-11-16 08:30;80,9',
        'weight;2026-11-16 07:02;80,4 kg',
        'weight;2026-11-17;176 lb',
        'bodyfat;2026-11-16 07:00;0.182',
        'bodyfat;2026-11-16 21:00;18.6 %',
        'sleepscore;2026-11-16;84',
      ].join('\n'),
    )
    const get = (type: string, date: string) => p.metrics.find((m) => m.type === type && m.date === date)?.value
    expect(get('steps', '2026-11-16')).toBe(8000) // iPhone 6000 + 2000 beats the watch's 7500
    expect(get('steps', '2026-11-17')).toBe(8423)
    expect(get('weight', '2026-11-16')).toBe(80.4) // first reading of the day
    expect(get('weight', '2026-11-17')).toBeCloseTo(79.83, 2)
    expect(get('bodyFat', '2026-11-16')).toBe(18.6) // latest reading of the day
    expect(get('sleepScore', '2026-11-16')).toBe(84)
    expect(p.fromDate).toBe('2026-11-16')
    expect(p.toDate).toBe('2026-11-17')
    expect(p.skipped).toEqual([])
  })

  it('accepts tabs and commas between fields and reports lines it cannot use', () => {
    const p = parseHealthLines('steps\t2026-11-16\t9000\nweight,2026-11-16,80.2\nmood;2026-11-16;5\nweight;16/13/2026;80\nsteps;2026-11-18;lots')
    expect(p.metrics.map((m) => `${m.type}:${m.value}`)).toEqual(['steps:9000', 'weight:80.2'])
    expect(p.skipped.map((s) => [s.line, s.reason])).toEqual([
      [3, 'unknown metric'],
      [4, 'date not readable'],
      [5, 'value not readable'],
    ])
  })

  it('files sleep under the wake-up date and sums the asleep stages', () => {
    const p = parseHealthLines(
      [
        'sleep;2026-11-15 23:30;2026-11-16 07:00;In Bed',
        'sleep;2026-11-15 23:40;2026-11-16 02:00;Core',
        'sleep;2026-11-16 02:00;2026-11-16 02:20;Awake',
        'sleep;2026-11-16 02:20;2026-11-16 04:00;Deep',
        'sleep;2026-11-16 04:00;2026-11-16 06:40;REM',
        // the same stretch recorded twice must not count twice
        'sleep;2026-11-16 04:00;2026-11-16 06:40;REM',
      ].join('\n'),
    )
    expect(p.nights).toHaveLength(1)
    const n = p.nights[0]
    expect(n.date).toBe('2026-11-16')
    expect(n.asleepMin).toBe(140 + 100 + 160)
    expect(n.interruptions).toBe(1)
    expect(p.metrics).toEqual([{ type: 'sleepMin', date: '2026-11-16', value: 400 }])
  })

  it('uses time in bed when a night has nothing else', () => {
    const nights = sleepNights([{ start: new Date(local(2026, 11, 16, 23)), end: new Date(local(2026, 11, 17, 6, 30)), stage: 'inBed' }])
    expect(nights.map((n) => [n.date, n.asleepMin])).toEqual([['2026-11-17', 450]])
  })

  it('keeps cardio workouts with a stable id and leaves strength workouts out', () => {
    const text = 'workout;2026-11-16 07:00;2026-11-16 07:45;Running;420 kcal;8,1 km\nworkout;2026-11-16 18:00;2026-11-16 19:00;Traditional Strength Training;300'
    const p = parseHealthLines(text)
    expect(p.workouts).toHaveLength(1)
    expect(p.workouts[0]).toMatchObject({ type: 'run', durationMin: 45, kcal: 420, distanceKm: 8.1, date: '2026-11-16' })
    expect(p.strengthWorkouts).toBe(1)
    expect(parseHealthLines(text).workouts[0].externalId).toBe(p.workouts[0].externalId)
  })
})

describe('sleep score', () => {
  const night = (date: string, h: number, m: number, asleepMin: number, interruptions = 0): Night => {
    const [y, mo, d] = date.split('-').map(Number)
    const start = new Date(y, mo - 1, d - 1, h, m)
    return { date, asleepMin, sleepStart: start, sleepEnd: new Date(start.getTime() + asleepMin * 60000), interruptions }
  }
  it('gives full marks for 7.5 hours at the usual bedtime without interruptions', () => {
    const prev = ['2026-11-13', '2026-11-14', '2026-11-15'].map((d) => night(d, 23, 0, 450))
    expect(sleepScore(night('2026-11-16', 23, 0, 450), prev)).toBe(100)
  })
  it('takes points off for short, late and broken nights', () => {
    const prev = ['2026-11-13', '2026-11-14', '2026-11-15'].map((d) => night(d, 23, 0, 450))
    // 6 h → 48; bedtime 45 min late → 10; two interruptions → 10
    expect(sleepScore(night('2026-11-16', 23, 45, 360, 2), prev)).toBe(68)
  })
})
