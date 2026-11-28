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
import { Button, cx, Group, IconButton, ListRow, MacroBar, Screen, Sheet, SwipeRow, TextInput, TodayButton } from '../../ui/kit'
import { haptic } from '../../ui/motion'
import { useToast } from '../../ui/toast'
import { WeekStrip } from '../shared/WeekStrip'
import { PortionSheet } from './PortionSheet'

/** "heute", "morgen" or a short date, for use inside a sentence. */
function dayInSentence(day: string, today: string): string {
  const r = relativeDay(day, today)
  return ['Heute', 'Gestern', 'Morgen'].includes(r) ? r.toLowerCase() : r
}

function entryAmount(e: DiaryEntry): string {
  const amount = e.servingName && e.servingCount ? `${fmt1(e.servingCount)} × ${e.servingName}` : e.grams ? `${fmt1(e.grams)} g` : e.source === 'quick' ? 'Schnell erfasst' : ''
  // Entries from a meal photo stay marked, since their grams started as a model's guess.
  return e.source === 'photo' ? `${amount} · vom Foto` : amount
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
  const addTo = (meal: Meal) => {
    haptic()
    navigate(`/food/add?meal=${meal}${date !== today ? `&d=${date}` : ''}`)
  }
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
    toast({ message: `${label} auf ${dayInSentence(to, today)} kopiert`, action: { label: 'Rückgängig', onClick: () => void deleteEntries(copies.map((c) => c.id)) } })
  }

  const saveMeal = async () => {
    if (!saving?.name.trim()) return
    const rows = byMeal(saving.meal)
    const t = await saveMealTemplate(saving.name, rows)
    setSaving(null)
    haptic('success')
    toast({ message: `„${t.name}“ gespeichert`, action: { label: 'Rückgängig', onClick: () => void deleteMealTemplate(t.id) } })
  }

  const remove = async (ids: string[], label: string) => {
    const rows = await deleteEntries(ids)
    haptic()
    toast({ message: `${label} gelöscht`, action: { label: 'Rückgängig', onClick: () => restoreEntries(rows) } })
  }

  return (
    <Screen
      eyebrow={date === today ? formatDayLong(date) : relativeDay(date, today)}
      title="Essen"
      actions={
        <>
          {date !== today && <TodayButton onClick={() => setDate(today)} />}
          <IconButton label="Tag wählen" variant="glass" onClick={() => setPickDay(true)}>
            <IconCalendar size={20} />
          </IconButton>
        </>
      }
    >
      <WeekStrip selected={date} today={today} onSelect={setDate} onWeek={(monday) => setDate(monday)} marked={logged} />

      <div className="card mt-3 p-4">
        <div className="flex items-end justify-between gap-3">
          <p className="text-[30px] font-bold leading-none tracking-[-0.03em] tabular-nums">
            {fmtInt(totals.kcal)}
            <span className="ml-1.5 text-[15px] font-medium tracking-normal text-ink-2">von {fmtInt(kcalTarget)} kcal</span>
          </p>
          <p className={cx('text-[14px] font-semibold tabular-nums', left < 0 ? 'text-warn-ink' : 'text-ink-2')}>{left < 0 ? `${fmtInt(-left)} drüber` : `${fmtInt(left)} übrig`}</p>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full" style={{ background: left < 0 ? 'var(--warn-soft)' : 'var(--brand-track)' }}>
          <div
            className="h-full rounded-full transition-[width] duration-700 ease-[var(--ease-out)]"
            style={{ width: `${kcalTarget ? Math.min(100, (totals.kcal / kcalTarget) * 100) : 0}%`, background: left < 0 ? 'var(--warn)' : 'var(--brand)' }}
          />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <MacroBar compact label="Eiweiß" value={totals.protein} target={target?.proteinG ?? 0} color="var(--protein)" track="var(--protein-track)" />
          <MacroBar compact label="Kohlenh." value={totals.carbs} target={target?.carbsG ?? 0} color="var(--carbs)" track="var(--carbs-track)" />
          <MacroBar compact label="Fett" value={totals.fat} target={target?.fatG ?? 0} color="var(--fat)" track="var(--fat-track)" />
        </div>
      </div>

      {MEALS.map((meal, i) => {
        const rows = byMeal(meal)
        const kcal = rows.reduce((n, e) => n + e.macros.kcal, 0)
        return (
          <section key={meal} className="animate-rise mt-5" style={{ '--i': i } as CSSProperties}>
            <div className="flex min-h-11 items-center gap-1 pl-1">
              <h2 className="min-w-0 flex-1 text-[18px] font-semibold tracking-[-0.01em]">
                {MEAL_LABEL[meal]}
                {rows.length > 0 && <span className="ml-2 text-[15px] font-medium tabular-nums text-ink-3">{fmtInt(kcal)} kcal</span>}
              </h2>
              {rows.length > 0 && (
                <IconButton label={`${MEAL_LABEL[meal]}: Optionen`} className="size-10 text-ink-2" onClick={() => setMealMenu(meal)}>
                  <IconDots size={20} />
                </IconButton>
              )}
              <IconButton label={`${MEAL_LABEL[meal]}: hinzufügen`} variant="fill" className="size-10" onClick={() => addTo(meal)}>
                <IconPlus size={19} strokeWidth={2.4} />
              </IconButton>
            </div>
            {rows.length > 0 && (
              <div className="card mt-1.5 divide-y divide-line overflow-hidden">
                {rows.map((e) => (
                  <SwipeRow
                    key={e.id}
                    onTap={() => void openEntry(e)}
                    actions={[
                      { label: dayInSentence(nextDay, today) === 'morgen' ? 'Morgen' : 'Heute', icon: <IconCopy size={18} />, tone: 'brand', onClick: () => void copy([e], nextDay, e.name) },
                      { label: 'Löschen', icon: <IconTrash size={18} />, tone: 'danger', onClick: () => void remove([e.id], e.name) },
                    ]}
                  >
                    <div className="flex min-h-[56px] cursor-pointer items-center gap-3 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[16px] font-medium">{e.name}</p>
                        <p className="truncate text-[13px] text-ink-2">{[e.brand, entryAmount(e)].filter(Boolean).join(' · ')}</p>
                      </div>
                      <p className="shrink-0 text-[15px] font-semibold tabular-nums">
                        {fmtInt(e.macros.kcal)}
                        <span className="ml-0.5 text-[12px] font-medium text-ink-3"> kcal</span>
                      </p>
                    </div>
                  </SwipeRow>
                ))}
              </div>
            )}
          </section>
        )
      })}

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
                  title="Auf heute kopieren"
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
                  title={`Auf ${dayInSentence(addDays(date, 1), today)} kopieren`}
                  onClick={() => {
                    void copy(byMeal(mealMenu), addDays(date, 1), MEAL_LABEL[mealMenu])
                    setMealMenu(null)
                  }}
                />
              )}
              <ListRow
                icon={<IconStar size={18} />}
                iconTone="amber"
                title="Als Mahlzeit speichern"
                subtitle="Später mit einem Tippen eintragen"
                onClick={() => {
                  setSaving({ meal: mealMenu, name: '' })
                  setMealMenu(null)
                }}
              />
              <ListRow
                icon={<IconTrash size={18} />}
                iconTone="danger"
                title="Mahlzeit löschen"
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
                <span className="mb-1.5 block px-1 text-[13px] font-semibold text-ink-2">Auf anderen Tag kopieren</span>
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
                Kopieren
              </Button>
            </div>
          </div>
        )}
      </Sheet>

      <Sheet
        open={!!saving}
        onClose={() => setSaving(null)}
        title="Als Mahlzeit speichern"
        footer={
          <Button block size="lg" disabled={!saving?.name.trim()} onClick={() => void saveMeal()}>
            Speichern
          </Button>
        }
      >
        {saving && (
          <div className="space-y-3 pb-1">
            <TextInput autoFocus placeholder="z. B. Frühstück wie immer" value={saving.name} onChange={(e) => setSaving({ ...saving, name: e.target.value })} />
            <p className="px-1 text-[14px] text-ink-2">{byMeal(saving.meal).map((e) => e.name).join(', ')}</p>
          </div>
        )}
      </Sheet>

      <Sheet open={pickDay} onClose={() => setPickDay(false)} title="Tag wählen">
        <div className="space-y-3 pb-1">
          <TextInput
            type="date"
            value={date}
            onChange={(e) => {
              if (e.target.value) setDate(e.target.value)
            }}
          />
          {date !== today && (
            <Button
              block
              variant="secondary"
              onClick={() => {
                setDate(today)
                setPickDay(false)
              }}
            >
              Zurück zu heute
            </Button>
          )}
        </div>
      </Sheet>
    </Screen>
  )
}
