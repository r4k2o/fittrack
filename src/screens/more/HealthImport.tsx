// Apple Health import: pick the Shortcut's file (or paste it), check the preview,
// import. Importing the same file twice adds nothing, and the latest import can be
// undone. On a computer the same screen reduces Apple's full export to the line format.

import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { formatDate } from '../../lib/dates'
import { fmtInt } from '../../lib/format'
import type { ReduceCounts } from '../../lib/appleExport'
import { applyHealthImport, listImports, previewHealthImport, undoLatestImport, type ImportKind, type ImportPreview } from '../../store/health'
import { download } from '../../adapters/share'
import { IconCheckCircle, IconHeart, IconUpload } from '../../ui/icons'
import { Button, Card, Group, IconTile, ListRow, Notice, Screen, SectionTitle, Spinner } from '../../ui/kit'
import { haptic } from '../../ui/motion'
import { useToast } from '../../ui/toast'

const KIND_LABEL: Record<ImportKind, string> = {
  weight: 'Weight',
  bodyFat: 'Body fat',
  steps: 'Steps',
  sleepMin: 'Sleep',
  sleepScore: 'Sleep score',
  cardio: 'Workouts',
}

const LINES_EXAMPLE = `steps;2026-11-16;8432
weight;2026-11-16T07:02;80.4
bodyfat;2026-11-16;0.182
sleep;2026-11-15T23:41;2026-11-16T07:02;Core
workout;2026-11-16T18:00;2026-11-16T18:45;Running;420;8.1`

