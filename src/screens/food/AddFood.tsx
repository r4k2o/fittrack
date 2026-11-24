// Ways in, ordered by speed: a whole repeated meal, one tap on a recent food (its
// usual portion), the barcode, search, quick add. Every row also opens the portion
// screen for anything other than the usual amount.

import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState, type CSSProperties } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { db, type Food, type Meal } from '../../db'
import { useSetting, useToday } from '../../hooks'
import { addDays, daysBetween, relativeDay } from '../../lib/dates'
import { fmt1, fmtInt } from '../../lib/format'
import { buildFoodIndex, searchFoods, type Usage } from '../../lib/foodSearch'
import { copyEntries, deleteEntries, logFood, MEAL_LABEL, MEALS, mealForNow, recentMeals, type PortionChoice } from '../../store/diary'
import { frequentFoods, myFoods, recentFoods } from '../../store/foods'
import { IconBarcode, IconEdit, IconFood, IconPlus, IconRepeat, IconSearch, IconX } from '../../ui/icons'
import { Button, EmptyState, IconTile, Screen, Segmented, Spinner } from '../../ui/kit'
import { haptic } from '../../ui/motion'
import { useToast } from '../../ui/toast'
import { PortionSheet } from './PortionSheet'

type Tab = 'recent' | 'frequent' | 'mine'

/** The portion the user most likely wants: last time's, else the first serving, else 100 g. */
function usualPortion(f: Food): PortionChoice & { label: string } {
  if (f.lastPortionG) return { grams: f.lastPortionG, label: `${fmt1(f.lastPortionG)} g` }
  const s = f.servings[0]
  if (s) return { grams: s.grams, servingName: s.name, servingCount: 1, label: /\d/.test(s.name) ? s.name : `${s.name} (${fmt1(s.grams)} g)` }
  return { grams: 100, label: '100 g' }
}

function FoodRow({ food, onPick, onQuick }: { food: Food; onPick: (f: Food) => void; onQuick: (f: Food) => void }) {
  const p = usualPortion(food)
  return (
    <div className="flex min-h-[60px] items-center">
      <button type="button" onClick={() => onPick(food)} className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 text-left active:bg-fill">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-medium">{food.name}</span>
          <span className="block truncate text-[13px] text-ink-2">{[food.brand, p.label].filter(Boolean).join(' · ')}</span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-[15px] font-semibold">{fmtInt((food.per100.kcal * p.grams) / 100)}</span>
          <span className="block text-[11px] text-ink-3">kcal</span>
        </span>
      </button>
      <button
        type="button"
        aria-label={`Add ${food.name}, ${p.label}`}
        onClick={() => onQuick(food)}
        className="press mx-3 flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-ink"
      >
        <IconPlus size={18} strokeWidth={2.8} />
      </button>
    </div>
  )
}

