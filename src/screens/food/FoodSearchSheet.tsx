// Pick a food from the local list: typo-tolerant search, recent foods when empty.

import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { db, type Food } from '../../db'
import { fmtInt } from '../../lib/format'
import { buildFoodIndex, searchFoods } from '../../lib/foodSearch'
import { recentFoods } from '../../store/foods'
import { IconSearch } from '../../ui/icons'
import { EmptyState, Sheet, Spinner } from '../../ui/kit'

export function FoodSearchSheet({ open, title, onPick, onClose }: { open: boolean; title: string; onPick: (f: Food) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const foods = useLiveQuery(() => (open ? db.foods.toArray() : []), [open])
  const recent = useLiveQuery(() => (open ? recentFoods(20) : []), [open])
  const index = useMemo(() => (foods?.length ? buildFoodIndex(foods) : null), [foods])
  const byId = useMemo(() => new Map((foods ?? []).map((f) => [f.id, f])), [foods])
  const list = useMemo(() => {
    if (!q.trim()) return recent ?? null
    if (!index) return []
    return searchFoods(index, q, new Map(), 40)
      .map((id) => byId.get(id))
      .filter((f): f is Food => !!f)
  }, [q, index, byId, recent])

  return (
    <Sheet
      open={open}
      onClose={() => {
        setQ('')
        onClose()
      }}
      title={title}
    >
      <div className="relative">
        <IconSearch size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-3" />
        <input
          type="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Search foods"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="min-h-12 w-full rounded-2xl bg-fill pl-12 pr-4 outline-none placeholder:text-ink-3 focus:ring-2 focus:ring-accent"
        />
      </div>
      {!q.trim() && <p className="mb-1 mt-4 px-1 text-[13px] font-semibold text-ink-2">Recent</p>}
      <div className="mt-2">
        {!list ? (
          <div className="flex justify-center py-8 text-ink-2">
            <Spinner />
          </div>
        ) : list.length ? (
          <div className="divide-y divide-line overflow-hidden rounded-[20px] bg-fill">
            {list.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  setQ('')
                  onPick(f)
                }}
                className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-fill-strong"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-medium">{f.name}</span>
                  {f.brand && <span className="block truncate text-[13px] text-ink-2">{f.brand}</span>}
                </span>
                <span className="shrink-0 text-[13px] tabular-nums text-ink-2">{fmtInt(f.per100.kcal)} kcal/100 g</span>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState title={q.trim() ? `Nothing found for "${q}"` : 'No foods yet'}>Scan the package or add it from its label first, or import a food list under More.</EmptyState>
        )}
      </div>
    </Sheet>
  )
}
