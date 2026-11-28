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
  ['Zeit', 'Morgens nach der Toilette, vor dem Frühstück'],
  ['Licht', 'Gleicher Ort, Blick zum Fenster oder zu einer festen Lampe; nie nur Deckenlicht'],
  ['Abstand', 'iPhone im Regal oder auf einem Stativ, etwa 2,5 m entfernt, auf Brusthöhe, hochkant'],
  ['Posen', 'Vorne, Seite und Hinten, locker, Arme leicht vom Körper weg'],
  ['Kleidung', 'Jedes Mal dieselbe'],
  ['Auslöser', 'Der 10-Sekunden-Timer mit Countdown'],
]

export function CaptureGuide({ onDone }: { onDone?: () => void }) {
  return (
    <Card className="!p-4">
      <p className="text-[16px] font-semibold">Jedes Mal gleich fotografieren</p>
      <p className="mt-1 text-[14px] text-ink-2">Vergleichen klappt nur, wenn sich zwischen den Fotos nur du veränderst.</p>
      <dl className="mt-3 divide-y divide-line">
        {GUIDE.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[5.5rem_1fr] gap-2 py-2 text-[14px]">
            <dt className="font-semibold">{k}</dt>
            <dd className="text-ink-2">{v}</dd>
          </div>
        ))}
      </dl>
      {onDone && (
        <Button size="sm" className="mt-2" onClick={onDone}>
          Verstanden
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
          <IconCamera size={20} /> Fotos machen
        </Button>
        <Button size="lg" variant="secondary" disabled={(photos?.length ?? 0) < 2} onClick={() => navigate('/progress/photos/compare')}>
          Vergleichen
        </Button>
      </div>

      <div className="card mt-3 p-3">
        <div className="grid grid-cols-[4.5rem_1fr_1fr_1fr] gap-2 px-1 pb-2 text-center text-[12px] font-semibold text-ink-3">
          <span className="text-left">Woche</span>
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
                  <p className="font-bold">{w === thisWeek ? 'Diese Woche' : w.replace(/^\d{4}-W/, 'KW ')}</p>
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
                      aria-label={`Foto ${POSE_LABEL[p]} machen`}
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
        Fotos bleiben auf diesem iPhone und werden nirgendwohin gesendet. Ins Backup kommen sie nur, wenn dort „Fotos einschließen“ an ist.
      </p>
      {guideSeen && (
        <div className="mt-4">
          <CaptureGuide />
        </div>
      )}
    </>
  )
}
