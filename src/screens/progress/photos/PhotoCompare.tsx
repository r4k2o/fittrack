// Two weeks of the same pose side by side or under a slider, with date and weight
// beneath each. "First against latest" and "four weeks apart" are one tap each.

import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Photo } from '../../../db'
import { useObjectUrl } from '../../../hooks'
import { addDays, formatDate, localDay } from '../../../lib/dates'
import { fmt1 } from '../../../lib/format'
import { listPhotos, POSE_LABEL, POSES, type Pose } from '../../../store/photos'
import { Chip, EmptyState, Screen, Segmented } from '../../../ui/kit'

const caption = (p: Photo | undefined) => (p ? `${formatDate(localDay(new Date(p.takenAt)))}${p.weightKg != null ? ` · ${fmt1(p.weightKg)} kg` : ''}` : '')

function PhotoSelect({ list, value, onChange, label }: { list: Photo[]; value: string; onChange: (id: string) => void; label: string }) {
  return (
    <label className="block min-w-0 flex-1">
      <span className="mb-1 block px-1 text-[12px] font-semibold text-ink-2">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="min-h-11 w-full rounded-2xl bg-fill px-3 text-[15px] outline-none">
        {list.map((p) => (
          <option key={p.id} value={p.id}>
            {caption(p)}
          </option>
        ))}
      </select>
    </label>
  )
}

export default function PhotoCompare() {
  const [params, setParams] = useSearchParams()
  const pose = (POSES.includes(params.get('pose') as Pose) ? params.get('pose') : 'front') as Pose
  const all = useLiveQuery(() => listPhotos(), [])
  const [mode, setMode] = useState<'side' | 'slider'>('side')
  const [split, setSplit] = useState(50)
  const list = (all ?? []).filter((p) => p.pose === pose).sort((a, b) => a.takenAt.localeCompare(b.takenAt))
  const first = list[0]
  const latest = list.at(-1)
  const a = list.find((p) => p.id === params.get('a')) ?? first
  const b = list.find((p) => p.id === params.get('b')) ?? latest
  const aUrl = useObjectUrl(a?.image)
  const bUrl = useObjectUrl(b?.image)
  const set = (patch: Record<string, string>) => setParams({ pose, ...(a ? { a: a.id } : {}), ...(b ? { b: b.id } : {}), ...patch }, { replace: true })
  const fourWeeks = () => {
    if (!latest) return
    const target = addDays(localDay(new Date(latest.takenAt)), -28)
    const near = [...list].filter((p) => p.id !== latest.id).sort((x, y) => Math.abs(new Date(x.takenAt).getTime() - new Date(target).getTime()) - Math.abs(new Date(y.takenAt).getTime() - new Date(target).getTime()))[0]
    if (near) set({ a: near.id, b: latest.id })
  }

  return (
    <Screen back="/progress?tab=photos" title="Compare photos">
      <Segmented value={pose} options={POSES.map((p) => ({ value: p, label: POSE_LABEL[p] }))} onChange={(p) => setParams({ pose: p }, { replace: true })} />
      {list.length < 2 ? (
        <EmptyState title={`Fewer than two ${POSE_LABEL[pose].toLowerCase()} photos`}>Take one this week and another in a few weeks to compare them.</EmptyState>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            <Chip active={a?.id === first?.id && b?.id === latest?.id} onClick={() => first && latest && set({ a: first.id, b: latest.id })}>
              First against latest
            </Chip>
            <Chip onClick={fourWeeks}>Four weeks apart</Chip>
          </div>
          <div className="mt-3 flex gap-2">
            <PhotoSelect label="Before" list={list} value={a?.id ?? ''} onChange={(id) => set({ a: id })} />
            <PhotoSelect label="After" list={list} value={b?.id ?? ''} onChange={(id) => set({ b: id })} />
          </div>
          <Segmented
            className="mt-3"
            size="sm"
            value={mode}
            options={[
              { value: 'side' as const, label: 'Side by side' },
              { value: 'slider' as const, label: 'Slider' },
            ]}
            onChange={setMode}
          />
          {mode === 'side' ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[
                { p: a, url: aUrl },
                { p: b, url: bUrl },
              ].map(({ p, url }, i) => (
                <figure key={i} className="m-0">
                  <div className="aspect-[3/4] overflow-hidden rounded-[18px] bg-fill">{url && <img src={url} alt={caption(p)} className="size-full object-cover" />}</div>
                  <figcaption className="mt-1.5 text-center text-[13px] font-semibold text-ink-2">{caption(p)}</figcaption>
                </figure>
              ))}
            </div>
          ) : (
            <div className="mt-3">
              <div className="relative aspect-[3/4] overflow-hidden rounded-[22px] bg-fill">
                {aUrl && <img src={aUrl} alt={caption(a)} className="absolute inset-0 size-full object-cover" />}
                {bUrl && <img src={bUrl} alt={caption(b)} className="absolute inset-0 size-full object-cover" style={{ clipPath: `inset(0 0 0 ${split}%)` }} />}
                <span className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow" style={{ left: `${split}%` }} />
                <span className="absolute bottom-2 left-2 rounded-full bg-black/50 px-2 py-0.5 text-[12px] font-semibold text-white">{caption(a)}</span>
                <span className="absolute bottom-2 right-2 rounded-full bg-black/50 px-2 py-0.5 text-[12px] font-semibold text-white">{caption(b)}</span>
              </div>
              <input type="range" min={0} max={100} value={split} aria-label="Slide between the two photos" onChange={(e) => setSplit(Number(e.target.value))} className="mt-3 h-11 w-full accent-[var(--body)]" />
            </div>
          )}
        </>
      )}
    </Screen>
  )
}
