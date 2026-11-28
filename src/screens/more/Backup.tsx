// Backup and restore. No server is involved, so the exported file is the whole
// safety net: one tap a week, through the share sheet to Files.

import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { shareFiles } from '../../adapters/share'
import { db } from '../../db'
import { useSetting, useToday } from '../../hooks'
import type { BackupContent, RestoreMode, StorePlan } from '../../lib/backup'
import { BACKUP_ADVICE } from '../../lib/copy'
import { daysBetween, localDay } from '../../lib/dates'
import { fmtInt } from '../../lib/format'
import { applyRestore, exportBackup, exportCsv, markBackedUp, previewRestore, readBackup } from '../../store/backup'
import { IconShare, IconUpload } from '../../ui/icons'
import { Button, Card, Group, Notice, Screen, SectionTitle, Segmented, Sheet, Spinner, Toggle } from '../../ui/kit'
import { useToast } from '../../ui/toast'

const STORE_LABEL: Record<string, string> = {
  profile: 'Profil',
  goals: 'Ziele',
  nutritionTargets: 'Kalorienziele',
  foods: 'Lebensmittel',
  recipes: 'Rezepte',
  diaryEntries: 'Tagebucheinträge',
  mealTemplates: 'Gespeicherte Mahlzeiten',
  exercises: 'Eigene Übungen',
  plans: 'Pläne',
  planDays: 'Plantage und Routinen',
  planExercises: 'Planübungen',
  sessions: 'Trainings',
  setLogs: 'Sätze',
  cardioSessions: 'Cardio',
  metrics: 'Körperwerte',
  photos: 'Fortschrittsfotos',
  imports: 'Importe',
  settings: 'Einstellungen',
}