export default function AddFood() {
  const navigate = useNavigate()
  const toast = useToast()
  const today = useToday()
  const [params, setParams] = useSearchParams()
  const date = params.get('d') ?? today
  const meal = (params.get('meal') as Meal | null) ?? mealForNow()
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<Tab>('recent')
  const [picked, setPicked] = useState<Food | null>(null)
  const foodList = useSetting('foodList')
  const back = `/food${date !== today ? `?d=${date}` : ''}`
  const qs = `meal=${meal}${date !== today ? `&d=${date}` : ''}`
  const go = (to: string) => navigate(to)

  const foods = useLiveQuery(() => db.foods.toArray())
  const index = useMemo(() => (foods ? buildFoodIndex(foods) : null), [foods])
  const byId = useMemo(() => new Map((foods ?? []).map((f) => [f.id, f])), [foods])
  const usage = useLiveQuery(async () => {
    const map = new Map<string, Usage>()
    await db.diaryEntries
      .where('date')
      .between(addDays(today, -60), today, true, true)
      .each((e) => {
        if (!e.foodId) return
        const u = map.get(e.foodId) ?? { count: 0 }
        u.count += 1
        const ago = daysBetween(e.date, today)
        if (u.daysAgo == null || ago < u.daysAgo) u.daysAgo = ago
        map.set(e.foodId, u)
      })
    return map
  }, [today])
  const repeat = useLiveQuery(() => recentMeals(meal, date), [meal, date])
  const list = useLiveQuery(() => (tab === 'recent' ? recentFoods(30) : tab === 'frequent' ? frequentFoods(30) : myFoods()), [tab])

  const results = useMemo(() => {
    if (!index || !query.trim()) return null
    return searchFoods(index, query, usage ?? new Map())
      .map((id) => byId.get(id))
      .filter((f): f is Food => !!f)
  }, [index, query, usage, byId])

  const quickAdd = async (f: Food) => {
    const p = usualPortion(f)
    const e = await logFood(f, p, meal, date, query ? 'search' : 'recent')
    haptic('success')
    toast({ message: `${f.name} · ${fmtInt(e.macros.kcal)} kcal added`, action: { label: 'Undo', onClick: () => void deleteEntries([e.id]) } })
  }

  const addMeal = async (r: NonNullable<typeof repeat>[number]) => {
    const copies = await copyEntries(r.entries, date, meal)
    haptic('success')
    toast({ message: `Added ${r.entries.length} items · ${fmtInt(r.kcal)} kcal`, action: { label: 'Undo', onClick: () => void deleteEntries(copies.map((c) => c.id)) } })
    go(back)
  }

  const rows = (items: Food[]) => (
    <div className="card divide-y divide-line overflow-hidden">
      {items.map((f) => (
        <FoodRow key={f.id} food={f} onPick={setPicked} onQuick={(x) => void quickAdd(x)} />
      ))}
    </div>
  )

  return (
    <Screen
      tone="food"
      back={back}
      title={`Add to ${MEAL_LABEL[meal].toLowerCase()}`}
      subtitle={date !== today ? relativeDay(date, today) : undefined}
      actions={
        <Button size="sm" variant="ghost" onClick={() => go(back)}>
          Done
        </Button>
      }
    >
      <div className="sticky top-[calc(env(safe-area-inset-top)+3.25rem)] z-10 -mx-4 px-4 pb-3 pt-1">
        <div className="glass relative rounded-full shadow-float">
          <IconSearch size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Search foods"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-h-[52px] w-full rounded-full bg-transparent pl-12 pr-24 outline-none placeholder:text-ink-3"
          />
          <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
            {query && (
              <button type="button" aria-label="Clear search" className="flex size-9 items-center justify-center rounded-full text-ink-3" onClick={() => setQuery('')}>
                <IconX size={18} />
              </button>
            )}
            <button type="button" aria-label="Scan a barcode" className="press flex size-10 items-center justify-center rounded-full bg-ink text-page" onClick={() => go(`/food/scan?${qs}`)}>
              <IconBarcode size={20} />
            </button>
          </div>
        </div>
      </div>

      <Segmented size="sm" value={meal} options={MEALS.map((m) => ({ value: m, label: MEAL_LABEL[m] }))} onChange={(m) => setParams({ meal: m, ...(date !== today ? { d: date } : {}) }, { replace: true })} />

      {results ? (
        <div className="mt-4">
          {results.length > 0 ? (
            rows(results)
          ) : (
            <EmptyState icon={<IconSearch size={28} />} title={`Nothing found for "${query}"`}>
              {foodList ? 'Try another word, scan the package, or add it from the label.' : 'There is no food list yet: import one under More → Food list, scan the package, or add it from the label.'}
              <div className="mt-4 flex justify-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => go(`/food/scan?${qs}`)}>
                  Scan
                </Button>
                <Button size="sm" variant="secondary" onClick={() => go(`/food/new?${qs}&name=${encodeURIComponent(query.trim())}`)}>
                  Add from label
                </Button>
              </div>
            </EmptyState>
          )}
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-3 gap-2.5">
            {[
              { label: 'Scan', icon: <IconBarcode size={19} />, tone: 'brand' as const, to: `/food/scan?${qs}` },
              { label: 'Quick add', icon: <IconFood size={19} />, tone: 'amber' as const, to: `/food/quick?${qs}` },
              { label: 'New food', icon: <IconEdit size={19} />, tone: 'indigo' as const, to: `/food/new?${qs}` },
            ].map((a, i) => (
              <button key={a.label} type="button" onClick={() => go(a.to)} style={{ '--i': i } as CSSProperties} className="card press animate-rise flex flex-col items-start gap-2.5 !rounded-[22px] p-3.5 text-left">
                <IconTile tone={a.tone} size={34}>
                  {a.icon}
                </IconTile>
                <span className="text-[14px] font-semibold">{a.label}</span>
              </button>
            ))}
          </div>

          {repeat && repeat.length > 0 && (
            <>
              <h2 className="mb-2.5 mt-7 px-1 text-[20px] font-bold tracking-tight">Repeat a meal</h2>
              <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
                {repeat.map((r) => (
                  <div key={r.date} className="card flex w-[78%] max-w-72 shrink-0 snap-start flex-col !rounded-[24px] p-4">
                    <div className="flex items-center gap-2 text-[13px] font-semibold text-ink-2">
                      <IconRepeat size={16} />
                      {relativeDay(r.date, today)}
                    </div>
                    <p className="mt-1.5 line-clamp-2 min-h-[2.6em] text-[15px] font-medium leading-snug">{r.entries.map((e) => e.name).join(', ')}</p>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-[15px] font-semibold">{fmtInt(r.kcal)} kcal</span>
                      <Button size="sm" onClick={() => void addMeal(r)}>
                        Add all
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <Segmented
            className="mt-7"
            size="sm"
            value={tab}
            options={[
              { value: 'recent' as Tab, label: 'Recent' },
              { value: 'frequent' as Tab, label: 'Frequent' },
              { value: 'mine' as Tab, label: 'My foods' },
            ]}
            onChange={setTab}
          />
          <div className="mt-3">
            {!list ? (
              <div className="flex justify-center py-8 text-ink-2">
                <Spinner />
              </div>
            ) : list.length ? (
              rows(list)
            ) : (
              <EmptyState icon={<IconFood size={28} />} title={tab === 'mine' ? 'No scanned or saved foods yet' : tab === 'frequent' ? 'Foods you log often show up here' : 'Foods you log show up here'}>
                {tab === 'mine' ? 'Scan a package or add a food from its label.' : 'Search above, or scan a barcode.'}
              </EmptyState>
            )}
          </div>
        </>
      )}

      <PortionSheet
        open={!!picked}
        food={picked}
        date={date}
        meal={meal}
        source={query ? 'search' : 'recent'}
        onClose={() => setPicked(null)}
        onDone={() => setPicked(null)}
      />
    </Screen>
  )
}
