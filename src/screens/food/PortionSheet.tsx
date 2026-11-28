import { useEffect, useState } from 'react'
import type { DiaryEntry, DiarySource, Food, Meal } from '../../db'
import { localDay, relativeDay } from '../../lib/dates'
import { fmt1, fmt2, fmtInt } from '../../lib/format'
import { checkEnergy, scaleNutrients } from '../../lib/macros'
import { deleteEntries, logFood, MEAL_LABEL, MEALS, restoreEntries, updatePortion } from '../../store/diary'
import { IconMinus, IconPlus } from '../../ui/icons'
import { Button, Chip, Notice, NumberInput, Segmented, Sheet } from '../../ui/kit'
import { haptic } from '../../ui/motion'
import { useToast } from '../../ui/toast'

interface Props {
  open: boolean
  food: Food | null
  date: string
  meal: Meal
  /** Editing an existing entry instead of adding. */
  entry?: DiaryEntry | null
  source?: DiarySource
  onClose: () => void
  onDone?: () => void
}

/** Grams step for the − / + buttons, scaled to the amount. */
const gramStep = (g: number) => (g >= 200 ? 25 : g >= 50 ? 10 : 5)

export function PortionSheet({ open, food, date, meal: initialMeal, entry, source = 'search', onClose, onDone }: Props) {
  const toast = useToast()
  const [grams, setGrams] = useState<number | null>(null)
  const [serving, setServing] = useState<{ name: string; grams: number } | null>(null)
  const [count, setCount] = useState(1)
  const [meal, setMeal] = useState<Meal>(initialMeal)

  useEffect(() => {
    if (!open || !food) return
    setMeal(entry?.meal ?? initialMeal)
    const s = entry?.servingName ? food.servings.find((x) => x.name === entry.servingName) : undefined
    if (s && entry?.servingCount) {
      setServing(s)
      setCount(entry.servingCount)
      setGrams(s.grams * entry.servingCount)
    } else {
      setServing(null)
      setCount(1)
      setGrams(entry?.grams ?? food.lastPortionG ?? food.servings[0]?.grams ?? 100)
    }
  }, [open, food, entry, initialMeal])

  if (!food) return null
  const g = grams ?? 0
  const m = scaleNutrients(food.per100, g)
  const energy = checkEnergy(food.per100)
  const valid = grams != null && grams > 0 && grams < 5000

  const pickServing = (s: { name: string; grams: number }) => {
    setServing(s)
    setCount(1)
    setGrams(s.grams)
  }

  const nudge = (dir: 1 | -1) => {
    haptic()
    if (serving) {
      const c = Math.max(0.5, Math.round((count + dir * 0.5) * 10) / 10)
      setCount(c)
      setGrams(Math.round(serving.grams * c * 10) / 10)
    } else {
      const step = gramStep(g)
      setGrams(Math.max(step, Math.round((g + dir * step) / step) * step))
    }
  }

  const portion = { grams: g, servingName: serving?.name ?? null, servingCount: serving ? count : null }

  const add = async () => {
    if (!valid) return
    const e = await logFood(food, portion, meal, date, source)
    haptic('success')
    toast({ message: `${food.name} · ${fmtInt(e.macros.kcal)} kcal eingetragen`, action: { label: 'Rückgängig', onClick: () => void deleteEntries([e.id]) } })
    onDone?.()
  }

  const save = async () => {
    if (!valid || !entry) return
    await updatePortion(entry, food, portion, meal)
    haptic()
    onDone?.()
  }

  const remove = async () => {
    if (!entry) return
    const rows = await deleteEntries([entry.id])
    toast({ message: `${entry.name} gelöscht`, action: { label: 'Rückgängig', onClick: () => restoreEntries(rows) } })
    onDone?.()
  }

  // servings scale with − / +; plain gram presets just set the amount
  const chips: { name: string; grams: number; label: string; plain: boolean }[] = [
    ...food.servings.map((s) => ({ ...s, plain: false, label: `${s.name}${/\d\s*g\b/i.test(s.name) ? '' : ` · ${fmt1(s.grams)} g`}` })),
    { name: '100 g', grams: 100, label: '100 g', plain: true },
  ]
  if (food.lastPortionG && !chips.some((c) => c.grams === food.lastPortionG)) {
    chips.unshift({ name: 'last', grams: food.lastPortionG, label: `Letztes Mal · ${fmt1(food.lastPortionG)} g`, plain: true })
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={
        <span className="block leading-tight">
          <span className="block truncate">{food.name}</span>
          {food.brand && <span className="block truncate text-[14px] font-medium text-ink-2">{food.brand}</span>}
        </span>
      }
      footer={
        entry ? (
          <div className="flex gap-2">
            <Button variant="danger" size="lg" onClick={remove}>
              Löschen
            </Button>
            <Button className="flex-1" size="lg" disabled={!valid} onClick={save}>
              Speichern
            </Button>
          </div>
        ) : (
          <Button block size="lg" disabled={!valid} onClick={add}>
            Zu {MEAL_LABEL[meal]} hinzufügen
            {date !== localDay() ? ` · ${relativeDay(date)}` : ''}
          </Button>
        )
      }
    >
      <div className="space-y-4 pt-1">
        {(!energy.ok || food.flagged) && (
          <Notice tone="warn">
            Die Kalorien ({fmtInt(food.per100.kcal)} kcal pro 100 g) passen nicht zu den Makros ({fmtInt(energy.computedKcal)} kcal). Bitte das Etikett prüfen.
          </Notice>
        )}

        <div className="flex items-center justify-between gap-3 rounded-[24px] bg-fill p-2">
          <button type="button" aria-label="Weniger" onClick={() => nudge(-1)} className="press flex size-12 items-center justify-center rounded-full bg-surface shadow-[0_2px_8px_-3px_rgba(0,0,0,0.2)]">
            <IconMinus size={22} strokeWidth={2.6} />
          </button>
          <div className="flex min-w-0 flex-1 flex-col items-center">
            <NumberInput
              value={grams}
              ariaLabel="Menge in Gramm"
              onChange={(n) => {
                setGrams(n)
                setServing(null)
              }}
              onEnter={entry ? save : add}
              className="w-full"
              inputClassName="!min-h-12 !bg-transparent !border-transparent text-center !text-[34px] font-bold tracking-tight !shadow-none !px-2"
            />
            <span className="-mt-1 text-[13px] font-semibold text-ink-2">{serving ? `Gramm · ${fmt2(count)} × ${serving.name}` : 'Gramm'}</span>
          </div>
          <button type="button" aria-label="Mehr" onClick={() => nudge(1)} className="press flex size-12 items-center justify-center rounded-full bg-surface shadow-[0_2px_8px_-3px_rgba(0,0,0,0.2)]">
            <IconPlus size={22} strokeWidth={2.6} />
          </button>
        </div>

        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
          {chips.map((c) => (
            <Chip
              key={`${c.label}-${c.grams}`}
              active={c.plain ? !serving && grams === c.grams : serving?.name === c.name}
              onClick={() => {
                haptic()
                if (c.plain) {
                  setServing(null)
                  setGrams(c.grams)
                } else pickServing(c)
              }}
            >
              {c.label}
            </Chip>
          ))}
        </div>

        <div className="grid grid-cols-4 divide-x divide-line rounded-[22px] border border-line py-3 text-center">
          <div>
            <div className="text-[22px] font-bold tracking-tight">{fmtInt(m.kcal)}</div>
            <div className="text-[12px] font-semibold text-ink-2">kcal</div>
          </div>
          {[
            { label: 'Eiweiß', v: m.protein, c: 'var(--protein)' },
            { label: 'Kohlenh.', v: m.carbs, c: 'var(--carbs)' },
            { label: 'Fett', v: m.fat, c: 'var(--fat)' },
          ].map((x) => (
            <div key={x.label}>
              <div className="text-[22px] font-bold tracking-tight">{fmt1(x.v)}</div>
              <div className="flex items-center justify-center gap-1 text-[12px] font-semibold text-ink-2">
                <span className="size-2 rounded-full" style={{ background: x.c }} />
                {x.label}
              </div>
            </div>
          ))}
        </div>

        <Segmented size="sm" value={meal} options={MEALS.map((x) => ({ value: x, label: MEAL_LABEL[x] }))} onChange={setMeal} />
        <p className="text-center text-[12px] text-ink-3">
          Pro 100 g: {fmtInt(food.per100.kcal)} kcal · E {fmt1(food.per100.protein)} · K {fmt1(food.per100.carbs)} · F {fmt1(food.per100.fat)} g
        </p>
      </div>
    </Sheet>
  )
}
