import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { db, type Exercise } from '../../db'
import { normalizeTerm } from '../../lib/foodSearch'
import { EQUIPMENT_LABEL, exerciseSubtitle, MUSCLE_GROUPS, MUSCLE_LABEL } from '../../lib/training'
import { IconSearch } from '../../ui/icons'
import { Chip, EmptyState, Group, ListRow, Spinner } from '../../ui/kit'

/** Searchable, filterable exercise list; `suggest` puts alternatives (same movement) on top. */
export function ExercisePicker({
  onPick,
  exclude = [],
  autoFocus,
  suggest,
}: {
  onPick: (e: Exercise) => void
  exclude?: readonly string[]
  autoFocus?: boolean
  suggest?: readonly Exercise[]
}) {
  const all = useLiveQuery(() => db.exercises.toArray())
  const [q, setQ] = useState('')
  const [group, setGroup] = useState<string | null>(null)
  const list = useMemo(() => {
    if (!all) return null
    const terms = normalizeTerm(q).split(/\s+/).filter(Boolean)
    const muscles = MUSCLE_GROUPS.find((g) => g.label === group)?.muscles
    return all
      .filter((e) => !exclude.includes(e.id))
      .filter((e) => !muscles || e.primary.some((m) => muscles.includes(m)))
      .filter((e) => {
        if (!terms.length) return true
        const hay = normalizeTerm(`${e.name} ${EQUIPMENT_LABEL[e.equipment]} ${e.primary.map((m) => MUSCLE_LABEL[m]).join(' ')}`)
        return terms.every((t) => hay.includes(t))
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [all, q, group, exclude])

  return (
    <div>
      <div className="relative">
        <IconSearch size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-3" />
        <input
          type="search"
          autoFocus={autoFocus}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Search exercises"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="min-h-12 w-full rounded-2xl bg-fill pl-12 pr-4 outline-none placeholder:text-ink-3 focus:ring-2 focus:ring-accent"
        />
      </div>
      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
        <Chip active={!group} onClick={() => setGroup(null)}>
          All
        </Chip>
        {MUSCLE_GROUPS.map((g) => (
          <Chip key={g.label} active={group === g.label} onClick={() => setGroup(group === g.label ? null : g.label)}>
            {g.label}
          </Chip>
        ))}
      </div>
      {suggest && suggest.length > 0 && !q && !group && (
        <div className="mt-3">
          <p className="mb-1.5 px-1 text-[13px] font-semibold text-ink-2">Same movement</p>
          <Group className="bg-fill">
            {suggest.map((e) => (
              <ListRow key={e.id} title={e.name} subtitle={exerciseSubtitle(e)} chevron={false} onClick={() => onPick(e)} />
            ))}
          </Group>
          <p className="mb-1.5 mt-4 px-1 text-[13px] font-semibold text-ink-2">All exercises</p>
        </div>
      )}
      <div className="mt-3">
        {!list ? (
          <div className="flex justify-center py-8 text-ink-2">
            <Spinner />
          </div>
        ) : list.length ? (
          <Group className="bg-fill">
            {list.map((e) => (
              <ListRow key={e.id} title={e.name} subtitle={exerciseSubtitle(e)} detail={e.custom ? 'Custom' : undefined} chevron={false} onClick={() => onPick(e)} />
            ))}
          </Group>
        ) : (
          <EmptyState title="No exercise matches">Add your own under Train → Exercises.</EmptyState>
        )}
      </div>
    </div>
  )
}
