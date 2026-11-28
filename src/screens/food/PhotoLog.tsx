// Meal photo to diary: the photo is downscaled and sent to the user's own model, which
// lists foods with estimated grams and a confidence. Each item is matched to the local
// food list, whose values supply the macros. The confirmation screen has a gram stepper
// per item and marks low-confidence items "check"; nothing is logged until "Log meal".

import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { aiConfig, analyzeMealPhoto, usedToday } from '../../adapters/vision'
import { db, type DiaryEntry, type Food, type Meal } from '../../db'
import { useObjectUrl, useToday } from '../../hooks'
import { LOW_CONFIDENCE, matchItems, type MatchedItem } from '../../lib/ai'
import { relativeDay } from '../../lib/dates'
import { count, fmtInt } from '../../lib/format'
import { deleteEntries, logFood, MEAL_LABEL, MEALS, mealForNow } from '../../store/diary'
import { recipeFoods } from '../../store/recipes'
import { getSetting, setSetting } from '../../store/settings'
import { IconAlert, IconCamera, IconMinus, IconPlus, IconTrash } from '../../ui/icons'
import { Button, Card, cx, EmptyState, IconButton, Notice, NumberInput, Screen, Segmented, Spinner, StickyFooter } from '../../ui/kit'
import { haptic } from '../../ui/motion'
import { useToast } from '../../ui/toast'
import { FoodSearchSheet } from './FoodSearchSheet'

interface Row extends MatchedItem {
  key: number
  grams: number
}

