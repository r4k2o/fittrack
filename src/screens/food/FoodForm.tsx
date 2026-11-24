// "Add from label": a name and the values per 100 g, plus an optional serving.
// Also edits a saved food. Values that fail the 4P + 4C + 9F check are flagged.

import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { db, type Food, type Meal, type Nutrients } from '../../db'
import { useToday } from '../../hooks'
import { normalizeBarcode } from '../../lib/barcode'
import { fmtInt } from '../../lib/format'
import { checkEnergy } from '../../lib/macros'
import { deleteFood, saveFood, updateFood, type NewFood } from '../../store/foods'
import { IconChevronDown, IconWarn } from '../../ui/icons'
import { Button, cx, Field, NumberInput, Screen, TextInput } from '../../ui/kit'
import { useToast } from '../../ui/toast'
import { PortionSheet } from './PortionSheet'

type Values = Record<keyof Nutrients, number | null>

const EMPTY: Values = { kcal: null, protein: null, carbs: null, fat: null, fibre: null, sugar: null, satFat: null, salt: null }

export default function FoodForm() {
  const navigate = useNavigate()
  const toast = useToast()
  const today = useToday()
  const { foodId } = useParams()
  const [params] = useSearchParams()
  const location = useLocation()
  const draft = (location.state as { draft?: NewFood } | null)?.draft
  const meal = params.get('meal') as Meal | null
  const date = params.get('d') ?? today

  const [existing, setExisting] = useState<Food | null>(null)
  const [name, setName] = useState(draft?.name ?? params.get('name') ?? '')
  const [brand, setBrand] = useState(draft?.brand ?? params.get('brand') ?? '')
  const [barcode, setBarcode] = useState(draft?.barcode ?? params.get('barcode') ?? '')
  const [v, setV] = useState<Values>(draft ? { ...EMPTY, ...draft.per100 } : EMPTY)
  const [servingName, setServingName] = useState(draft?.servings?.[0]?.name ?? '')
  const [servingG, setServingG] = useState<number | null>(draft?.servings?.[0]?.grams ?? null)
  const [more, setMore] = useState(false)
  const [saved, setSaved] = useState<Food | null>(null)

  useEffect(() => {
    if (!foodId) return
    void db.foods.get(foodId).then((f) => {
      if (!f) return
      setExisting(f)
      setName(f.name)
      setBrand(f.brand ?? '')
      setBarcode(f.barcode ?? '')
      setV({ ...EMPTY, ...f.per100 })
      setServingName(f.servings[0]?.name ?? '')
      setServingG(f.servings[0]?.grams ?? null)
      setMore([f.per100.fibre, f.per100.sugar, f.per100.satFat, f.per100.salt].some((x) => x != null))
    })
  }, [foodId])

  const per100: Nutrients | null =
    v.kcal != null && v.protein != null && v.carbs != null && v.fat != null
      ? {
          kcal: v.kcal,
          protein: v.protein,
          carbs: v.carbs,
          fat: v.fat,
          ...(v.fibre != null ? { fibre: v.fibre } : {}),
          ...(v.sugar != null ? { sugar: v.sugar } : {}),
          ...(v.satFat != null ? { satFat: v.satFat } : {}),
          ...(v.salt != null ? { salt: v.salt } : {}),
        }
      : null
  const energy = per100 ? checkEnergy(per100) : null
  const code = barcode.trim() ? normalizeBarcode(barcode.trim()) : null
  const barcodeError = barcode.trim() && !code ? 'Not a valid EAN or UPC code.' : undefined
  const macroError = per100 && per100.protein + per100.carbs + per100.fat > 100 ? 'Protein, carbohydrate and fat add up to more than 100 g.' : undefined
  const valid = !!name.trim() && !!per100 && per100.kcal >= 0 && per100.kcal <= 900 && !barcodeError && !macroError
  const servings = servingG && servingG > 0 ? [{ name: servingName.trim() || '1 serving', grams: servingG }] : []

  const set = (k: keyof Nutrients) => (n: number | null) => setV((cur) => ({ ...cur, [k]: n }))

  const save = async () => {
    if (!valid || !per100) return
    if (existing) {
      await updateFood({ ...existing, name: name.trim(), brand: brand.trim() || undefined, barcode: code ?? undefined, per100, servings })
      toast({ message: 'Food saved' })
      navigate(-1)
      return
    }
    const food = await saveFood({
      name: name.trim(),
      ...(brand.trim() ? { brand: brand.trim() } : {}),
      ...(code ? { barcode: code } : {}),
      source: draft?.source ?? 'custom',
      per100,
      servings,
    })
    if (meal) setSaved(food)
    else {
      toast({ message: `${food.name} saved` })
      navigate(-1)
    }
  }

  const remove = async () => {
    if (!existing) return
    await deleteFood(existing.id)
    toast({ message: `${existing.name} deleted`, action: { label: 'Undo', onClick: () => void db.foods.put(existing) } })
    navigate(-1)
  }

  return (
    <Screen back title={existing ? 'Edit food' : 'New food'} subtitle={existing ? undefined : 'Values per 100 g, from the nutrition label'}>
      <div className="space-y-4 pt-2">
        <Field label="Name">
          <TextInput value={name} autoFocus={!foodId && !name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Skyr natur" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Brand (optional)">
            <TextInput value={brand} onChange={(e) => setBrand(e.target.value)} />
          </Field>
          <Field label="Barcode (optional)" error={barcodeError}>
            <TextInput value={barcode} inputMode="numeric" onChange={(e) => setBarcode(e.target.value.replace(/\D/g, ''))} />
          </Field>
        </div>

        <div className="rounded-3xl bg-surface p-4">
          <p className="mb-3 font-semibold">Per 100 g</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Energy">
              <NumberInput value={v.kcal} unit="kcal" ariaLabel="Energy per 100 g" onChange={set('kcal')} />
            </Field>
            <Field label="Protein">
              <NumberInput value={v.protein} unit="g" ariaLabel="Protein per 100 g" onChange={set('protein')} />
            </Field>
            <Field label="Carbohydrate">
              <NumberInput value={v.carbs} unit="g" ariaLabel="Carbohydrate per 100 g" onChange={set('carbs')} />
            </Field>
            <Field label="Fat">
              <NumberInput value={v.fat} unit="g" ariaLabel="Fat per 100 g" onChange={set('fat')} />
            </Field>
          </div>
          <button type="button" className="mt-3 flex items-center gap-1 text-sm font-semibold text-accent" onClick={() => setMore(!more)} aria-expanded={more}>
            Fibre, sugar, saturated fat, salt
            <IconChevronDown size={16} className={cx('transition-transform', more && 'rotate-180')} />
          </button>
          {more && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Fibre">
                <NumberInput value={v.fibre} unit="g" ariaLabel="Fibre per 100 g" onChange={set('fibre')} />
              </Field>
              <Field label="Sugar">
                <NumberInput value={v.sugar} unit="g" ariaLabel="Sugar per 100 g" onChange={set('sugar')} />
              </Field>
              <Field label="Saturated fat">
                <NumberInput value={v.satFat} unit="g" ariaLabel="Saturated fat per 100 g" onChange={set('satFat')} />
              </Field>
              <Field label="Salt">
                <NumberInput value={v.salt} unit="g" ariaLabel="Salt per 100 g" onChange={set('salt')} />
              </Field>
            </div>
          )}
        </div>

        {energy && !energy.ok && (
          <div className="flex gap-3 rounded-2xl bg-warn-soft px-4 py-3 text-sm text-warn">
            <IconWarn size={18} className="mt-0.5 shrink-0" />
            <span>
              {fmtInt(per100?.kcal ?? 0)} kcal does not match the macros, which give {fmtInt(energy.computedKcal)} kcal. Check for kJ in the kcal field or a typo. You can still save it.
            </span>
          </div>
        )}
        {macroError && <p className="text-sm text-danger">{macroError}</p>}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Serving (optional)">
            <TextInput value={servingName} placeholder="e.g. 1 cup" onChange={(e) => setServingName(e.target.value)} />
          </Field>
          <Field label="Serving weight">
            <NumberInput value={servingG} unit="g" ariaLabel="Serving weight" onChange={setServingG} />
          </Field>
        </div>

        <div className="flex gap-2 pt-2">
          {existing && (
            <Button variant="danger" onClick={remove}>
              Delete
            </Button>
          )}
          <Button className="flex-1" size="lg" disabled={!valid} onClick={save}>
            {existing ? 'Save' : meal ? 'Save and log' : 'Save'}
          </Button>
        </div>
      </div>

      {meal && (
        <PortionSheet
          open={!!saved}
          food={saved}
          date={date}
          meal={meal}
          source={barcode ? 'barcode' : 'search'}
          onClose={() => navigate(`/food${date !== today ? `?d=${date}` : ''}`)}
          onDone={() => navigate(`/food${date !== today ? `?d=${date}` : ''}`)}
        />
      )}
    </Screen>
  )
}
