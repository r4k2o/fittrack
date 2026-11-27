// Progress photos stay on the phone: never sent to any API, and in the backup only when
// its "include photos" switch is on. A retake in the same week replaces the earlier
// shot of that pose unless that one is starred.

import { db, newRow, type Photo } from '../db'
import { isoWeek, localDay } from '../lib/dates'
import { metricSeries } from './metrics'

export type Pose = Photo['pose']
export const POSES: readonly Pose[] = ['front', 'side', 'back']
export const POSE_LABEL: Record<Pose, string> = { front: 'Vorne', side: 'Seite', back: 'Hinten' }

export type PhotoMeta = Omit<Photo, 'image'>

export async function listPhotos(): Promise<Photo[]> {
  const rows = await db.photos.toArray()
  return rows.sort((a, b) => b.takenAt.localeCompare(a.takenAt))
}

export async function lastPhoto(pose: Pose): Promise<Photo | undefined> {
  return db.photos.where('[pose+takenAt]').between([pose, ''], [pose, '￿']).last()
}

/** Saves a photo with that day's weight; returns the photo and any shot it replaced. */
export async function savePhoto(input: { pose: Pose; image: Blob; thumbnail: Blob; takenAt?: Date }): Promise<{ photo: Photo; replaced: Photo[] }> {
  const at = input.takenAt ?? new Date()
  const day = localDay(at)
  const week = isoWeek(day)
  const weight = (await metricSeries('weight', day, day))[0]?.value ?? null
  return db.transaction('rw', db.photos, async () => {
    const same = await db.photos.where('isoWeek').equals(week).filter((p) => p.pose === input.pose && !p.starred).toArray()
    await db.photos.bulkDelete(same.map((p) => p.id))
    const photo = newRow<Photo>({ takenAt: at.toISOString(), isoWeek: week, pose: input.pose, image: input.image, thumbnail: input.thumbnail, weightKg: weight, starred: false })
    await db.photos.add(photo)
    return { photo, replaced: same }
  })
}

export async function setStarred(id: string, starred: boolean): Promise<void> {
  await db.photos.update(id, { starred, updatedAt: new Date().toISOString() })
}

export async function deletePhoto(id: string): Promise<Photo | null> {
  const row = await db.photos.get(id)
  if (row) await db.photos.delete(id)
  return row ?? null
}

export async function restorePhotos(rows: Photo[]): Promise<void> {
  await db.photos.bulkPut(rows)
}
