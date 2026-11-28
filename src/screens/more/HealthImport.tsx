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
  weight: 'Gewicht',
  bodyFat: 'Körperfett',
  steps: 'Schritte',
  sleepMin: 'Schlaf',
  sleepScore: 'Schlafscore',
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
        setError(p.parsed.skipped.length ? `Keine Zeile lesbar (${p.parsed.skipped.length} übersprungen, erste: „${p.parsed.skipped[0].reason}“).` : 'Die Datei ist leer.')
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
      setError('Die Zwischenablage ließ sich nicht lesen. Wähl stattdessen die Datei oder erlaube das Einfügen, wenn Safari fragt.')
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
      message: `Importiert: ${log.counts.added} neu, ${log.counts.changed} aktualisiert`,
      action: { label: 'Rückgängig', onClick: () => void undoLatestImport() },
    })
  }

  const undo = async () => {
    const log = await undoLatestImport()
    if (log) toast({ message: `Import vom ${formatDate(log.createdAt.slice(0, 10))} rückgängig gemacht` })
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
    <Screen back="/more" title="Apple Health">
      <Card className="!p-5">
        <div className="flex items-center gap-3">
          <IconTile size={44}>
            <IconHeart size={24} />
          </IconTile>
          <div className="min-w-0">
            <p className="text-[17px] font-bold">Import per Kurzbefehl</p>
            <p className="text-[14px] text-ink-2">Schritte, Gewicht, Körperfett, Schlaf, Workouts</p>
          </div>
        </div>
        <p className="mt-3 text-[14px] text-ink-2">
          Web-Apps können Health nicht direkt lesen. Ein Kurzbefehl schreibt eine kleine Datei, die du hier auswählst. Dieselben Tage erneut zu importieren ändert nichts.
        </p>
        <div className="mt-4 flex gap-2">
          <Button className="flex-1" onClick={() => file.current?.click()} disabled={busy}>
            <IconUpload size={18} /> Datei wählen
          </Button>
          <Button variant="secondary" onClick={() => void paste()} disabled={busy}>
            Einfügen
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
            {preview.parsed.fromDate && preview.parsed.toDate ? `${formatDate(preview.parsed.fromDate)} bis ${formatDate(preview.parsed.toDate)}` : 'Vorschau'}
          </p>
          <p className="text-title2 mt-0.5">
            {totals?.added ?? 0} neu · {totals?.changed ?? 0} aktualisiert
          </p>
          {preview.previousImport && (
            <Notice className="mt-3">Diese Datei wurde am {formatDate(preview.previousImport.createdAt.slice(0, 10))} schon importiert. Erneut importieren ändert nichts.</Notice>
          )}
          <div className="mt-3 divide-y divide-line">
            {preview.changes.map((c) => (
              <div key={c.kind} className="flex items-center justify-between py-2 text-[15px]">
                <span className="font-medium">{KIND_LABEL[c.kind]}</span>
                <span className="tabular-nums text-ink-2">
                  {[c.added && `${c.added} neu`, c.changed && `${c.changed} aktualisiert`, c.unchanged && `${c.unchanged} unverändert`].filter(Boolean).join(' · ')}
                </span>
              </div>
            ))}
            {preview.computed.length > 0 && (
              <div className="flex items-center justify-between py-2 text-[15px]">
                <span className="font-medium">Schlafscore (berechnet)</span>
                <span className="tabular-nums text-ink-2">{preview.computed.length} Nächte</span>
              </div>
            )}
          </div>
          {preview.parsed.strengthWorkouts > 0 && (
            <p className="mt-2 text-[13px] text-ink-2">
              {preview.parsed.strengthWorkouts} Krafttraining{preview.parsed.strengthWorkouts === 1 ? '' : 's'} ausgelassen: die trägst du unter Training ein.
            </p>
          )}
          {preview.parsed.skipped.length > 0 && (
            <div className="mt-2">
              <button type="button" className="text-[13px] font-semibold text-warn-ink" onClick={() => setShowSkipped(!showSkipped)}>
                {preview.parsed.skipped.length} {preview.parsed.skipped.length === 1 ? 'Zeile' : 'Zeilen'} übersprungen {showSkipped ? '▴' : '▾'}
              </button>
              {showSkipped && (
                <ul className="mt-1 space-y-0.5 text-[12px] text-ink-2">
                  {preview.parsed.skipped.slice(0, 30).map((s) => (
                    <li key={s.line}>
                      Zeile {s.line}: {s.reason} · <span className="font-mono">{s.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="mt-4 flex gap-2">
            <Button variant="secondary" onClick={() => setPreview(null)}>
              Abbrechen
            </Button>
            <Button className="flex-1" onClick={() => void doImport()} disabled={busy || ((totals?.added ?? 0) === 0 && (totals?.changed ?? 0) === 0)}>
              Importieren
            </Button>
          </div>
        </Card>
      )}

      <SectionTitle>Importe</SectionTitle>
      {imports && imports.length > 0 ? (
        <>
          <Group>
            {imports.slice(0, 12).map((log, i) => (
              <ListRow
                key={log.id}
                icon={<IconCheckCircle size={18} />}
                title={`${formatDate(log.fromDate)} bis ${formatDate(log.toDate)}`}
                subtitle={`${formatDate(log.createdAt.slice(0, 10))} · ${log.counts.added ?? 0} neu, ${log.counts.changed ?? 0} aktualisiert${i === 0 ? ' · zuletzt' : ''}`}
                chevron={false}
              />
            ))}
          </Group>
          <Button block variant="danger" className="mt-3" onClick={() => void undo()}>
            Letzten Import rückgängig machen
          </Button>
        </>
      ) : (
        <p className="px-1 text-[14px] text-ink-2">Noch nichts importiert.</p>
      )}

      <SectionTitle>Kurzbefehl einrichten</SectionTitle>
      <Card className="!p-4">
        <ol className="list-decimal space-y-2 pl-5 text-[15px] leading-relaxed">
          <li>
            In Kurzbefehle <b>Health-Beispiele suchen</b> hinzufügen: Typ Schritte, Startdatum in den letzten 14 Tagen, <b>Nach Tag gruppieren</b>. Das Gruppieren liefert
            Tagessummen und zählt iPhone und Watch nicht doppelt.
          </li>
          <li>
            <b>Mit jedem wiederholen</b> hinzufügen. Darin liefert <b>Details von Health-Beispiel abrufen</b> Datum und Wert, und eine <b>Text</b>-Aktion schreibt eine Zeile wie{' '}
            <code className="rounded bg-fill px-1">steps;2026-11-16;8432</code>. Datum im Format ISO 8601.
          </li>
          <li>Beides für Gewicht, Körperfettanteil und Schlaf wiederholen (Schlafzeilen brauchen Beginn, Ende und Phase), optional auch für Workouts.</li>
          <li>
            Den Text kombinieren und mit <b>Datei sichern</b> unter festem Namen in iCloud Drive speichern, die alte Datei überschreiben.
          </li>
          <li>Hier „Datei wählen“ tippen und sie auswählen. Beim ersten Import die Schritte mit der Health-App vergleichen.</li>
        </ol>
        <p className="mt-3 text-[13px] font-semibold text-ink-2">Zeilenformat</p>
        <pre className="mt-1 overflow-x-auto rounded-xl bg-fill p-3 text-[12px] leading-relaxed">{LINES_EXAMPLE}</pre>
        <p className="mt-2 text-[13px] text-ink-2">
          Felder getrennt durch „;“, „,“ oder Tab; Datum als ISO oder Tag zuerst; „lb“ wird umgerechnet; Körperfett als Anteil oder Prozent; Schlafphasen auf Deutsch oder
          Englisch. Schlaf zählt zum Morgen, an dem du aufgewacht bist.
        </p>
      </Card>

      <SectionTitle>Alles aus Apples Export</SectionTitle>
      <Card className="!p-4">
        <p className="text-[15px] text-ink-2">
          Für die ganze Historie: In Health auf dein Bild tippen, dann <b>Alle Gesundheitsdaten exportieren</b>. Diese Seite am Computer öffnen, die export.zip wählen und die
          kleine Datei, die dabei entsteht, auf dem iPhone importieren. Die Datei wird nur in diesem Browser gelesen und nie hochgeladen.
        </p>
        {reduce && !reduce.done && (
          <div className="mt-3">
            <div className="h-2 overflow-hidden rounded-full bg-fill">
              <div className="h-full rounded-full bg-body transition-[width]" style={{ width: `${Math.round(reduce.progress * 100)}%` }} />
            </div>
            <p className="mt-1 text-[13px] text-ink-2">Lese … {Math.round(reduce.progress * 100)} %</p>
          </div>
        )}
        {reduce?.done && (
          <div className="mt-3 space-y-2">
            <Notice tone="ok">
              {fmtInt(reduce.done.counts.stepDays)} Tage Schritte, {fmtInt(reduce.done.counts.weights)} Gewichtswerte, {fmtInt(reduce.done.counts.bodyFat)} Körperfettwerte,{' '}
              {fmtInt(reduce.done.counts.sleepSegments)} Schlafabschnitte, {fmtInt(reduce.done.counts.workouts)} Workouts.
            </Notice>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => download(new Blob([reduce.done!.text], { type: 'text/plain' }), 'fittrack-health.txt')}>
                Datei laden
              </Button>
              <Button variant="secondary" onClick={() => void read(reduce.done!.text)}>
                Hier importieren
              </Button>
            </div>
          </div>
        )}
        <Button block variant="secondary" className="mt-3" onClick={() => exportFile.current?.click()} disabled={!!reduce && !reduce.done}>
          export.zip wählen
        </Button>
        <input ref={exportFile} type="file" accept=".zip,.xml,application/zip,text/xml" className="hidden" onChange={(e) => void reduceExport(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
      </Card>
    </Screen>
  )
}
