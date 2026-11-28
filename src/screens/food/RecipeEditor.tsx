// Build a dish: ingredients with raw weights, the servings it makes and, once cooked,
// the dish's weight. Per-serving and per-100 g values follow every change.

import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { db, type Food } from '../../db'
import { fmt1, fmtInt } from '../../lib/format'
import { recipeTotals } from '../../lib/recipes'
import { deleteRecipe, restoreRecipe, saveRecipe, type RecipeDraft } from '../../store/recipes'
import { IconPlus, IconTrash } from '../../ui/icons'
import { Button, Card, EmptyState, Field, IconButton, Notice, NumberInput, Screen, Spinner, Stepper, StickyFooter, TextInput } from '../../ui/kit'
import { haptic } from '../../ui/motion'
import { useToast } from '../../ui/toast'
import { FoodSearchSheet } from './FoodSearchSheet'

export default function RecipeEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const existing = useLiveQuery(async () => (id ? ((await db.recipes.get(id)) ?? null) : null), [id])
  const [draft, setDraft] = useState<RecipeDraft | null>(id ? null : { name: '', servings: 4, cookedWeightG: null, ingredients: [] })
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    if (id && existing && !draft) setDraft({ id: existing.id, name: existing.name, servings: existing.servings, cookedWeightG: existing.cookedWeightG ?? null, ingredients: existing.ingredients })
  }, [id, existing, draft])

  const ids = draft?.ingredients.map((i) => i.foodId).join('|') ?? ''
  const foods = useLiveQuery(async () => {
    const list = ids ? ids.split('|') : []
    const rows = await db.foods.bulkGet(list)
    return new Map(rows.filter((f): f is Food => !!f).map((f) => [f.id, f]))
  }, [ids])

  if (id && existing === null)
    return (
      <Screen back title="Rezept">
        <EmptyState title="Rezept nicht gefunden">Vielleicht wurde es gelöscht.</EmptyState>
      </Screen>
    )
  if (!draft || !foods)
    return (
      <Screen back title="Rezept">
        <div className="flex justify-center py-16 text-ink-2">
          <Spinner />
        </div>
      </Screen>
    )

  const t = recipeTotals(draft, foods)
  const set = (patch: Partial<RecipeDraft>) => setDraft({ ...draft, ...patch })
  const setGrams = (i: number, grams: number | null) => set({ ingredients: draft.ingredients.map((x, j) => (j === i ? { ...x, grams: grams ?? 0 } : x)) })
  const valid = draft.name.trim().length > 0 && draft.ingredients.some((x) => x.grams > 0)

  const save = async () => {
    if (!valid) return
    await saveRecipe(draft)
    haptic('success')
    toast({ message: `${draft.name.trim()} gespeichert` })
    navigate(-1)
  }

  const remove = async () => {
    if (!id) return
    const row = await deleteRecipe(id)
    navigate(-1)
    if (row) toast({ message: `${row.name} gelöscht`, action: { label: 'Rückgängig', onClick: () => restoreRecipe(row) } })
  }

  return (
    <Screen
      back
      title={id ? 'Rezept bearbeiten' : 'Neues Rezept'}
      large={false}
      bottomPad={false}
      className="pb-[calc(env(safe-area-inset-bottom)+7rem)]"
      actions={
        id ? (
          <IconButton label="Rezept löschen" className="text-danger" onClick={() => void remove()}>
            <IconTrash size={20} />
          </IconButton>
        ) : undefined
      }
    >
      <div className="space-y-4 pt-2">
        <Field label="Name">
          <TextInput value={draft.name} placeholder="z. B. Hähnchen-Curry" onChange={(e) => set({ name: e.target.value })} />
        </Field>

        <Card className="!p-5">
          <p className="text-[13px] font-semibold text-ink-2">Pro Portion{t.servingG > 0 ? ` · ${fmtInt(t.servingG)} g` : ''}</p>
          <p className="mt-0.5 flex items-baseline gap-1.5">
            <span className="text-[44px] font-bold leading-none tracking-[-0.04em] tabular-nums">{fmtInt(t.perServing.kcal)}</span>
            <span className="text-[15px] font-semibold text-ink-2">kcal</span>
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-[14px]">
            {[
              { label: 'Eiweiß', v: t.perServing.protein, c: 'var(--protein)' },
              { label: 'Kohlenh.', v: t.perServing.carbs, c: 'var(--carbs)' },
              { label: 'Fett', v: t.perServing.fat, c: 'var(--fat)' },
            ].map((x) => (
              <div key={x.label}>
                <p className="flex items-center gap-1 text-[12px] font-semibold text-ink-2">
                  <span className="size-2 rounded-full" style={{ background: x.c }} />
                  {x.label}
                </p>
                <p className="font-semibold tabular-nums">{fmt1(x.v)} g</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[13px] text-ink-2">
            Pro 100 g Gericht: {fmtInt(t.per100.kcal)} kcal · {fmt1(t.per100.protein)} g Eiweiß
          </p>
        </Card>

        <div className="flex items-center justify-between gap-3 px-1">
          <div>
            <p className="text-[16px] font-semibold">Portionen</p>
            <p className="text-[13px] text-ink-2">Wie viele Portionen das Gericht ergibt</p>
          </div>
          <Stepper value={draft.servings} min={1} onChange={(n) => set({ servings: Math.max(1, Math.round(n)) })} />
        </div>

        <section>
          <h2 className="mb-2 px-1 text-[18px] font-semibold tracking-[-0.01em]">Zutaten</h2>
          {t.missing > 0 && (
            <Notice tone="warn" className="mb-2">
              {t.missing} {t.missing === 1 ? 'Zutat ist' : 'Zutaten sind'} nicht mehr in deinen Lebensmitteln und zählen nicht mit.
            </Notice>
          )}
          <div className="card divide-y divide-line overflow-hidden">
            {draft.ingredients.map((ing, i) => {
              const f = foods.get(ing.foodId)
              return (
                <div key={`${ing.foodId}-${i}`} className="flex items-center gap-2 py-2 pl-4 pr-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium">{f?.name ?? 'Fehlendes Lebensmittel'}</p>
                    <p className="text-[13px] tabular-nums text-ink-2">{f ? `${fmtInt((f.per100.kcal * ing.grams) / 100)} kcal` : '—'}</p>
                  </div>
                  <NumberInput value={ing.grams || null} ariaLabel={`${f?.name ?? 'Zutat'}, Gramm roh`} onChange={(n) => setGrams(i, n)} className="w-24" inputClassName="text-right" />
                  <span className="text-[13px] text-ink-2">g</span>
                  <IconButton label={`${f?.name ?? 'Zutat'} entfernen`} className="size-9 text-ink-3" onClick={() => set({ ingredients: draft.ingredients.filter((_, j) => j !== i) })}>
                    <IconTrash size={18} />
                  </IconButton>
                </div>
              )
            })}
            <button type="button" className="press flex min-h-12 w-full items-center gap-2 px-4 text-[15px] font-semibold text-brand-ink" onClick={() => setAdding(true)}>
              <IconPlus size={18} strokeWidth={2.6} /> Zutat hinzufügen
            </button>
          </div>
          <p className="mt-2 px-1 text-[13px] text-ink-2">Zutaten roh wiegen. Gesamt: {fmtInt(t.rawG)} g.</p>
        </section>

        <Field label="Gewicht gekocht" hint={`Das fertige Gericht ohne Topf wiegen. Leer nimmt das Rohgewicht (${fmtInt(t.rawG)} g).`}>
          <NumberInput value={draft.cookedWeightG} ariaLabel="Gewicht gekocht in Gramm" placeholder={String(Math.round(t.rawG) || '')} onChange={(n) => set({ cookedWeightG: n })} />
        </Field>
      </div>

      <FoodSearchSheet
        open={adding}
        title="Zutat hinzufügen"
        onClose={() => setAdding(false)}
        onPick={(f) => {
          haptic()
          set({ ingredients: [...draft.ingredients, { foodId: f.id, grams: f.lastPortionG ?? f.servings[0]?.grams ?? 100 }] })
          setAdding(false)
        }}
      />

      <StickyFooter>
        <Button block size="lg" disabled={!valid} onClick={() => void save()}>
          Rezept speichern
        </Button>
      </StickyFooter>
    </Screen>
  )
}
