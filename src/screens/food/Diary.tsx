import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { db, type DiaryEntry, type Food, type Meal } from '../../db'
import { useTarget, useToday } from '../../hooks'
import { addDays, formatDayLong, relativeDay } from '../../lib/dates'
import { fmt1, fmtInt } from '../../lib/format'
import { sumNutrients } from '../../lib/macros'
import { copyEntries, deleteEntries, foodFromEntry, MEAL_LABEL, MEALS, restoreEntries } from '../../store/diary'
import { IconChevronLeft, IconChevronRight, IconCopy, IconDots, IconPlus, IconTrash } from '../../ui/icons'
import { Button, cx, Group, IconButton, ListRow, Screen, Sheet, TextInput } from '../../ui/kit'
import { useToast } from '../../ui/toast'
import { PortionSheet } from './PortionSheet'

/** "today", "tomorrow" or a short date, for use inside a sentence. */
function dayInSentence(day: string, today: string): string {
  const r = relativeDay(day, today)
  return ['Today', 'Yesterday', 'Tomorrow'].includes(r) ? r.toLowerCase() : r
}

function entryAmount(e: DiaryEntry): string {
  if (e.servingName && e.servingCount) return `${fmt1(e.servingCount)} × ${e.servingName}`
  if (e.grams) return `${fmt1(e.grams)} g`
  return e.source === 'quick' ? 'Quick add' : ''
}

