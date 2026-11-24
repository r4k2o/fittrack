import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { db, type DiaryEntry, type Meal } from '../../db'
import { useToday } from '../../hooks'
import { relativeDay } from '../../lib/dates'
import { fmtInt } from '../../lib/format'
import { atwaterKcal } from '../../lib/macros'
import { deleteEntries, logQuickAdd, MEAL_LABEL, MEALS, mealForNow, restoreEntries, updateQuickAdd } from '../../store/diary'
import { Button, Field, NumberInput, Screen, Segmented, TextInput } from '../../ui/kit'
import { useToast } from '../../ui/toast'

export default function QuickAdd() {
  const navigate = useNavigate()
  const toast = useToast()
  const today = useToday()
  const [params] = useSearchParams()
  const editId = params.get('edit')
  const [entry, setEntry] = useState<DiaryEntry | null>(null)
  const [date, setDate] = useState(params.get('d') ?? today)
  const [meal, setMeal] = useState<Meal>((params.get('meal') as Meal | null) ?? mealForNow())
  const [name, setName] = useState('')
  const [kcal, setKcal] = useState<number | null>(null)
  const [protein, setProtein] = useState<number | null>(null)
  const [carbs, setCarbs] = useState<number | null>(null)
  const [fat, setFat] = useState<number | null>(null)

  useEffect(() => {
    if (!editId) return
    void db.diaryEntries.get(editId).then((e) => {
      if (!e) return
      setEntry(e)
      setDate(e.date)
      setMeal(e.meal)
      setName(e.name === 'Quick add' ? '' : e.name)
      setKcal(e.macros.kcal)
      setProtein(e.macros.protein || null)
      setCarbs(e.macros.carbs || null)
      setFat(e.macros.fat || null)
    })
  }, [editId])

  const back = `/food${date !== today ? `?d=${date}` : ''}`
  const fromMacros = protein != null || carbs != null || fat != null ? Math.round(atwaterKcal({ protein: protein ?? 0, carbs: carbs ?? 0, fat: fat ?? 0 })) : null
  const valid = kcal != null && kcal > 0 && kcal < 10000
  const q = { name, kcal: kcal ?? 0, protein: protein ?? 0, carbs: carbs ?? 0, fat: fat ?? 0 }

  const save = async () => {
    if (!valid) return
    if (entry) await updateQuickAdd(entry, q, meal)
    else {
      const e = await logQuickAdd(q, meal, date)
      toast({ message: `Added ${fmtInt(e.macros.kcal)} kcal`, action: { label: 'Undo', onClick: () => void deleteEntries([e.id]) } })
    }
    navigate(back)
  }

  const remove = async () => {
    if (!entry) return
    const rows = await deleteEntries([entry.id])
    toast({ message: 'Entry deleted', action: { label: 'Undo', onClick: () => restoreEntries(rows) } })
    navigate(back)
  }

  return (
    <Screen tone="food" back={back} title={entry ? 'Edit quick add' : 'Quick add'} subtitle={date !== today ? relativeDay(date, today) : undefined}>
      <div className="space-y-4 pt-2">
        <Field label="Calories">
          <NumberInput value={kcal} integer unit="kcal" autoFocus={!editId} ariaLabel="Calories" onChange={setKcal} onEnter={save} />
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Protein">
            <NumberInput value={protein} unit="g" ariaLabel="Protein" onChange={setProtein} />
          </Field>
          <Field label="Carbs">
            <NumberInput value={carbs} unit="g" ariaLabel="Carbohydrate" onChange={setCarbs} />
          </Field>
          <Field label="Fat">
            <NumberInput value={fat} unit="g" ariaLabel="Fat" onChange={setFat} />
          </Field>
        </div>
        {fromMacros != null && kcal == null && (
          <Button size="sm" variant="secondary" onClick={() => setKcal(fromMacros)}>
            Use {fmtInt(fromMacros)} kcal from the macros
          </Button>
        )}
        <Field label="Name (optional)">
          <TextInput value={name} placeholder="e.g. Restaurant pasta" onChange={(e) => setName(e.target.value)} />
        </Field>
        <Segmented size="sm" value={meal} options={MEALS.map((m) => ({ value: m, label: MEAL_LABEL[m] }))} onChange={setMeal} />
        <div className="flex gap-2 pt-2">
          {entry && (
            <Button variant="danger" onClick={remove}>
              Delete
            </Button>
          )}
          <Button className="flex-1" size="lg" disabled={!valid} onClick={save}>
            {entry ? 'Save' : 'Add'}
          </Button>
        </div>
      </div>
    </Screen>
  )
}
