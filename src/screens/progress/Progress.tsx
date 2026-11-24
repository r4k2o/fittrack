// Progress: segments for body, training, food, sleep and photos, one chart per metric
// with its unit and averaging window in the title. The weekly review and the compare
// view open from the header. No chart presents a single noisy day as progress.

import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useToday } from '../../hooks'
import { addDays, weekStart } from '../../lib/dates'
import { reviewForWeek } from '../../store/progress'
import { IconChevronLeft, IconChevronRight, IconPlus } from '../../ui/icons'
import { Button, IconButton, Screen, Segmented, Sheet, Spinner, type Tone } from '../../ui/kit'
import { WeeklyReviewCard } from '../shared/WeeklyReviewCard'
import { WeightSheet } from '../shared/WeightSheet'
import BodyTab from './BodyTab'
import NutritionTab from './NutritionTab'
import PhotosTab from './photos/PhotosTab'
import SleepTab from './SleepTab'
import TrainingTab from './TrainingTab'

const TABS = ['body', 'training', 'food', 'sleep', 'photos'] as const
type Tab = (typeof TABS)[number]
const LABEL: Record<Tab, string> = { body: 'Body', training: 'Training', food: 'Food', sleep: 'Sleep', photos: 'Photos' }
const TONE: Record<Tab, Tone> = { body: 'body', training: 'train', food: 'food', sleep: 'neutral', photos: 'neutral' }
const EYEBROW: Record<Tab, string> = {
  body: 'Weight and body fat',
  training: 'Sets, strength and cardio',
  food: 'Adherence and expenditure',
  sleep: 'Sleep and steps',
  photos: 'Progress photos',
}

export default function Progress() {
  const navigate = useNavigate()
  const today = useToday()
  const [params, setParams] = useSearchParams()
  const tab: Tab = TABS.includes(params.get('tab') as Tab) ? (params.get('tab') as Tab) : 'body'
  const [logOpen, setLogOpen] = useState(false)
  const lastMonday = addDays(weekStart(today), -7)
  const [reviewWeek, setReviewWeek] = useState<string | null>(null)
  const review = useLiveQuery(async () => (reviewWeek ? reviewForWeek(reviewWeek) : null), [reviewWeek])

  return (
    <Screen
      tone={TONE[tab]}
      eyebrow={EYEBROW[tab]}
      title="Progress"
      actions={
        <>
          <Button size="sm" variant="glass" onClick={() => setReviewWeek(lastMonday)}>
            Review
          </Button>
          <Button size="sm" variant="glass" onClick={() => navigate('/progress/compare')}>
            Compare
          </Button>
          {tab === 'body' && (
            <IconButton label="Log weight" variant="glass" className="size-9" onClick={() => setLogOpen(true)}>
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
        onChange={(t) => setParams(t === 'body' ? {} : { tab: t }, { replace: true })}
      />
      {tab === 'body' && <BodyTab onLog={() => setLogOpen(true)} />}
      {tab === 'training' && <TrainingTab />}
      {tab === 'food' && <NutritionTab />}
      {tab === 'sleep' && <SleepTab />}
      {tab === 'photos' && <PhotosTab />}

      <WeightSheet open={logOpen} onClose={() => setLogOpen(false)} />
      <Sheet open={!!reviewWeek} onClose={() => setReviewWeek(null)} title="Weekly review">
        {reviewWeek && (
          <div className="pb-2">
            <div className="mb-2 flex items-center justify-between">
              <IconButton label="Earlier week" className="size-10" onClick={() => setReviewWeek(addDays(reviewWeek, -7))}>
                <IconChevronLeft size={20} />
              </IconButton>
              <span className="text-[14px] font-semibold text-ink-2">{reviewWeek === lastMonday ? 'Last week' : reviewWeek === weekStart(today) ? 'This week so far' : 'Earlier'}</span>
              <IconButton label="Later week" className="size-10" disabled={reviewWeek >= weekStart(today)} onClick={() => setReviewWeek(addDays(reviewWeek, 7))}>
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
