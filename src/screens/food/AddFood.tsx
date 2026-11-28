// Ways in, ordered by speed: a whole repeated meal, one tap on a recent food (its
// usual portion), the barcode, search, quick add. Every row also opens the portion
// screen for anything other than the usual amount.

import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState, type CSSProperties } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { db, type Food, type Meal, type MealTemplate } from '../../db'
import { useSetting, useToday } from '../../hooks'
import { addDays, daysBetween, relativeDay } from '../../lib/dates'
import { count, fmt1, fmtInt } from '../../lib/format'
import { buildFoodIndex, searchFoods, type Usage } from '../../lib/foodSearch'
import { copyEntries, deleteEntries, logFood, MEAL_LABEL, MEALS, mealForNow, recentMeals, type PortionChoice } from '../../store/diary'
import { frequentFoods, myFoods, recentFoods } from '../../store/foods'
import { deleteMealTemplate, listMealTemplates, logMealTemplate, recipeFoods, restoreMealTemplate } from '../../store/recipes'
import { recipeIdOf } from '../../lib/recipes'
import { IconBarcode, IconCamera, IconDots, IconEdit, IconFood, IconList, IconPlus, IconRepeat, IconSearch, IconStar, IconX } from '../../ui/icons'
import { Button, EmptyState, Group, IconButton, ListRow, Screen, Segmented, Sheet, Spinner } from '../../ui/kit'
import { haptic } from '../../ui/motion'
import { useToast } from '../../ui/toast'
import { PortionSheet } from './PortionSheet'

type Tab = 'recent' | 'frequent' | 'mine' | 'recipes'

/** The portion the user most likely wants: last time's, else the first serving, else 100 g. */
function usualPortion(f: Food): PortionChoice & { label: string } {
  if (f.lastPortionG) return { grams: f.lastPortionG, label: `${fmt1(f.lastPortionG)} g` }
  const s = f.servings[0]
  if (s) return { grams: s.grams, servingName: s.name, servingCount: 1, label: /\d/.test(s.name) ? s.name : `${s.name} (${fmt1(s.grams)} g)` }
  return { grams: 100, label: '100 g' }
}

