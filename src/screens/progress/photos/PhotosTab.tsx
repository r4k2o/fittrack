// Progress photos: a capture guide, then a grid with weeks as rows and poses as
// columns, filed automatically by ISO week, pose and that day's weight.

import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import type { Photo } from '../../../db'
import { useObjectUrl, useSetting, useToday } from '../../../hooks'
import { formatDayShort, isoWeek, localDay } from '../../../lib/dates'
import { fmt1 } from '../../../lib/format'
import { setSetting } from '../../../store/settings'
import { listPhotos, POSE_LABEL, POSES } from '../../../store/photos'
import { IconCamera, IconLock, IconPlus, IconStar } from '../../../ui/icons'
import { Button, Card, cx } from '../../../ui/kit'

const GUIDE: [string, string][] = [
  ['Time', 'Morning, after the bathroom, before eating'],
  ['Light', 'The same spot, facing a window or a fixed lamp; never a ceiling light alone'],
  ['Distance and height', 'Phone on a shelf or tripod about 2.5 m away at chest height, in portrait'],
  ['Poses', 'Front, side and back, relaxed, arms slightly away from the body'],
  ['Clothing', 'The same each time'],
  ['Trigger', 'The 10-second timer with a countdown'],
]

export function CaptureGuide({ onDone }: { onDone?: () => void }) {
  return (
    <Card className="!p-4">
      <p className="text-[16px] font-semibold">Take them the same way every time</p>
      <p className="mt-1 text-[14px] text-ink-2">Comparison only works when only you change between photos.</p>
      <dl className="mt-3 divide-y divide-line">
        {GUIDE.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[7.5rem_1fr] gap-2 py-2 text-[14px]">
            <dt className="font-semibold">{k}</dt>
            <dd className="text-ink-2">{v}</dd>
          </div>
        ))}
      </dl>
      {onDone && (
        <Button size="sm" className="mt-2" onClick={onDone}>
          Got it
        </Button>
      )}
    </Card>
  )
}

function Thumb({ photo, onOpen }: { photo: Photo; onOpen: () => void }) {
  const url = useObjectUrl(photo.thumbnail)
  return (
    <button type="button" onClick={onOpen} className="press relative block aspect-[3/4] w-full overflow-hidden rounded-[14px] bg-fill" aria-label={`${POSE_LABEL[photo.pose]}, ${formatDayShort(localDay(new Date(photo.takenAt)))}`}>
      {url && <img src={url} alt="" className="size-full object-cover" />}
      {photo.starred && (
        <span className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/45 text-amber-300">
          <IconStar size={14} fill="currentColor" />
        </span>
      )}
    </button>
  )
}

export default function PhotosTab() {
  const navigate = useNavigate()
  const today = useToday()
  const photos = useLiveQuery(() => listPhotos(), [])
  const guideSeen = useSetting('photoGuideSeen')
  const thisWeek = isoWeek(today)
  const weeks = [...new Set([thisWeek, ...(photos ?? []).map((p) => p.isoWeek)])].sort().reverse()
  const cell = (week: string, pose: Photo['pose']) => (photos ?? []).filter((p) => p.isoWeek === week && p.pose === pose).sort((a, b) => Number(b.starred) - Number(a.starred) || b.takenAt.localeCompare(a.takenAt))[0]

  return (
    <>
      {guideSeen === false && <CaptureGuide onDone={() => void setSetting('photoGuideSeen', true)} />}
      <div className={cx('flex gap-2', guideSeen === false && 'mt-3')}>
        <Button size="lg" className="flex-1" onClick={() => navigate('/progress/photos/new?pose=front')}>
          <IconCamera size={20} /> Take photos
        </Button>
        <Button size="lg" variant="secondary" disabled={(photos?.length ?? 0) < 2} onClick={() => navigate('/progress/photos/compare')}>
          Compare
        </Button>
      </div>

      <div className="card mt-3 p-3">
        <div className="grid grid-cols-[4.5rem_1fr_1fr_1fr] gap-2 px-1 pb-2 text-center text-[12px] font-bold uppercase tracking-wider text-ink-3">
          <span className="text-left">Week</span>
          {POSES.map((p) => (
            <span key={p}>{POSE_LABEL[p]}</span>
          ))}
        </div>
        <div className="space-y-2">
          {weeks.map((w) => {
            const any = POSES.map((p) => cell(w, p)).find(Boolean)
            return (
              <div key={w} className="grid grid-cols-[4.5rem_1fr_1fr_1fr] items-center gap-2">
                <div className="text-[12px] leading-tight">
                  <p className="font-bold">{w === thisWeek ? 'This week' : w.replace(/^\d{4}-W/, 'Week ')}</p>
                  {any?.weightKg != null && <p className="tabular-nums text-ink-2">{fmt1(any.weightKg)} kg</p>}
                </div>
                {POSES.map((p) => {
                  const ph = cell(w, p)
                  return ph ? (
                    <Thumb key={p} photo={ph} onOpen={() => navigate(`/progress/photos/${ph.id}`)} />
                  ) : w === thisWeek ? (
                    <button
                      key={p}
                      type="button"
                      aria-label={`Take the ${POSE_LABEL[p].toLowerCase()} photo`}
                      onClick={() => navigate(`/progress/photos/new?pose=${p}`)}
                      className="press flex aspect-[3/4] items-center justify-center rounded-[14px] border-2 border-dashed border-line text-ink-3"
                    >
                      <IconPlus size={22} />
                    </button>
                  ) : (
                    <span key={p} className="aspect-[3/4] rounded-[14px] bg-fill" />
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
      <p className="mt-3 flex items-start gap-2 px-1 text-[13px] text-ink-2">
        <IconLock size={15} className="mt-0.5 shrink-0" />
        Photos stay on this phone and are never sent anywhere. They go into a backup only when its "include photos" switch is on.
      </p>
      {guideSeen && (
        <div className="mt-4">
          <CaptureGuide />
        </div>
      )}
    </>
  )
}
