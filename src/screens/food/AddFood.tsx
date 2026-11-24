// Four ways in, ordered by speed: recent items (and whole repeated meals), barcode,
// search, and quick add. All end on the same portion screen.

import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { db, type Food, type Meal } from '../../db'
import { useSetting, useToday } from '../../hooks'
import { addDays, daysBetween, relativeDay } from '../../lib/dates'
import { fmt1, fmtInt } from '../../lib/format'
import { buildFoodIndex, searchFoods, type Usage } from '../../lib/foodSearch'
import { copyEntries, deleteEntries, MEAL_LABEL, MEALS, mealForNow, recentMeals } from '../../store/diary'
import { frequentFoods, myFoods, recentFoods } from '../../store/foods'
import { IconBarcode, IconEdit, IconFood, IconRepeat, IconSearch, IconX } from '../../ui/icons'
import { Button, Chip, EmptyState, Group, ListRow, Screen, SectionTitle, Spinner } from '../../ui/kit'
import { useToast } from '../../ui/toast'
import { PortionSheet } from './PortionSheet'

type Tab = 'recent' | 'frequent' | 'mine'

/** kcal for the portion the user is most likely to log. */
function usualPortion(f: Food): { grams: number; label: string } {
  if (f.lastPortionG) return { grams: f.lastPortionG, label: `${fmt1(f.lastPortionG)} g` }
  const s = f.servings[0]
  if (s) return { grams: s.grams, label: s.name.match(/\d/) ? s.name : `${s.name} (${fmt1(s.grams)} g)` }
  return { grams: 100, label: '100 g' }
}

function FoodRow({ food, onPick }: { food: Food; onPick: (f: Food) => void }) {
  const p = usualPortion(food)
  return (
    <ListRow
      title={food.name}
      subtitle={[food.brand, p.label].filter(Boolean).join(' · ')}
      detail={<span className="font-semibold text-ink">{fmtInt((food.per100.kcal * p.grams) / 100)} kcal</span>}
      chevron={false}
      onClick={() => onPick(food)}
    />
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

  const addMeal = async (entries: NonNullable<typeof repeat>[number]) => {
    const copies = await copyEntries(entries.entries, date, meal)
    toast({
      message: `Added ${entries.entries.length} items · ${fmtInt(entries.kcal)} kcal`,
      action: { label: 'Undo', onClick: () => void deleteEntries(copies.map((c) => c.id)) },
    })
    navigate(back)
  }

  return (
    <Screen
      back={back}
      title={`Add to ${MEAL_LABEL[meal].toLowerCase()}`}
      subtitle={date !== today ? relativeDay(date, today) : undefined}
      actions={
        <Button size="sm" variant="ghost" onClick={() => navigate(back)}>
          Done
        </Button>
      }
    >
      <div className="sticky top-[calc(env(safe-area-inset-top)+3.5rem)] z-10 -mx-4 bg-canvas/95 px-4 pb-3 backdrop-blur-md">
        <div className="relative">
          <IconSearch size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
          <input
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Search foods"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-h-12 w-full rounded-2xl bg-surface pl-12 pr-11 outline-none placeholder:text-faint focus:ring-2 focus:ring-accent"
          />
          {query && (
            <button type="button" aria-label="Clear search" className="absolute right-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center text-faint" onClick={() => setQuery('')}>
              <IconX size={18} />
            </button>
          )}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Button variant="secondary" size="sm" className="!min-h-11 gap-1.5 !px-2 whitespace-nowrap bg-surface" onClick={() => navigate(`/food/scan?${qs}`)}>
            <IconBarcode size={18} /> Scan
          </Button>
          <Button variant="secondary" size="sm" className="!min-h-11 gap-1.5 !px-2 whitespace-nowrap bg-surface" onClick={() => navigate(`/food/quick?${qs}`)}>
            <IconFood size={18} /> Quick add
          </Button>
          <Button variant="secondary" size="sm" className="!min-h-11 gap-1.5 !px-2 whitespace-nowrap bg-surface" onClick={() => navigate(`/food/new?${qs}`)}>
            <IconEdit size={18} /> New food
          </Button>
        </div>
        <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
          {MEALS.map((m) => (
            <Chip key={m} active={m === meal} onClick={() => setParams({ meal: m, ...(date !== today ? { d: date } : {}) }, { replace: true })}>
              {MEAL_LABEL[m]}
            </Chip>
          ))}
        </div>
      </div>

      {results ? (
        results.length > 0 ? (
          <Group>
            {results.map((f) => (
              <FoodRow key={f.id} food={f} onPick={setPicked} />
            ))}
          </Group>
        ) : (
          <EmptyState icon={<IconSearch size={32} />} title={`Nothing found for "${query}"`}>
            {foodList ? 'Try another word, scan the package, or add it from the label.' : 'There is no food list yet. Import one under More → Food list, scan the package, or add it from the label.'}
            <div className="mt-4 flex justify-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => navigate(`/food/scan?${qs}`)}>
                Scan
              </Button>
              <Button size="sm" variant="secondary" onClick={() => navigate(`/food/new?${qs}&name=${encodeURIComponent(query.trim())}`)}>
                Add from label
              </Button>
            </div>
          </EmptyState>
        )
      ) : (
        <>
          {repeat && repeat.length > 0 && (
            <>
              <SectionTitle>Repeat a meal</SectionTitle>
              <Group>
                {repeat.map((r) => (
                  <ListRow
                    key={r.date}
                    icon={<IconRepeat size={20} />}
                    title={`${relativeDay(r.date, today)}'s ${MEAL_LABEL[r.meal].toLowerCase()}`}
                    subtitle={r.entries.map((e) => e.name).join(', ')}
                    detail={
                      <span className="flex flex-col items-end">
                        <span className="font-semibold text-accent">Add all</span>
                        <span className="text-xs">{fmtInt(r.kcal)} kcal</span>
                      </span>
                    }
                    chevron={false}
                    onClick={() => void addMeal(r)}
                  />
                ))}
              </Group>
            </>
          )}

          <div className="-mx-4 mt-6 flex gap-2 overflow-x-auto px-4">
            <Chip active={tab === 'recent'} onClick={() => setTab('recent')}>
              Recent
            </Chip>
            <Chip active={tab === 'frequent'} onClick={() => setTab('frequent')}>
              Frequent
            </Chip>
            <Chip active={tab === 'mine'} onClick={() => setTab('mine')}>
              My foods
            </Chip>
          </div>
          <div className="mt-3">
            {!list ? (
              <div className="flex justify-center py-8 text-muted">
                <Spinner />
              </div>
            ) : list.length ? (
              <Group>
                {list.map((f) => (
                  <FoodRow key={f.id} food={f} onPick={setPicked} />
                ))}
              </Group>
            ) : (
              <EmptyState title={tab === 'mine' ? 'No scanned or saved foods yet' : tab === 'frequent' ? 'Foods you log often show up here' : 'Foods you log show up here'}>
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
