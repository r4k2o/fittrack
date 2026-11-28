// Progress: segments for training, body, food, sleep and photos, one chart per metric
// with its unit and averaging window in the title. The weekly review and the compare
// view open from the header. No chart presents a single noisy day as progress.

import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useToday } from '../../hooks'
import { addDays, formatDayShort, weekStart } from '../../lib/dates'
import { reviewForWeek } from '../../store/progress'
import { IconChevronLeft, IconChevronRight, IconPlus } from '../../ui/icons'
import { Button, IconButton, Screen, Segmented, Sheet, Spinner } from '../../ui/kit'
import { WeeklyReviewCard } from '../shared/WeeklyReviewCard'
import { WeightSheet } from '../shared/WeightSheet'
import BodyTab from './BodyTab'
import NutritionTab from './NutritionTab'
import PhotosTab from './photos/PhotosTab'
import SleepTab from './SleepTab'
import TrainingTab from './TrainingTab'

const TABS = ['training', 'body', 'food', 'sleep', 'photos'] as const
type Tab = (typeof TABS)[number]
const LABEL: Record<Tab, string> = { training: 'Training', body: 'Körper', food: 'Essen', sleep: 'Schlaf', photos: 'Fotos' }
const LAST_TAB = 'fittrack.progressTab'

function lastTab(): Tab {
  try {
    const t = localStorage.getItem(LAST_TAB) as Tab | null
    return t && TABS.includes(t) ? t : 'training'
  } catch {
    return 'training'
  }
}

export default function Progress() {
  const navigate = useNavigate()
  const today = useToday()
  const [params, setParams] = useSearchParams()
  const tab: Tab = TABS.includes(params.get('tab') as Tab) ? (params.get('tab') as Tab) : lastTab()
  const [logOpen, setLogOpen] = useState(false)
  const lastMonday = addDays(weekStart(today), -7)
  const [reviewWeek, setReviewWeek] = useState<string | null>(null)
  const review = useLiveQuery(async () => (reviewWeek ? reviewForWeek(reviewWeek) : null), [reviewWeek])

  return (
    <Screen
      title="Fortschritt"
      actions={
        <>
          <Button size="sm" variant="glass" onClick={() => setReviewWeek(lastMonday)}>
            Rückblick
          </Button>
          <Button size="sm" variant="glass" onClick={() => navigate('/progress/compare')}>
            Vergleich
          </Button>
          {tab === 'body' && (
            <IconButton label="Gewicht eintragen" variant="glass" className="size-9" onClick={() => setLogOpen(true)}>
              <IconPlus size={18} strokeWidth={2.6} />
            </IconButton>
          )}
        </>
      }
    >
      <Segmented
        size="sm"
        className="mb-3"
        value={tab}
        options={TABS.map((t) => ({ value: t, label: LABEL[t] }))}
        onChange={(t) => {
          try {
            localStorage.setItem(LAST_TAB, t)
          } catch {
            // private mode: the tab is simply not remembered
          }
          setParams({ tab: t }, { replace: true })
        }}
      />
      {tab === 'body' && <BodyTab onLog={() => setLogOpen(true)} />}
      {tab === 'training' && <TrainingTab />}
      {tab === 'food' && <NutritionTab />}
      {tab === 'sleep' && <SleepTab />}
      {tab === 'photos' && <PhotosTab />}

      <WeightSheet open={logOpen} onClose={() => setLogOpen(false)} />
      <Sheet open={!!reviewWeek} onClose={() => setReviewWeek(null)} title="Wochenrückblick">
        {reviewWeek && (
          <div className="pb-2">
            <div className="mb-2 flex items-center justify-between">
              <IconButton label="Woche davor" className="size-10" onClick={() => setReviewWeek(addDays(reviewWeek, -7))}>
                <IconChevronLeft size={20} />
              </IconButton>
              <span className="text-[14px] font-semibold text-ink-2">{reviewWeek === lastMonday ? 'Letzte Woche' : reviewWeek === weekStart(today) ? 'Diese Woche bisher' : `Woche ab ${formatDayShort(reviewWeek)}`}</span>
              <IconButton label="Woche danach" className="size-10" disabled={reviewWeek >= weekStart(today)} onClick={() => setReviewWeek(addDays(reviewWeek, 7))}>
                <IconChevronRight size={20} />
              </IconButton>
            </div>
            {review ? (
              <WeeklyReviewCard review={review} />
            ) : (
              <div className="flex justify-center py-8 text-ink-2">
                <Spinner />
              </div>
            )}
          </div>
        )}
      </Sheet>
    </Screen>
  )
}
