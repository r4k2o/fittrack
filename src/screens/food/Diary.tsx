import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type CSSProperties } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { db, type DiaryEntry, type Food, type Meal } from '../../db'
import { useTarget, useToday } from '../../hooks'
import { addDays, formatDayLong, relativeDay, weekStart } from '../../lib/dates'
import { fmt1, fmtInt } from '../../lib/format'
import { sumNutrients } from '../../lib/macros'
import { copyEntries, deleteEntries, foodFromEntry, MEAL_LABEL, MEALS, restoreEntries } from '../../store/diary'
import { deleteMealTemplate, recipeFood, saveMealTemplate } from '../../store/recipes'
import { IconCalendar, IconCopy, IconDots, IconPlus, IconStar, IconTrash } from '../../ui/icons'
import { Button, cx, Group, IconButton, ListRow, MacroBar, Screen, Sheet, SwipeRow, TextInput } from '../../ui/kit'
import { haptic } from '../../ui/motion'
import { useToast } from '../../ui/toast'
import { MealIcon, WeekStrip } from '../shared/WeekStrip'
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
  const week = weekStart(date)
  const logged = useLiveQuery(async () => {
    const days = new Set<string>()
    await db.diaryEntries.where('date').between(addDays(week, -7), addDays(week, 14), true, true).each((e) => days.add(e.date))
    return days
  }, [week])
  const [editing, setEditing] = useState<{ entry: DiaryEntry; food: Food } | null>(null)
  const [mealMenu, setMealMenu] = useState<Meal | null>(null)
  const [copyDate, setCopyDate] = useState('')
  const [pickDay, setPickDay] = useState(false)
  const [saving, setSaving] = useState<{ meal: Meal; name: string } | null>(null)

  const sorted = (entries ?? []).slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const byMeal = (m: Meal) => sorted.filter((e) => e.meal === m)
  const totals = sumNutrients(sorted.map((e) => e.macros))
  const kcalTarget = target?.kcal ?? 0
  const left = kcalTarget - totals.kcal
  const addTo = (meal: Meal) => navigate(`/food/add?meal=${meal}${date !== today ? `&d=${date}` : ''}`)
  const nextDay = date === today ? addDays(today, 1) : today

  const openEntry = async (e: DiaryEntry) => {
    if (e.source === 'quick' || (!e.foodId && !e.grams)) {
      navigate(`/food/quick?edit=${e.id}`)
      return
    }
    const food = (e.foodId ? await db.foods.get(e.foodId) : e.recipeId ? await recipeFood(e.recipeId) : undefined) ?? foodFromEntry(e)
    if (food) setEditing({ entry: e, food })
  }

  const copy = async (rows: DiaryEntry[], to: string, label: string) => {
    if (!rows.length) return
    const copies = await copyEntries(rows, to)
    haptic()
    toast({ message: `${label} copied to ${dayInSentence(to, today)}`, action: { label: 'Undo', onClick: () => void deleteEntries(copies.map((c) => c.id)) } })
  }

  const saveMeal = async () => {
    if (!saving?.name.trim()) return
    const rows = byMeal(saving.meal)
    const t = await saveMealTemplate(saving.name, rows)
    setSaving(null)
    haptic('success')
    toast({ message: `Saved "${t.name}". Find it under Add food.`, action: { label: 'Undo', onClick: () => void deleteMealTemplate(t.id) } })
  }

  const remove = async (ids: string[], label: string) => {
    const rows = await deleteEntries(ids)
    haptic()
    toast({ message: `${label} deleted`, action: { label: 'Undo', onClick: () => restoreEntries(rows) } })
  }

  return (
    <Screen
      tone="food"
      eyebrow={date === today ? formatDayLong(date) : relativeDay(date, today)}
      title="Food"
      actions={
        <IconButton label="Pick a day" variant="glass" onClick={() => setPickDay(true)}>
          <IconCalendar size={20} />
        </IconButton>
      }
    >
      <WeekStrip selected={date} today={today} onSelect={setDate} onWeek={(monday) => setDate(monday)} marked={logged} />

      <div className="card mt-3 p-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[13px] font-semibold text-ink-2">Eaten</p>
            <p className="text-[34px] font-bold leading-none tracking-[-0.035em]">
              {fmtInt(totals.kcal)}
              <span className="ml-1 text-[15px] font-semibold tracking-normal text-ink-2">/ {fmtInt(kcalTarget)} kcal</span>
            </p>
          </div>
          <p className={cx('rounded-full px-3 py-1 text-[13px] font-semibold', left < 0 ? 'bg-warn-soft text-warn-ink' : 'bg-brand-soft text-brand-ink')}>
            {left < 0 ? `${fmtInt(-left)} over` : `${fmtInt(left)} left`}
          </p>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full" style={{ background: left < 0 ? 'var(--warn-soft)' : 'var(--brand-track)' }}>
          <div
            className="h-full rounded-full transition-[width] duration-700"
            style={{ width: `${kcalTarget ? Math.min(100, (totals.kcal / kcalTarget) * 100) : 0}%`, background: left < 0 ? 'var(--warn)' : 'linear-gradient(90deg, var(--btn-from), var(--brand))' }}
          />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <MacroBar compact label="Protein" value={totals.protein} target={target?.proteinG ?? 0} color="var(--protein)" track="var(--protein-track)" />
          <MacroBar compact label="Carbs" value={totals.carbs} target={target?.carbsG ?? 0} color="var(--carbs)" track="var(--carbs-track)" />
          <MacroBar compact label="Fat" value={totals.fat} target={target?.fatG ?? 0} color="var(--fat)" track="var(--fat-track)" />
        </div>
      </div>

      {MEALS.map((meal, i) => {
        const rows = byMeal(meal)
        const m = sumNutrients(rows.map((e) => e.macros))
        return (
          <section key={meal} className="card animate-rise mt-3 overflow-hidden" style={{ '--i': i } as CSSProperties}>
            <div className="flex items-center gap-3 px-4 pb-2 pt-4">
              <MealIcon meal={meal} size={36} />
              <div className="min-w-0 flex-1">
                <h2 className="text-[17px] font-bold">{MEAL_LABEL[meal]}</h2>
                <p className="text-[13px] text-ink-2">
                  {rows.length ? `${fmtInt(m.kcal)} kcal · P ${fmtInt(m.protein)} · C ${fmtInt(m.carbs)} · F ${fmtInt(m.fat)}` : 'Nothing logged yet'}
                </p>
              </div>
              {rows.length > 0 && (
                <IconButton label={`${MEAL_LABEL[meal]} options`} className="size-9 text-ink-2" onClick={() => setMealMenu(meal)}>
                  <IconDots size={20} className="rotate-90" />
                </IconButton>
              )}
            </div>
            {rows.length > 0 && (
              <div className="divide-y divide-line border-t border-line">
                {rows.map((e) => (
                  <SwipeRow
                    key={e.id}
                    onTap={() => void openEntry(e)}
                    actions={[
                      { label: dayInSentence(nextDay, today) === 'tomorrow' ? 'Tomorrow' : 'Today', icon: <IconCopy size={18} />, tone: 'brand', onClick: () => void copy([e], nextDay, e.name) },
                      { label: 'Delete', icon: <IconTrash size={18} />, tone: 'danger', onClick: () => void remove([e.id], e.name) },
                    ]}
                  >
                    <div className="flex min-h-[58px] cursor-pointer items-center gap-3 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[16px] font-medium">{e.name}</p>
                        <p className="truncate text-[13px] text-ink-2">{[e.brand, entryAmount(e)].filter(Boolean).join(' · ')}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[16px] font-semibold">{fmtInt(e.macros.kcal)}</p>
                        <p className="text-[12px] text-ink-3">kcal</p>
                      </div>
                    </div>
                  </SwipeRow>
                ))}
              </div>
            )}
            <button type="button" onClick={() => addTo(meal)} className="flex min-h-12 w-full items-center gap-2 border-t border-line px-4 text-[15px] font-semibold text-brand-ink active:bg-fill">
              <IconPlus size={18} strokeWidth={2.6} /> Add food
            </button>
          </section>
        )
      })}
      <p className="mt-4 px-2 text-center text-[13px] text-ink-3">Tap an entry to change it; swipe left to copy or delete.</p>

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
          <div className="space-y-4">
            <Group className="!shadow-none">
              {date !== today && (
                <ListRow
                  icon={<IconCopy size={18} />}
                  iconTone="body"
                  title="Copy to today"
                  onClick={() => {
                    void copy(byMeal(mealMenu), today, MEAL_LABEL[mealMenu])
                    setMealMenu(null)
                  }}
                />
              )}
              {addDays(date, 1) !== today && (
                <ListRow
                  icon={<IconCopy size={18} />}
                  iconTone="body"
                  title={`Copy to ${dayInSentence(addDays(date, 1), today)}`}
                  onClick={() => {
                    void copy(byMeal(mealMenu), addDays(date, 1), MEAL_LABEL[mealMenu])
                    setMealMenu(null)
                  }}
                />
              )}
              <ListRow
                icon={<IconStar size={18} />}
                iconTone="amber"
                title="Save as a meal"
                subtitle="Log it again in one tap"
                onClick={() => {
                  setSaving({ meal: mealMenu, name: '' })
                  setMealMenu(null)
                }}
              />
              <ListRow
                icon={<IconTrash size={18} />}
                iconTone="danger"
                title="Delete meal"
                destructive
                onClick={() => {
                  void remove(
                    byMeal(mealMenu).map((e) => e.id),
                    MEAL_LABEL[mealMenu],
                  )
                  setMealMenu(null)
                }}
              />
            </Group>
            <div className="flex items-end gap-2">
              <label className="flex-1">
                <span className="mb-1.5 block px-1 text-[13px] font-semibold text-ink-2">Copy to another day</span>
                <TextInput type="date" value={copyDate} onChange={(e) => setCopyDate(e.target.value)} />
              </label>
              <Button
                variant="secondary"
                className="min-h-[52px]"
                disabled={!copyDate}
                onClick={() => {
                  void copy(byMeal(mealMenu), copyDate, MEAL_LABEL[mealMenu])
                  setMealMenu(null)
                }}
              >
                Copy
              </Button>
            </div>
          </div>
        )}
      </Sheet>

      <Sheet
        open={!!saving}
        onClose={() => setSaving(null)}
        title="Save as a meal"
        footer={
          <Button block size="lg" disabled={!saving?.name.trim()} onClick={() => void saveMeal()}>
            Save
          </Button>
        }
      >
        {saving && (
          <div className="space-y-3 pb-1">
            <TextInput autoFocus placeholder="e.g. Usual breakfast" value={saving.name} onChange={(e) => setSaving({ ...saving, name: e.target.value })} />
            <p className="px-1 text-[14px] text-ink-2">{byMeal(saving.meal).map((e) => e.name).join(', ')}</p>
          </div>
        )}
      </Sheet>

      <Sheet open={pickDay} onClose={() => setPickDay(false)} title="Go to a day">
        <div className="space-y-3 pb-1">
          <TextInput
            type="date"
            value={date}
            onChange={(e) => {
              if (e.target.value) setDate(e.target.value)
            }}
          />
          <Button
            block
            variant="secondary"
            onClick={() => {
              setDate(today)
              setPickDay(false)
            }}
          >
            Back to today
          </Button>
        </div>
      </Sheet>
    </Screen>
  )
}
