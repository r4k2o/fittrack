import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { AppleExportReducer, reduceAppleExport } from './appleExport'
import { parseHealthLines } from './health'

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE HealthData [ <!ELEMENT HealthData (ExportDate,Me,(Record|Workout)*)> ]>
<HealthData locale="en_GB">
 <ExportDate value="2026-11-20 08:00:00 +0100"/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="Kim&apos;s iPhone" unit="count" startDate="2026-11-16 08:00:00 +0100" endDate="2026-11-16 08:10:00 +0100" value="1200"/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="Kim&apos;s iPhone" unit="count" startDate="2026-11-16 12:00:00 +0100" endDate="2026-11-16 12:30:00 +0100" value="3000"/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="Kim&apos;s Watch" unit="count" startDate="2026-11-16 08:00:00 +0100" endDate="2026-11-16 12:30:00 +0100" value="3900"/>
 <Record type="HKQuantityTypeIdentifierBodyMass" sourceName="Scale" unit="kg" startDate="2026-11-16 07:01:00 +0100" endDate="2026-11-16 07:01:00 +0100" value="80.4">
  <MetadataEntry key="HKWasUserEntered" value="0"/>
 </Record>
 <Record type="HKQuantityTypeIdentifierBodyFatPercentage" sourceName="Scale" unit="%" startDate="2026-11-16 07:01:00 +0100" endDate="2026-11-16 07:01:00 +0100" value="0.183"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Watch" startDate="2026-11-15 23:30:00 +0100" endDate="2026-11-16 03:00:00 +0100" value="HKCategoryValueSleepAnalysisAsleepCore"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Watch" startDate="2026-11-16 03:00:00 +0100" endDate="2026-11-16 06:30:00 +0100" value="HKCategoryValueSleepAnalysisAsleepDeep"/>
 <Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Watch" unit="count/min" startDate="2026-11-16 07:00:00 +0100" endDate="2026-11-16 07:00:00 +0100" value="61"/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="Old phone" unit="count" startDate="2019-01-01 08:00:00 +0100" endDate="2019-01-01 08:10:00 +0100" value="500"/>
 <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="45" durationUnit="min" sourceName="Watch" startDate="2026-11-16 18:00:00 +0100" endDate="2026-11-16 18:45:00 +0100">
  <WorkoutEvent type="HKWorkoutEventTypeSegment" date="2026-11-16 18:10:00 +0100"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierActiveEnergyBurned" startDate="2026-11-16 18:00:00 +0100" endDate="2026-11-16 18:45:00 +0100" sum="452.6" unit="kcal"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceWalkingRunning" startDate="2026-11-16 18:00:00 +0100" endDate="2026-11-16 18:45:00 +0100" sum="5.03" unit="mi"/>
 </Workout>
 <Workout workoutActivityType="HKWorkoutActivityTypeCycling" duration="60" durationUnit="min" totalDistance="25" totalDistanceUnit="km" totalEnergyBurned="500" totalEnergyBurnedUnit="kcal" sourceName="Watch" startDate="2026-11-17 18:00:00 +0100" endDate="2026-11-17 19:00:00 +0100"/>
</HealthData>
`

describe('Apple Health export', () => {
  it('reduces records and workouts to the import lines, across any chunk boundary', () => {
    const r = new AppleExportReducer('2020-01-01')
    for (let i = 0; i < XML.length; i += 7) r.feed(XML.slice(i, i + 7))
    const text = r.finish()
    expect(text.split('\n').filter((l) => l && !l.startsWith('#'))).toEqual([
      "steps;2026-11-16;4200;Kim's iPhone",
      "steps;2026-11-16;3900;Kim's Watch",
      'weight;2026-11-16 07:01:00 +0100;80.4',
      'bodyfat;2026-11-16 07:01:00 +0100;0.183',
      'sleep;2026-11-15 23:30:00 +0100;2026-11-16 03:00:00 +0100;HKCategoryValueSleepAnalysisAsleepCore',
      'sleep;2026-11-16 03:00:00 +0100;2026-11-16 06:30:00 +0100;HKCategoryValueSleepAnalysisAsleepDeep',
      'workout;2026-11-16 18:00:00 +0100;2026-11-16 18:45:00 +0100;HKWorkoutActivityTypeRunning;453;8.1',
      'workout;2026-11-17 18:00:00 +0100;2026-11-17 19:00:00 +0100;HKWorkoutActivityTypeCycling;500;25',
    ])
    expect(r.counts).toEqual({ stepDays: 1, weights: 1, bodyFat: 1, sleepSegments: 2, workouts: 2 })
  })

  it('reads the XML from inside export.zip and the result imports cleanly', async () => {
    const zip = zipSync({ 'apple_health_export/export.xml': strToU8(XML), 'apple_health_export/export_cda.xml': strToU8('<x/>') })
    const progress: number[] = []
    const { text } = await reduceAppleExport(new Blob([zip]), { since: '2020-01-01', onProgress: (f) => progress.push(f) })
    expect(progress.at(-1)).toBe(1)
    const parsed = parseHealthLines(text)
    expect(parsed.skipped).toEqual([])
    const get = (type: string) => parsed.metrics.find((m) => m.type === type)?.value
    expect(get('steps')).toBe(4200)
    expect(get('weight')).toBe(80.4)
    expect(get('bodyFat')).toBe(18.3)
    expect(get('sleepMin')).toBe(420)
    expect(parsed.workouts.map((w) => [w.type, w.kcal, w.distanceKm])).toEqual([
      ['run', 453, 8.1],
      ['cycle', 500, 25],
    ])
  })

  it('reads a bare export.xml too', async () => {
    const { counts } = await reduceAppleExport(new Blob([XML]))
    expect(counts.stepDays).toBe(2)
  })
})