export default function Diary() {
  const navigate = useNavigate()
  const toast = useToast()
  const today = useToday()
  const [params, setParams] = useSearchParams()
  const date = params.get('d') ?? today
  const setDate = (d: string) => setParams(d === today ? {} : { d }, { replace: true })
  const target = useTarget(date)
  const entries = useLiveQuery(() => db.diaryEntries.where('date').equals(date).toArray(), [date])
  const [editing, setEditing] = useState<{ entry: DiaryEntry; food: Food } | null>(null)
  const [mealMenu, setMealMenu] = useState<Meal | null>(null)
  const [copyDate, setCopyDate] = useState('')

  const sorted = (entries ?? []).slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const byMeal = (m: Meal) => sorted.filter((e) => e.meal === m)
  const totals = sumNutrients(sorted.map((e) => e.macros))

  const openEntry = async (e: DiaryEntry) => {
    if (e.source === 'quick' || (!e.foodId && !e.grams)) {
      navigate(`/food/quick?edit=${e.id}`)
      return
    }
    const food = (e.foodId ? await db.foods.get(e.foodId) : undefined) ?? foodFromEntry(e)
    if (food) setEditing({ entry: e, food })
  }

  const copyMeal = async (meal: Meal, to: string) => {
    const rows = byMeal(meal)
    if (!rows.length) return
    const copies = await copyEntries(rows, to)
    setMealMenu(null)
    toast({
      message: `${MEAL_LABEL[meal]} copied to ${dayInSentence(to, today)}`,
      action: { label: 'Undo', onClick: () => void deleteEntries(copies.map((c) => c.id)) },
    })
  }

  const deleteMeal = async (meal: Meal) => {
    const rows = await deleteEntries(byMeal(meal).map((e) => e.id))
    setMealMenu(null)
    toast({ message: `${MEAL_LABEL[meal]} deleted`, action: { label: 'Undo', onClick: () => restoreEntries(rows) } })
  }

  return (
    <Screen
      title={
        <span className="flex items-center gap-1">
          <IconButton label="Previous day" className="-ml-2" onClick={() => setDate(addDays(date, -1))}>
            <IconChevronLeft />
          </IconButton>
          <button type="button" className="min-w-0 truncate" onClick={() => setDate(today)}>
            {relativeDay(date, today)}
          </button>
          <IconButton label="Next day" onClick={() => setDate(addDays(date, 1))}>
            <IconChevronRight />
          </IconButton>
        </span>
      }
      subtitle={date === today ? formatDayLong(date) : undefined}
      className="pb-24"
    >
      {MEALS.map((meal) => {
        const rows = byMeal(meal)
        const kcal = rows.reduce((s, e) => s + e.macros.kcal, 0)
        return (
          <section key={meal} className="mt-4">
            <div className="mb-1.5 flex items-center gap-1 px-1">
              <h2 className="flex-1 font-semibold">
                {MEAL_LABEL[meal]}
                {rows.length > 0 && <span className="ml-2 text-sm font-medium tabular-nums text-muted">{fmtInt(kcal)} kcal</span>}
              </h2>
              {rows.length > 0 && (
                <IconButton label={`${MEAL_LABEL[meal]} options`} className="size-9" onClick={() => setMealMenu(meal)}>
                  <IconDots size={20} className="rotate-90" />
                </IconButton>
              )}
              <Button size="sm" variant="ghost" onClick={() => navigate(`/food/add?meal=${meal}${date !== today ? `&d=${date}` : ''}`)}>
                <IconPlus size={18} /> Add
              </Button>
            </div>
            {rows.length > 0 ? (
              <Group>
                {rows.map((e) => (
                  <ListRow
                    key={e.id}
                    title={e.name}
                    subtitle={[e.brand, entryAmount(e)].filter(Boolean).join(' · ')}
                    detail={
                      <>
                        <span className="font-semibold text-ink">{fmtInt(e.macros.kcal)}</span>
                        <span className="block text-xs">P {fmt1(e.macros.protein)}</span>
                      </>
                    }
                    chevron={false}
                    onClick={() => void openEntry(e)}
                  />
                ))}
              </Group>
            ) : (
              <button
                type="button"
                onClick={() => navigate(`/food/add?meal=${meal}${date !== today ? `&d=${date}` : ''}`)}
                className="flex min-h-12 w-full items-center rounded-3xl border border-dashed border-line px-4 text-sm text-faint active:bg-surface"
              >
                Nothing logged
              </button>
            )}
          </section>
        )
      })}

      <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+3.5rem)] z-20 border-t border-line bg-canvas/95 backdrop-blur-md">
        <div className="mx-auto grid max-w-xl grid-cols-4 gap-1 px-4 py-2 text-center text-xs">
          {[
            { label: 'kcal', v: totals.kcal, t: target?.kcal, c: 'var(--accent)' },
            { label: 'Protein', v: totals.protein, t: target?.proteinG, c: 'var(--protein)' },
            { label: 'Carbs', v: totals.carbs, t: target?.carbsG, c: 'var(--carbs)' },
            { label: 'Fat', v: totals.fat, t: target?.fatG, c: 'var(--fat)' },
          ].map((x) => {
            const over = x.t != null && x.v > x.t * 1.05
            return (
              <div key={x.label}>
                <div className={cx('text-sm font-bold tabular-nums', over && 'text-warn')}>
                  {fmtInt(x.v)}
                  <span className="font-medium text-muted"> / {x.t != null ? fmtInt(x.t) : '–'}</span>
                </div>
                <div className="flex items-center justify-center gap-1 font-semibold text-muted">
                  <span className="size-1.5 rounded-full" style={{ background: x.c }} />
                  {x.label}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <PortionSheet
        open={!!editing}
        food={editing?.food ?? null}
        entry={editing?.entry}
        date={date}
        meal={editing?.entry.meal ?? 'breakfast'}
        onClose={() => setEditing(null)}
        onDone={() => setEditing(null)}
      />

      <Sheet open={!!mealMenu} onClose={() => setMealMenu(null)} title={mealMenu ? MEAL_LABEL[mealMenu] : ''}>
        {mealMenu && (
          <div className="space-y-3">
            <Group className="bg-sunken">
              {date !== today && <ListRow icon={<IconCopy size={20} />} title="Copy to today" onClick={() => void copyMeal(mealMenu, today)} />}
              {addDays(date, 1) !== today && (
                <ListRow icon={<IconCopy size={20} />} title={`Copy to ${dayInSentence(addDays(date, 1), today)}`} onClick={() => void copyMeal(mealMenu, addDays(date, 1))} />
              )}
              <ListRow icon={<IconTrash size={20} />} title="Delete meal" className="text-danger" onClick={() => void deleteMeal(mealMenu)} />
            </Group>
            <div className="flex items-end gap-2">
              <label className="flex-1">
                <span className="mb-1.5 block text-sm font-medium text-muted">Copy to another day</span>
                <TextInput type="date" value={copyDate} onChange={(e) => setCopyDate(e.target.value)} />
              </label>
              <Button variant="secondary" disabled={!copyDate} onClick={() => void copyMeal(mealMenu, copyDate)}>
                Copy
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </Screen>
  )
}