export default function Backup() {
  const toast = useToast()
  const today = useToday()
  const lastBackupAt = useSetting('lastBackupAt')
  const photoCount = useLiveQuery(() => db.photos.count())
  const [includePhotos, setIncludePhotos] = useState(false)
  const [busy, setBusy] = useState<'export' | 'csv' | 'read' | 'restore' | null>(null)
  const [restore, setRestore] = useState<{ content: BackupContent; fileName: string } | null>(null)
  const [mode, setMode] = useState<RestoreMode>('merge')
  const [plan, setPlan] = useState<StorePlan[] | null>(null)
  const [errors, setErrors] = useState<string[] | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const age = lastBackupAt ? daysBetween(localDay(new Date(lastBackupAt)), today) : null

  const doExport = async () => {
    setBusy('export')
    try {
      const file = await exportBackup(includePhotos)
      const outcome = await shareFiles([file], file.name)
      if (outcome !== 'cancelled') {
        await markBackedUp()
        toast({ message: outcome === 'shared' ? 'Backup an das Teilen-Menü übergeben' : `${file.name} heruntergeladen` })
      }
    } finally {
      setBusy(null)
    }
  }

  const doCsv = async () => {
    setBusy('csv')
    try {
      const files = await exportCsv()
      await shareFiles(files, 'Fittrack CSV-Export')
    } finally {
      setBusy(null)
    }
  }

  const pick = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = ''
    if (!file) return
    setBusy('read')
    setErrors(null)
    try {
      const r = await readBackup(file)
      if (!r.ok) {
        setErrors(r.errors)
        return
      }
      setRestore({ content: r.content, fileName: file.name })
      setPlan(await previewRestore(r.content, mode))
    } finally {
      setBusy(null)
    }
  }

  const changeMode = async (m: RestoreMode) => {
    setMode(m)
    if (restore) setPlan(await previewRestore(restore.content, m))
  }

  const apply = async () => {
    if (!restore) return
    setBusy('restore')
    try {
      await applyRestore(restore.content, mode)
      toast({ message: mode === 'replace' ? 'Wiederhergestellt: Dieses iPhone entspricht jetzt dem Backup' : 'Zusammengeführt: Neuere Daten aus dem Backup wurden ergänzt' })
      setRestore(null)
      setPlan(null)
    } catch (e) {
      setErrors([`Wiederherstellen fehlgeschlagen, nichts wurde geändert: ${(e as Error).message}`])
    } finally {
      setBusy(null)
    }
  }

  const changed = plan?.filter((p) => p.add || p.update || p.remove) ?? []

  return (
    <Screen back title="Backup">
      <Card>
        <p className="text-sm text-ink-2">Letztes Backup</p>
        <p className="text-xl font-bold">{age == null ? 'Noch nie' : age === 0 ? 'Heute' : `Vor ${age} ${age === 1 ? 'Tag' : 'Tagen'}`}</p>
        <p className="mt-2 text-sm text-ink-2">Alles, was du einträgst, liegt nur auf diesem iPhone. Sichere jede Woche ein Backup in Dateien (iCloud Drive); nach 7 Tagen erinnert dich die App.</p>
      </Card>

      <SectionTitle>Backup sichern</SectionTitle>
      <Group>
        <Toggle
          label="Fotos einschließen"
          hint={photoCount ? `${photoCount} Fotos machen die Datei größer` : 'Noch keine Fotos'}
          checked={includePhotos}
          onChange={setIncludePhotos}
          disabled={!photoCount}
        />
      </Group>
      <Button block size="lg" className="mt-3" disabled={busy != null} onClick={() => void doExport()}>
        {busy === 'export' ? <Spinner /> : <IconShare />} Backup sichern
      </Button>
      <p className="mt-2 px-1 text-sm text-ink-2">Im Teilen-Menü „In Dateien sichern“ wählen. Dateien tragen das Datum und werden nie überschrieben.</p>

      <SectionTitle>Wiederherstellen</SectionTitle>
      <Button block variant="secondary" size="lg" disabled={busy != null} onClick={() => fileRef.current?.click()}>
        {busy === 'read' ? <Spinner /> : <IconUpload />} Backup-Datei wählen
      </Button>
      <input ref={fileRef} type="file" accept=".zip,application/zip" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
      {errors && (
        <Notice tone="danger" className="mt-3">
          <p className="font-semibold">Diese Datei lässt sich nicht wiederherstellen. Nichts wurde geändert.</p>
          <ul className="mt-1 list-disc pl-5">
            {errors.slice(0, 6).map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Notice>
      )}

      <SectionTitle>Andere Apps</SectionTitle>
      <Button block variant="secondary" disabled={busy != null} onClick={() => void doCsv()}>
        {busy === 'csv' ? <Spinner /> : <IconShare />} CSV für Numbers oder Excel
      </Button>
      <p className="mt-2 px-1 text-sm text-ink-2">Tagebuch, Sätze, Cardio und Körperwerte als vier CSV-Dateien. Die JSON-Dateien im Backup sind auch ohne die App lesbar.</p>

      <Notice className="mt-6">{BACKUP_ADVICE}</Notice>

      <Sheet
        open={!!restore}
        onClose={() => {
          setRestore(null)
          setPlan(null)
        }}
        title="Dieses Backup wiederherstellen?"
        footer={
          <Button block size="lg" variant={mode === 'replace' ? 'danger' : 'primary'} disabled={busy === 'restore'} onClick={() => void apply()}>
            {busy === 'restore' ? <Spinner /> : mode === 'replace' ? 'Alles ersetzen' : 'Zusammenführen'}
          </Button>
        }
      >
        {restore && (
          <div className="space-y-4 pb-2">
            <p className="text-sm text-ink-2">
              {restore.fileName} · erstellt {new Date(restore.content.manifest.exportedAt).toLocaleString('de-DE')}
            </p>
            <Segmented
              value={mode}
              options={[
                { value: 'merge', label: 'Zusammenführen' },
                { value: 'replace', label: 'Ersetzen' },
              ]}
              onChange={(m) => void changeMode(m)}
            />
            <p className="text-sm text-ink-2">
              {mode === 'merge'
                ? 'Ergänzt Fehlendes und behält bei Doppelten die neuere Version. Was nach dem Backup gelöscht wurde, kommt zurück.'
                : 'Macht dieses iPhone exakt zum Stand des Backups. Für eine leere App oder ein neues iPhone. Alles, was nach dem Backup eingetragen wurde, geht verloren.'}
            </p>
            {restore.content.warnings.length > 0 && <Notice tone="warn">{restore.content.warnings.join(' ')}</Notice>}
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="text-left text-xs font-semibold text-ink-2">
                  <th className="py-1 font-semibold">Daten</th>
                  <th className="py-1 text-right font-semibold">Neu</th>
                  <th className="py-1 text-right font-semibold">Geändert</th>
                  <th className="py-1 text-right font-semibold">Entfernt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {changed.length ? (
                  changed.map((p) => (
                    <tr key={p.store}>
                      <td className="py-2">{STORE_LABEL[p.store] ?? p.store}</td>
                      <td className="py-2 text-right">{fmtInt(p.add)}</td>
                      <td className="py-2 text-right">{fmtInt(p.update)}</td>
                      <td className="py-2 text-right">{p.remove ? <span className="text-danger">{fmtInt(p.remove)}</span> : 0}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="py-3 text-ink-2">
                      Nichts würde sich ändern: Dieses iPhone hat schon alles aus dem Backup.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <p className="text-xs text-ink-3">Die Wiederherstellung läuft als eine Transaktion: Schlägt sie fehl, ändert sich nichts.</p>
          </div>
        )}
      </Sheet>
    </Screen>
  )
}