function FoodRow({ food, onPick, onQuick, onEdit }: { food: Food; onPick: (f: Food) => void; onQuick: (f: Food) => void; onEdit?: (f: Food) => void }) {
  const p = usualPortion(food)
  return (
    <div className="flex min-h-[60px] items-center">
      {onEdit && (
        <IconButton label={`${food.name} bearbeiten`} className="ml-1.5 size-9 shrink-0 text-ink-3" onClick={() => onEdit(food)}>
          <IconEdit size={18} />
        </IconButton>
      )}
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
        aria-label={`${food.name} hinzufügen, ${p.label}`}
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
  const [tab, setTab] = useState<Tab>(() => (['recent', 'frequent', 'mine', 'recipes'].includes(params.get('tab') ?? '') ? (params.get('tab') as Tab) : 'recent'))
  const [picked, setPicked] = useState<Food | null>(null)
  const foodList = useSetting('foodList')
  const back = `/food${date !== today ? `?d=${date}` : ''}`
  const qs = `meal=${meal}${date !== today ? `&d=${date}` : ''}`
  const go = (to: string) => navigate(to)

  const foods = useLiveQuery(async () => [...(await db.foods.toArray()), ...(await recipeFoods())])
  const templates = useLiveQuery(() => listMealTemplates())
  const [templateMenu, setTemplateMenu] = useState<MealTemplate | null>(null)
  const index = useMemo(() => (foods ? buildFoodIndex(foods) : null), [foods])
  const byId = useMemo(() => new Map((foods ?? []).map((f) => [f.id, f])), [foods])
  const usage = useLiveQuery(async () => {
    const map = new Map<string, Usage>()
    await db.diaryEntries
      .where('date')
      .between(addDays(today, -60), today, true, true)
      .each((e) => {
        const key = e.foodId ?? (e.recipeId ? `recipe:${e.recipeId}` : null)
        if (!key) return
        const u = map.get(key) ?? { count: 0 }
        u.count += 1
        const ago = daysBetween(e.date, today)
        if (u.daysAgo == null || ago < u.daysAgo) u.daysAgo = ago
        map.set(key, u)
      })
    return map
  }, [today])
  const repeat = useLiveQuery(() => recentMeals(meal, date), [meal, date])
  const list = useLiveQuery(() => (tab === 'recent' ? recentFoods(30) : tab === 'frequent' ? frequentFoods(30) : tab === 'recipes' ? recipeFoods() : myFoods()), [tab])

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
    toast({ message: `${f.name} · ${fmtInt(e.macros.kcal)} kcal eingetragen`, action: { label: 'Rückgängig', onClick: () => void deleteEntries([e.id]) } })
  }

  const addTemplate = async (t: MealTemplate) => {
    const rows = await logMealTemplate(t, meal, date)
    const kcal = rows.reduce((n, e) => n + e.macros.kcal, 0)
    haptic('success')
    toast({ message: `${t.name} eingetragen · ${fmtInt(kcal)} kcal`, action: { label: 'Rückgängig', onClick: () => void deleteEntries(rows.map((r) => r.id)) } })
    go(back)
  }

  const removeTemplate = async (t: MealTemplate) => {
    const row = await deleteMealTemplate(t.id)
    setTemplateMenu(null)
    if (row) toast({ message: `${row.name} gelöscht`, action: { label: 'Rückgängig', onClick: () => restoreMealTemplate(row) } })
  }

  const editRecipe = (f: Food) => {
    const rid = recipeIdOf(f.id)
    if (rid) go(`/food/recipe/${rid}`)
  }

  const addMeal = async (r: NonNullable<typeof repeat>[number]) => {
    const copies = await copyEntries(r.entries, date, meal)
    haptic('success')
    toast({ message: `${count(r.entries.length, 'Eintrag', 'Einträge')} · ${fmtInt(r.kcal)} kcal eingetragen`, action: { label: 'Rückgängig', onClick: () => void deleteEntries(copies.map((c) => c.id)) } })
    go(back)
  }

  const rows = (items: Food[], editable = false) => (
    <div className="card divide-y divide-line overflow-hidden">
      {items.map((f) => (
        <FoodRow key={f.id} food={f} onPick={setPicked} onQuick={(x) => void quickAdd(x)} onEdit={editable ? editRecipe : undefined} />
      ))}
    </div>
  )

  return (
    <Screen
      back={back}
      title={MEAL_LABEL[meal]}
      subtitle={date !== today ? relativeDay(date, today) : undefined}
      actions={
        <Button size="sm" variant="ghost" onClick={() => go(back)}>
          Fertig
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
            placeholder="Lebensmittel suchen"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-h-[52px] w-full rounded-full bg-transparent pl-12 pr-24 outline-none placeholder:text-ink-3"
          />
          <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
            {query && (
              <button type="button" aria-label="Suche leeren" className="flex size-9 items-center justify-center rounded-full text-ink-3" onClick={() => setQuery('')}>
                <IconX size={18} />
              </button>
            )}
            <button type="button" aria-label="Barcode scannen" className="press flex size-10 items-center justify-center rounded-full bg-ink text-page" onClick={() => go(`/food/scan?${qs}`)}>
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
            <EmptyState icon={<IconSearch size={28} />} title={`Nichts gefunden für „${query}“`}>
              {foodList ? 'Anderes Wort probieren, die Packung scannen oder vom Etikett eintragen.' : 'Noch keine Lebensmittelliste: unter Mehr → Lebensmittelliste importieren, die Packung scannen oder vom Etikett eintragen.'}
              <div className="mt-4 flex justify-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => go(`/food/scan?${qs}`)}>
                  Scannen
                </Button>
                <Button size="sm" variant="secondary" onClick={() => go(`/food/new?${qs}&name=${encodeURIComponent(query.trim())}`)}>
                  Vom Etikett
                </Button>
              </div>
            </EmptyState>
          )}
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-4 gap-2">
            {[
              { label: 'Scannen', icon: <IconBarcode size={20} />, to: `/food/scan?${qs}` },
              { label: 'Foto', icon: <IconCamera size={20} />, to: `/food/photo?${qs}` },
              { label: 'Schnell', icon: <IconFood size={20} />, to: `/food/quick?${qs}` },
              { label: 'Neu', icon: <IconEdit size={20} />, to: `/food/new?${qs}` },
            ].map((a, i) => (
              <button key={a.label} type="button" onClick={() => go(a.to)} style={{ '--i': i } as CSSProperties} className="card press animate-rise flex flex-col items-center gap-1.5 !rounded-[18px] px-1 py-3 text-center">
                {a.icon}
                <span className="text-[13px] font-semibold leading-tight">{a.label}</span>
              </button>
            ))}
          </div>

          {templates && templates.length > 0 && (
            <>
              <h2 className="mb-2 mt-7 px-1 text-[18px] font-semibold tracking-[-0.01em]">Gespeicherte Mahlzeiten</h2>
              <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
                {templates.map((t) => (
                  <div key={t.id} className="card flex w-[78%] max-w-72 shrink-0 snap-start flex-col !rounded-[24px] p-4">
                    <div className="flex items-center gap-2 text-[13px] font-semibold text-ink-2">
                      <IconStar size={16} />
                      <span className="min-w-0 flex-1 truncate">{t.name}</span>
                      <IconButton label={`${t.name}: Optionen`} className="-my-2 -mr-2 size-9 text-ink-3" onClick={() => setTemplateMenu(t)}>
                        <IconDots size={18} />
                      </IconButton>
                    </div>
                    <p className="mt-1 line-clamp-2 min-h-[2.6em] text-[15px] font-medium leading-snug">{t.items.map((e) => e.name).join(', ')}</p>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-[15px] font-semibold">{fmtInt(t.items.reduce((n, e) => n + e.macros.kcal, 0))} kcal</span>
                      <Button size="sm" onClick={() => void addTemplate(t)}>
                        Alles eintragen
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {repeat && repeat.length > 0 && (
            <>
              <h2 className="mb-2 mt-7 px-1 text-[18px] font-semibold tracking-[-0.01em]">Mahlzeit wiederholen</h2>
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
                        Alles eintragen
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
              { value: 'recent' as Tab, label: 'Zuletzt' },
              { value: 'frequent' as Tab, label: 'Häufig' },
              { value: 'mine' as Tab, label: 'Eigene' },
              { value: 'recipes' as Tab, label: 'Rezepte' },
            ]}
            onChange={setTab}
          />
          <div className="mt-3">
            {tab === 'recipes' && (
              <Button block variant="secondary" className="mb-3" onClick={() => go('/food/recipe/new')}>
                <IconList size={18} /> Neues Rezept
              </Button>
            )}
            {!list ? (
              <div className="flex justify-center py-8 text-ink-2">
                <Spinner />
              </div>
            ) : list.length ? (
              rows(list, tab === 'recipes')
            ) : tab === 'recipes' ? (
              <EmptyState icon={<IconList size={28} />} title="Noch keine Rezepte">
                Zutaten roh wiegen, das fertige Gericht nach dem Kochen, dann nach Portion oder Gramm eintragen.
              </EmptyState>
            ) : (
              <EmptyState icon={<IconFood size={28} />} title={tab === 'mine' ? 'Noch keine eigenen Lebensmittel' : tab === 'frequent' ? 'Hier erscheint, was du oft isst' : 'Hier erscheint, was du einträgst'}>
                {tab === 'mine' ? 'Scanne eine Packung oder trag ein Lebensmittel vom Etikett ein.' : 'Oben suchen oder einen Barcode scannen.'}
              </EmptyState>
            )}
          </div>
        </>
      )}

      <Sheet open={!!templateMenu} onClose={() => setTemplateMenu(null)} title={templateMenu?.name}>
        {templateMenu && (
          <Group className="!shadow-none">
            <ListRow title="Gespeicherte Mahlzeit löschen" destructive onClick={() => void removeTemplate(templateMenu)} />
          </Group>
        )}
      </Sheet>

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