export default function HealthImport() {
  const toast = useToast()
  const file = useRef<HTMLInputElement>(null)
  const exportFile = useRef<HTMLInputElement>(null)
  const imports = useLiveQuery(() => listImports(), [])
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSkipped, setShowSkipped] = useState(false)
  const [reduce, setReduce] = useState<{ progress: number; done?: { text: string; counts: ReduceCounts } } | null>(null)

  const read = async (text: string) => {
    setError(null)
    setBusy(true)
    try {
      const p = await previewHealthImport(text)
      if (!p.parsed.metrics.length && !p.parsed.workouts.length) {
        setError(p.parsed.skipped.length ? `No line could be read (${p.parsed.skipped.length} skipped, first: "${p.parsed.skipped[0].reason}").` : 'The file is empty.')
        setPreview(null)
      } else setPreview(p)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const pickFile = async (f: File | undefined) => {
    if (!f) return
    await read(await f.text())
  }

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      await read(text)
    } catch {
      setError('The clipboard could not be read. Pick the file instead, or allow pasting when Safari asks.')
    }
  }

  const doImport = async () => {
    if (!preview) return
    setBusy(true)
    const log = await applyHealthImport(preview)
    setBusy(false)
    setPreview(null)
    haptic('success')
    toast({
      message: `Imported: ${log.counts.added} new, ${log.counts.changed} updated`,
      action: { label: 'Undo', onClick: () => void undoLatestImport() },
    })
  }

  const undo = async () => {
    const log = await undoLatestImport()
    if (log) toast({ message: `Import of ${formatDate(log.createdAt.slice(0, 10))} undone` })
  }

  const reduceExport = async (f: File | undefined) => {
    if (!f) return
    setReduce({ progress: 0 })
    try {
      const { reduceAppleExport } = await import('../../lib/appleExport')
      const done = await reduceAppleExport(f, { onProgress: (p) => setReduce({ progress: p }) })
      setReduce({ progress: 1, done })
    } catch (e) {
      setReduce(null)
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const totals = preview?.changes.reduce((n, c) => ({ added: n.added + c.added, changed: n.changed + c.changed }), { added: 0, changed: 0 })

  return (
    <Screen back="/more" title="Apple Health" tone="body">
      <Card tone="body" className="!p-5">
        <div className="flex items-center gap-3">
          <IconTile tone="pink" size={44}>
            <IconHeart size={24} />
          </IconTile>
          <div className="min-w-0">
            <p className="text-[17px] font-bold">Import from a Shortcut</p>
            <p className="text-[14px] text-ink-2">Steps, weight, body fat, sleep and workouts</p>
          </div>
        </div>
        <p className="mt-3 text-[14px] text-ink-2">
          Web apps cannot read Health directly. A Shortcut writes a small file; pick it here. Importing the same days again changes nothing.
        </p>
        <div className="mt-4 flex gap-2">
          <Button className="flex-1" onClick={() => file.current?.click()} disabled={busy}>
            <IconUpload size={18} /> Choose file
          </Button>
          <Button variant="secondary" onClick={() => void paste()} disabled={busy}>
            Paste
          </Button>
        </div>
        <input ref={file} type="file" accept=".txt,.csv,text/plain,text/csv" className="hidden" onChange={(e) => void pickFile(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
      </Card>

      {busy && (
        <div className="mt-4 flex justify-center text-ink-2">
          <Spinner />
        </div>
      )}
      {error && (
        <Notice tone="danger" className="mt-3">
          {error}
        </Notice>
      )}

      {preview && (
        <Card className="animate-rise mt-3 !p-4">
          <p className="text-[13px] font-semibold text-ink-2">
            {preview.parsed.fromDate && preview.parsed.toDate ? `${formatDate(preview.parsed.fromDate)} to ${formatDate(preview.parsed.toDate)}` : 'Preview'}
          </p>
          <p className="text-title2 mt-0.5">
            {totals?.added ?? 0} new · {totals?.changed ?? 0} updated
          </p>
          {preview.previousImport && (
            <Notice className="mt-3">This file was imported on {formatDate(preview.previousImport.createdAt.slice(0, 10))}. Importing it again changes nothing.</Notice>
          )}
          <div className="mt-3 divide-y divide-line">
            {preview.changes.map((c) => (
              <div key={c.kind} className="flex items-center justify-between py-2 text-[15px]">
                <span className="font-medium">{KIND_LABEL[c.kind]}</span>
                <span className="tabular-nums text-ink-2">
                  {[c.added && `${c.added} new`, c.changed && `${c.changed} updated`, c.unchanged && `${c.unchanged} unchanged`].filter(Boolean).join(' · ')}
                </span>
              </div>
            ))}
            {preview.computed.length > 0 && (
              <div className="flex items-center justify-between py-2 text-[15px]">
                <span className="font-medium">Sleep score (computed)</span>
                <span className="tabular-nums text-ink-2">{preview.computed.length} nights</span>
              </div>
            )}
          </div>
          {preview.parsed.strengthWorkouts > 0 && (
            <p className="mt-2 text-[13px] text-ink-2">
              {preview.parsed.strengthWorkouts} strength workout{preview.parsed.strengthWorkouts === 1 ? '' : 's'} left out: log those in Train.
            </p>
          )}
          {preview.parsed.skipped.length > 0 && (
            <div className="mt-2">
              <button type="button" className="text-[13px] font-semibold text-warn-ink" onClick={() => setShowSkipped(!showSkipped)}>
                {preview.parsed.skipped.length} line{preview.parsed.skipped.length === 1 ? '' : 's'} skipped {showSkipped ? '▴' : '▾'}
              </button>
              {showSkipped && (
                <ul className="mt-1 space-y-0.5 text-[12px] text-ink-2">
                  {preview.parsed.skipped.slice(0, 30).map((s) => (
                    <li key={s.line}>
                      Line {s.line}: {s.reason} · <span className="font-mono">{s.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="mt-4 flex gap-2">
            <Button variant="secondary" onClick={() => setPreview(null)}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={() => void doImport()} disabled={busy || ((totals?.added ?? 0) === 0 && (totals?.changed ?? 0) === 0)}>
              Import
            </Button>
          </div>
        </Card>
      )}

      <SectionTitle>Imports</SectionTitle>
      {imports && imports.length > 0 ? (
        <>
          <Group>
            {imports.slice(0, 12).map((log, i) => (
              <ListRow
                key={log.id}
                icon={<IconCheckCircle size={18} />}
                iconTone="body"
                title={`${formatDate(log.fromDate)} to ${formatDate(log.toDate)}`}
                subtitle={`${formatDate(log.createdAt.slice(0, 10))} · ${log.counts.added ?? 0} new, ${log.counts.changed ?? 0} updated${i === 0 ? ' · latest' : ''}`}
                chevron={false}
              />
            ))}
          </Group>
          <Button block variant="danger" className="mt-3" onClick={() => void undo()}>
            Undo the latest import
          </Button>
        </>
      ) : (
        <p className="px-1 text-[14px] text-ink-2">Nothing imported yet.</p>
      )}

      <SectionTitle>Set up the Shortcut</SectionTitle>
      <Card className="!p-4">
        <ol className="list-decimal space-y-2 pl-5 text-[15px] leading-relaxed">
          <li>
            In Shortcuts, add <b>Find Health Samples</b>: type Steps, start date in the last 14 days, <b>Group by Day</b>. Grouping gives daily totals and avoids double counting
            iPhone and Watch.
          </li>
          <li>
            Add <b>Repeat with Each</b>. Inside it, <b>Get Details of Health Sample</b> gives the date and value, and a <b>Text</b> action writes one line such as{' '}
            <code className="rounded bg-fill px-1">steps;2026-11-16;8432</code>. Format the date as ISO 8601.
          </li>
          <li>Repeat both steps for Weight, Body Fat Percentage and Sleep (Sleep lines take a start, an end and the stage), and optionally Workouts.</li>
          <li>
            Combine the text and use <b>Save File</b> with a fixed name in iCloud Drive, overwriting the previous file.
          </li>
          <li>Here, tap Choose file and pick it. Compare the first import's step totals with the Health app.</li>
        </ol>
        <p className="mt-3 text-[13px] font-semibold text-ink-2">Line format</p>
        <pre className="mt-1 overflow-x-auto rounded-xl bg-fill p-3 text-[12px] leading-relaxed">{LINES_EXAMPLE}</pre>
        <p className="mt-2 text-[13px] text-ink-2">
          Fields may be separated by ";", "," or tabs; dates may be ISO or day-first; "lb" is converted; body fat may be a fraction or a percentage; sleep stages in English or
          German. Sleep is filed under the morning you woke up.
        </p>
      </Card>

      <SectionTitle>Backfill from Apple's export</SectionTitle>
      <Card className="!p-4">
        <p className="text-[15px] text-ink-2">
          For your whole history: in Health, tap your picture, then <b>Export All Health Data</b>. Open this page on a computer, pick the export.zip, and import the small file it
          gives you on the phone. The file is read in this browser and never uploaded.
        </p>
        {reduce && !reduce.done && (
          <div className="mt-3">
            <div className="h-2 overflow-hidden rounded-full bg-fill">
              <div className="h-full rounded-full bg-body transition-[width]" style={{ width: `${Math.round(reduce.progress * 100)}%` }} />
            </div>
            <p className="mt-1 text-[13px] text-ink-2">Reading… {Math.round(reduce.progress * 100)}%</p>
          </div>
        )}
        {reduce?.done && (
          <div className="mt-3 space-y-2">
            <Notice tone="ok">
              {fmtInt(reduce.done.counts.stepDays)} days of steps, {fmtInt(reduce.done.counts.weights)} weights, {fmtInt(reduce.done.counts.bodyFat)} body-fat readings,{' '}
              {fmtInt(reduce.done.counts.sleepSegments)} sleep segments, {fmtInt(reduce.done.counts.workouts)} workouts.
            </Notice>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => download(new Blob([reduce.done!.text], { type: 'text/plain' }), 'fittrack-health.txt')}>
                Download file
              </Button>
              <Button variant="secondary" onClick={() => void read(reduce.done!.text)}>
                Import here
              </Button>
            </div>
          </div>
        )}
        <Button block variant="secondary" className="mt-3" onClick={() => exportFile.current?.click()} disabled={!!reduce && !reduce.done}>
          Choose export.zip
        </Button>
        <input ref={exportFile} type="file" accept=".zip,.xml,application/zip,text/xml" className="hidden" onChange={(e) => void reduceExport(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
      </Card>
    </Screen>
  )
}