export default function PhotoLog() {
  const navigate = useNavigate()
  const toast = useToast()
  const today = useToday()
  const [params] = useSearchParams()
  const date = params.get('d') ?? today
  const [meal, setMeal] = useState<Meal>((params.get('meal') as Meal | null) ?? mealForNow())
  const file = useRef<HTMLInputElement>(null)
  const cfg = useLiveQuery(async () => (await aiConfig()) ?? null, [])
  const used = useLiveQuery(() => usedToday(), [])
  const [photo, setPhoto] = useState<Blob | null>(null)
  const photoUrl = useObjectUrl(photo)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [rematch, setRematch] = useState<number | 'new' | null>(null)
  const back = `/food${date !== today ? `?d=${date}` : ''}`

  const analyze = async (f: File | undefined) => {
    if (!f || !cfg) return
    setError(null)
    setRows(null)
    setBusy(true)
    try {
      const { items, preview } = await analyzeMealPhoto(cfg, f)
      setPhoto(preview)
      const foods = [...(await db.foods.toArray()), ...(await recipeFoods())]
      setRows(matchItems(items, foods).map((m, i) => ({ ...m, key: i, grams: m.seen.grams })))
      if (!items.length) setError('In diesem Foto wurde kein Essen erkannt.')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const update = (key: number, patch: Partial<Row>) => setRows((cur) => (cur ?? []).map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const ready = rows?.filter((r) => r.food && r.grams > 0) ?? []
  const unmatched = rows?.filter((r) => !r.food).length ?? 0
  const total = ready.reduce((n, r) => n + (r.food!.per100.kcal * r.grams) / 100, 0)

  const log = async () => {
    if (!ready.length || unmatched) return
    const entries: DiaryEntry[] = []
    for (const r of ready) entries.push(await logFood(r.food!, { grams: r.grams }, meal, date, 'photo'))
    const prev = (await getSetting('aiStats')) ?? { meals: 0, items: 0, aiGrams: 0, finalGrams: 0, absDiffGrams: 0 }
    const seen = ready.filter((r) => r.seen.grams > 0)
    await setSetting('aiStats', {
      meals: prev.meals + 1,
      items: prev.items + seen.length,
      aiGrams: prev.aiGrams + seen.reduce((n, r) => n + r.seen.grams, 0),
      finalGrams: prev.finalGrams + seen.reduce((n, r) => n + r.grams, 0),
      absDiffGrams: prev.absDiffGrams + seen.reduce((n, r) => n + Math.abs(r.grams - r.seen.grams), 0),
    })
    haptic('success')
    toast({ message: `${count(entries.length, 'Eintrag', 'Einträge')} · ${fmtInt(total)} kcal eingetragen`, action: { label: 'Rückgängig', onClick: () => void deleteEntries(entries.map((e) => e.id)) } })
    navigate(back, { replace: true })
  }

  const pick = (f: Food) => {
    if (rematch === 'new') setRows((cur) => [...(cur ?? []), { key: Date.now(), seen: { name: f.name, grams: 0, confidence: 1 }, food: f, alternatives: [], grams: f.lastPortionG ?? 100 }])
    else if (rematch != null) update(rematch, { food: f })
    setRematch(null)
  }

  if (cfg === undefined) return null
  if (cfg === null)
    return (
      <Screen back={back} title="Foto">
        <EmptyState icon={<IconCamera size={28} />} title="Für Fotos braucht es einen Schlüssel">
          Die Foto-Erfassung nutzt deinen eigenen Schlüssel für ein Bildmodell (Geminis kostenloser Tarif reicht). Der Schlüssel bleibt auf diesem iPhone.
          <div className="mt-4">
            <Button onClick={() => navigate('/more/ai')}>Einrichten</Button>
          </div>
        </EmptyState>
      </Screen>
    )
  const spent = (used ?? 0) >= cfg.limit

  return (
    <Screen back={back} title={`Foto: ${MEAL_LABEL[meal]}`} subtitle={date !== today ? relativeDay(date, today) : undefined} large={false} bottomPad={false} className="pb-[calc(env(safe-area-inset-bottom)+7rem)]">
      <Segmented size="sm" className="mt-1" value={meal} options={MEALS.map((m) => ({ value: m, label: MEAL_LABEL[m] }))} onChange={setMeal} />

      {!rows && !busy && (
        <Card className="mt-3 !p-5">
          {photoUrl && <img src={photoUrl} alt="" className="mb-3 max-h-56 w-full rounded-[18px] object-cover" />}
          <p className="text-[16px] font-semibold">Den ganzen Teller von oben fotografieren</p>
          <p className="mt-1 text-[14px] text-ink-2">Gutes Licht und alles im Bild geben die beste Schätzung. Du prüfst jede Zutat und ihre Gramm, bevor etwas eingetragen wird.</p>
          {spent ? (
            <Notice tone="warn" className="mt-3">
              Die {cfg.limit} Anfragen für heute sind aufgebraucht. Trag die Mahlzeit über die Suche ein; um Mitternacht geht es wieder.
            </Notice>
          ) : (
            <Button block size="lg" className="mt-4" onClick={() => file.current?.click()}>
              <IconCamera size={20} /> Foto machen oder wählen
            </Button>
          )}
          <p className="mt-2 text-center text-[12px] text-ink-3">
            {used ?? 0} von {cfg.limit} Anfragen heute genutzt
          </p>
        </Card>
      )}
      <input ref={file} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void analyze(e.target.files?.[0]).finally(() => (e.target.value = ''))} />

      {busy && (
        <div className="mt-10 flex flex-col items-center gap-3 text-ink-2">
          <Spinner />
          <p className="text-[14px]">Schaue mir das Foto an …</p>
        </div>
      )}
      {error && (
        <Notice tone="danger" className="mt-3">
          {error}
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => navigate(`/food/add?meal=${meal}${date !== today ? `&d=${date}` : ''}`)}>
              Über die Suche eintragen
            </Button>
          </div>
        </Notice>
      )}

      {rows && (
        <>
          <div className="mt-3 flex items-center gap-3">
            {photoUrl && <img src={photoUrl} alt="Das Foto der Mahlzeit" className="size-20 shrink-0 rounded-[16px] object-cover" />}
            <div>
              <p className="text-[13px] font-semibold text-ink-2">Gesamt</p>
              <p className="text-[34px] font-bold leading-none tracking-tight tabular-nums">
                {fmtInt(total)} <span className="text-[15px] font-semibold text-ink-2">kcal</span>
              </p>
              <p className="mt-1 text-[12px] text-ink-3">Werte aus deiner Lebensmittelliste, nicht vom Modell</p>
            </div>
          </div>
          <div className="card mt-3 divide-y divide-line overflow-hidden">
            {rows.map((r) => {
              const low = r.seen.confidence < LOW_CONFIDENCE
              return (
                <div key={r.key} className={cx('p-3', !r.food && 'bg-warn-soft')}>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold">{r.food ? r.food.name : 'Kein Treffer in deinen Lebensmitteln'}</p>
                      <p className="truncate text-[12px] text-ink-2">
                        Erkannt als „{r.seen.name}“{r.seen.grams ? `, etwa ${r.seen.grams} g` : ''}
                      </p>
                    </div>
                    {low && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warn-soft px-2 py-0.5 text-[12px] font-bold text-warn-ink">
                        <IconAlert size={12} /> prüfen
                      </span>
                    )}
                    <IconButton label={`${r.seen.name} entfernen`} className="-mr-1 -mt-1 size-9 text-ink-3" onClick={() => setRows(rows.filter((x) => x.key !== r.key))}>
                      <IconTrash size={17} />
                    </IconButton>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <button type="button" aria-label="10 g weniger" className="press flex size-10 items-center justify-center rounded-full bg-fill" onClick={() => update(r.key, { grams: Math.max(5, r.grams - 10) })}>
                      <IconMinus size={18} />
                    </button>
                    <NumberInput value={r.grams} ariaLabel={`${r.food?.name ?? r.seen.name}, Gramm`} onChange={(n) => update(r.key, { grams: n ?? 0 })} className="w-24" inputClassName="text-center !min-h-10" />
                    <button type="button" aria-label="10 g mehr" className="press flex size-10 items-center justify-center rounded-full bg-fill" onClick={() => update(r.key, { grams: r.grams + 10 })}>
                      <IconPlus size={18} />
                    </button>
                    <span className="ml-auto text-[14px] font-semibold tabular-nums">{r.food ? `${fmtInt((r.food.per100.kcal * r.grams) / 100)} kcal` : '–'}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {r.alternatives.slice(0, 3).map((alt) => (
                      <button key={alt.id} type="button" className="press rounded-full bg-fill px-3 py-1 text-[12px] font-semibold" onClick={() => update(r.key, { food: alt, alternatives: [r.food, ...r.alternatives.filter((a) => a.id !== alt.id)].filter((x): x is Food => !!x) })}>
                        {alt.name}
                      </button>
                    ))}
                    <button type="button" className="press rounded-full px-2 py-1 text-[12px] font-semibold text-brand-ink" onClick={() => setRematch(r.key)}>
                      {r.food ? 'Anderes …' : 'Lebensmittel wählen …'}
                    </button>
                  </div>
                </div>
              )
            })}
            <button type="button" className="press flex min-h-12 w-full items-center gap-2 px-4 text-[15px] font-semibold text-brand-ink" onClick={() => setRematch('new')}>
              <IconPlus size={18} strokeWidth={2.6} /> Eintrag hinzufügen
            </button>
          </div>
          {unmatched > 0 && (
            <Notice tone="warn" className="mt-3">
              {unmatched} {unmatched === 1 ? 'Eintrag hat' : 'Einträge haben'} keinen Treffer in deinen Lebensmitteln. Wähl eins aus oder entferne {unmatched === 1 ? 'ihn' : 'sie'}; fehlende Lebensmittel vorher scannen oder anlegen.
            </Notice>
          )}
          <Button block variant="ghost" className="mt-2" onClick={() => file.current?.click()} disabled={spent}>
            Neues Foto
          </Button>
          <StickyFooter>
            <Button block size="lg" disabled={!ready.length || unmatched > 0} onClick={() => void log()}>
              Mahlzeit eintragen · {fmtInt(total)} kcal
            </Button>
          </StickyFooter>
        </>
      )}

      <FoodSearchSheet open={rematch != null} title={rematch === 'new' ? 'Eintrag hinzufügen' : 'Lebensmittel wählen'} onClose={() => setRematch(null)} onPick={pick} />
    </Screen>
  )
}
