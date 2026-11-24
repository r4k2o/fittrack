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
      <Screen back title="Recipe" tone="food">
        <EmptyState title="Recipe not found">It may have been deleted.</EmptyState>
      </Screen>
    )
  if (!draft || !foods)
    return (
      <Screen back title="Recipe" tone="food">
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
    toast({ message: `${draft.name.trim()} saved` })
    navigate(-1)
  }

  const remove = async () => {
    if (!id) return
    const row = await deleteRecipe(id)
    navigate(-1)
    if (row) toast({ message: `${row.name} deleted`, action: { label: 'Undo', onClick: () => restoreRecipe(row) } })
  }

  return (
    <Screen
      back
      title={id ? 'Edit recipe' : 'New recipe'}
      tone="food"
      large={false}
      bottomPad={false}
      className="pb-[calc(env(safe-area-inset-bottom)+7rem)]"
      actions={
        id ? (
          <IconButton label="Delete recipe" className="text-danger" onClick={() => void remove()}>
            <IconTrash size={20} />
          </IconButton>
        ) : undefined
      }
    >
      <div className="space-y-4 pt-2">
        <Field label="Name">
          <TextInput value={draft.name} placeholder="e.g. Chicken curry" onChange={(e) => set({ name: e.target.value })} />
        </Field>

        <Card tone="food" className="!p-5">
          <p className="text-[13px] font-semibold text-ink-2">Per serving{t.servingG > 0 ? ` · ${fmtInt(t.servingG)} g` : ''}</p>
          <p className="mt-0.5 flex items-baseline gap-1.5">
            <span className="text-[44px] font-bold leading-none tracking-[-0.04em] tabular-nums">{fmtInt(t.perServing.kcal)}</span>
            <span className="text-[15px] font-semibold text-ink-2">kcal</span>
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-[14px]">
            {[
              { label: 'Protein', v: t.perServing.protein, c: 'var(--protein)' },
              { label: 'Carbs', v: t.perServing.carbs, c: 'var(--carbs)' },
              { label: 'Fat', v: t.perServing.fat, c: 'var(--fat)' },
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
            Per 100 g of the dish: {fmtInt(t.per100.kcal)} kcal · {fmt1(t.per100.protein)} g protein
          </p>
        </Card>

        <div className="flex items-center justify-between gap-3 px-1">
          <div>
            <p className="text-[16px] font-semibold">Servings</p>
            <p className="text-[13px] text-ink-2">How many portions the dish makes</p>
          </div>
          <Stepper value={draft.servings} min={1} onChange={(n) => set({ servings: Math.max(1, Math.round(n)) })} />
        </div>

        <section>
          <h2 className="mb-2 px-1 text-[20px] font-bold tracking-tight">Ingredients</h2>
          {t.missing > 0 && (
            <Notice tone="warn" className="mb-2">
              {t.missing} ingredient{t.missing === 1 ? ' is' : 's are'} no longer in your foods and left out of the totals.
            </Notice>
          )}
          <div className="card divide-y divide-line overflow-hidden">
            {draft.ingredients.map((ing, i) => {
              const f = foods.get(ing.foodId)
              return (
                <div key={`${ing.foodId}-${i}`} className="flex items-center gap-2 py-2 pl-4 pr-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium">{f?.name ?? 'Missing food'}</p>
                    <p className="text-[13px] tabular-nums text-ink-2">{f ? `${fmtInt((f.per100.kcal * ing.grams) / 100)} kcal` : '—'}</p>
                  </div>
                  <NumberInput value={ing.grams || null} ariaLabel={`${f?.name ?? 'Ingredient'} grams raw`} onChange={(n) => setGrams(i, n)} className="w-24" inputClassName="text-right" />
                  <span className="text-[13px] text-ink-2">g</span>
                  <IconButton label={`Remove ${f?.name ?? 'ingredient'}`} className="size-9 text-ink-3" onClick={() => set({ ingredients: draft.ingredients.filter((_, j) => j !== i) })}>
                    <IconTrash size={18} />
                  </IconButton>
                </div>
              )
            })}
            <button type="button" className="press flex min-h-12 w-full items-center gap-2 px-4 text-[15px] font-semibold text-brand-ink" onClick={() => setAdding(true)}>
              <IconPlus size={18} strokeWidth={2.6} /> Add ingredient
            </button>
          </div>
          <p className="mt-2 px-1 text-[13px] text-ink-2">Weigh ingredients raw. Total: {fmtInt(t.rawG)} g.</p>
        </section>

        <Field label="Cooked weight" hint={`Weigh the finished dish without the pot. Empty uses the raw total (${fmtInt(t.rawG)} g).`}>
          <NumberInput value={draft.cookedWeightG} ariaLabel="Cooked weight in grams" placeholder={String(Math.round(t.rawG) || '')} onChange={(n) => set({ cookedWeightG: n })} />
        </Field>
      </div>

      <FoodSearchSheet
        open={adding}
        title="Add ingredient"
        onClose={() => setAdding(false)}
        onPick={(f) => {
          haptic()
          set({ ingredients: [...draft.ingredients, { foodId: f.id, grams: f.lastPortionG ?? f.servings[0]?.grams ?? 100 }] })
          setAdding(false)
        }}
      />

      <StickyFooter>
        <Button block size="lg" disabled={!valid} onClick={() => void save()}>
          Save recipe
        </Button>
      </StickyFooter>
    </Screen>
  )
}
