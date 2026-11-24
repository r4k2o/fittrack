import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router-dom'
import { db } from '../../../db'
import { useObjectUrl } from '../../../hooks'
import { formatDayLong, localDay } from '../../../lib/dates'
import { fmt1 } from '../../../lib/format'
import { deletePhoto, POSE_LABEL, restorePhotos, setStarred } from '../../../store/photos'
import { IconStar, IconTrash } from '../../../ui/icons'
import { Button, EmptyState, IconButton, Screen } from '../../../ui/kit'
import { useToast } from '../../../ui/toast'

export default function PhotoViewer() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const photo = useLiveQuery(async () => (await db.photos.get(id)) ?? null, [id])
  const url = useObjectUrl(photo?.image)
  if (photo === undefined) return null
  if (photo === null)
    return (
      <Screen back="/progress?tab=photos" title="Photo">
        <EmptyState title="Photo not found">It may have been deleted or replaced by a retake.</EmptyState>
      </Screen>
    )
  const day = localDay(new Date(photo.takenAt))
  const remove = async () => {
    const row = await deletePhoto(photo.id)
    navigate('/progress?tab=photos', { replace: true })
    if (row) toast({ message: 'Photo deleted', action: { label: 'Undo', onClick: () => restorePhotos([row]) } })
  }
  return (
    <Screen
      back="/progress?tab=photos"
      title={`${POSE_LABEL[photo.pose]} · ${formatDayLong(day)}`}
      actions={
        <>
          <IconButton label={photo.starred ? 'Unstar' : 'Star: keep it when retaking this week'} className={photo.starred ? 'text-amber-500' : 'text-ink-2'} onClick={() => void setStarred(photo.id, !photo.starred)}>
            <IconStar size={20} fill={photo.starred ? 'currentColor' : 'none'} />
          </IconButton>
          <IconButton label="Delete photo" className="text-danger" onClick={() => void remove()}>
            <IconTrash size={20} />
          </IconButton>
        </>
      }
    >
      <div className="overflow-hidden rounded-[24px] bg-fill">{url && <img src={url} alt={`${POSE_LABEL[photo.pose]} photo of ${formatDayLong(day)}`} className="w-full" />}</div>
      <p className="mt-3 px-1 text-[15px] text-ink-2">
        {photo.isoWeek.replace('-W', ', week ')}
        {photo.weightKg != null ? ` · ${fmt1(photo.weightKg)} kg that day` : ''}
        {photo.starred ? ' · starred, kept when you retake this week' : ''}
      </p>
      <Button block size="lg" variant="secondary" className="mt-4" onClick={() => navigate(`/progress/photos/compare?pose=${photo.pose}&b=${photo.id}`)}>
        Compare with another week
      </Button>
    </Screen>
  )
}
