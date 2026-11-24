import { useEffect, useState } from 'react'
import type { DiaryEntry, DiarySource, Food, Meal } from '../../db'
import { localDay, relativeDay } from '../../lib/dates'
import { fmt1, fmt2, fmtInt } from '../../lib/format'
import { checkEnergy, scaleNutrients } from '../../lib/macros'
import { deleteEntries, logFood, MEAL_LABEL, MEALS, restoreEntries, updatePortion } from '../../store/diary'
import { IconWarn } from '../../ui/icons'
import { Button, Chip, cx, NumberInput, Segmented, Sheet, Stepper } from '../../ui/kit'
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

  const add = async () => {
    if (!valid) return
    const e = await logFood(food, { grams: g, servingName: serving?.name ?? null, servingCount: serving ? count : null }, meal, date, source)
    toast({
      message: `Added ${food.name} · ${fmtInt(e.macros.kcal)} kcal`,
      action: { label: 'Undo', onClick: () => void deleteEntries([e.id]) },
    })
    onDone?.()
  }

  const save = async () => {
    if (!valid || !entry) return
    await updatePortion(entry, food, { grams: g, servingName: serving?.name ?? null, servingCount: serving ? count : null }, meal)
    onDone?.()
  }

  const remove = async () => {
    if (!entry) return
    const rows = await deleteEntries([entry.id])
    toast({ message: `Deleted ${entry.name}`, action: { label: 'Undo', onClick: () => restoreEntries(rows) } })
    onDone?.()
  }

  // servings scale with the stepper; plain gram presets just set the amount
  const chips: { name: string; grams: number; label: string; plain: boolean }[] = [
    ...food.servings.map((s) => ({ ...s, plain: false, label: `${s.name}${/\d\s*g\b/i.test(s.name) ? '' : ` · ${fmt1(s.grams)} g`}` })),
    { name: '100 g', grams: 100, label: '100 g', plain: true },
  ]
  if (food.lastPortionG && !chips.some((c) => c.grams === food.lastPortionG)) {
    chips.unshift({ name: 'last', grams: food.lastPortionG, label: `Last time · ${fmt1(food.lastPortionG)} g`, plain: true })
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={
        <span className="block leading-tight">
          <span className="block truncate">{food.name}</span>
          {food.brand && <span className="block truncate text-sm font-medium text-muted">{food.brand}</span>}
        </span>
      }
      footer={
        entry ? (
          <div className="flex gap-2">
            <Button variant="danger" onClick={remove}>
              Delete
            </Button>
            <Button className="flex-1" size="lg" disabled={!valid} onClick={save}>
              Save
            </Button>
          </div>
        ) : (
          <Button block size="lg" disabled={!valid} onClick={add}>
            Add to {MEAL_LABEL[meal].toLowerCase()}
            {date !== localDay() ? ` · ${relativeDay(date)}` : ''}
          </Button>
        )
      }
    >
      <div className="space-y-4 pt-1">
        {(!energy.ok || food.flagged) && (
          <div className="flex gap-3 rounded-2xl bg-warn-soft px-4 py-3 text-sm text-warn">
            <IconWarn size={18} className="mt-0.5 shrink-0" />
            <span>
              The calories ({fmtInt(food.per100.kcal)} kcal per 100 g) do not match the macros ({fmtInt(energy.computedKcal)} kcal). Check the label.
            </span>
          </div>
        )}

        <div className="flex items-end gap-3">
          <div className="flex-1">
            <NumberInput
              value={grams}
              unit="g"
              ariaLabel="Amount in grams"
              onChange={(n) => {
                setGrams(n)
                setServing(null)
              }}
              onEnter={entry ? save : add}
            />
          </div>
          {serving && (
            <Stepper
              value={count}
              step={0.5}
              min={0.5}
              format={(n) => `${fmt2(n)}×`}
              onChange={(n) => {
                setCount(n)
                setGrams(Math.round(serving.grams * n * 10) / 10)
              }}
            />
          )}
        </div>

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {chips.map((c) => (
            <Chip
              key={`${c.label}-${c.grams}`}
              active={c.plain ? !serving && grams === c.grams : serving?.name === c.name}
              onClick={() => {
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

        <div className="grid grid-cols-4 gap-2 rounded-3xl bg-sunken p-3 text-center">
          <div>
            <div className="text-xl font-bold tabular-nums">{fmtInt(m.kcal)}</div>
            <div className="text-xs font-semibold text-muted">kcal</div>
          </div>
          {[
            { label: 'Protein', v: m.protein, c: 'var(--protein)' },
            { label: 'Carbs', v: m.carbs, c: 'var(--carbs)' },
            { label: 'Fat', v: m.fat, c: 'var(--fat)' },
          ].map((x) => (
            <div key={x.label}>
              <div className="text-xl font-bold tabular-nums">{fmt1(x.v)}</div>
              <div className="flex items-center justify-center gap-1 text-xs font-semibold text-muted">
                <span className="size-1.5 rounded-full" style={{ background: x.c }} />
                {x.label}
              </div>
            </div>
          ))}
        </div>

        <Segmented size="sm" value={meal} options={MEALS.map((x) => ({ value: x, label: MEAL_LABEL[x] }))} onChange={setMeal} />
        <p className={cx('text-center text-xs text-faint')}>
          Per 100 g: {fmtInt(food.per100.kcal)} kcal · P {fmt1(food.per100.protein)} · C {fmt1(food.per100.carbs)} · F {fmt1(food.per100.fat)}
        </p>
      </div>
    </Sheet>
  )
}
