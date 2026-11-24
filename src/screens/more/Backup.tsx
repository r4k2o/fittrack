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
  profile: 'Profile',
  goals: 'Goals',
  nutritionTargets: 'Targets',
  foods: 'Foods',
  recipes: 'Recipes',
  diaryEntries: 'Diary entries',
  mealTemplates: 'Saved meals',
  exercises: 'Custom exercises',
  plans: 'Plans',
  planDays: 'Plan days and routines',
  planExercises: 'Plan exercises',
  sessions: 'Workouts',
  setLogs: 'Sets',
  cardioSessions: 'Cardio',
  metrics: 'Body metrics',
  photos: 'Progress photos',
  imports: 'Imports',
  settings: 'Settings',
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
        toast({ message: outcome === 'shared' ? 'Backup handed to the share sheet' : `Downloaded ${file.name}` })
      }
    } finally {
      setBusy(null)
    }
  }

  const doCsv = async () => {
    setBusy('csv')
    try {
      const files = await exportCsv()
      await shareFiles(files, 'Fittrack CSV export')
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
      toast({ message: mode === 'replace' ? 'Restored: this phone now matches the backup' : 'Merged: newer rows from the backup were added' })
      setRestore(null)
      setPlan(null)
    } catch (e) {
      setErrors([`The restore failed and nothing was changed: ${(e as Error).message}`])
    } finally {
      setBusy(null)
    }
  }

  const changed = plan?.filter((p) => p.add || p.update || p.remove) ?? []

  return (
    <Screen back title="Backup and restore">
      <Card>
        <p className="text-sm text-muted">Last backup</p>
        <p className="text-xl font-bold">{age == null ? 'Never' : age === 0 ? 'Today' : `${age} ${age === 1 ? 'day' : 'days'} ago`}</p>
        <p className="mt-2 text-sm text-muted">Everything you log lives only on this phone. Save a backup to Files (iCloud Drive) every week; the app reminds you on Today after 7 days.</p>
      </Card>

      <SectionTitle>Save a backup</SectionTitle>
      <Group>
        <Toggle
          label="Include progress photos"
          hint={photoCount ? `${photoCount} photos make the file larger` : 'No photos yet'}
          checked={includePhotos}
          onChange={setIncludePhotos}
          disabled={!photoCount}
        />
      </Group>
      <Button block size="lg" className="mt-3" disabled={busy != null} onClick={() => void doExport()}>
        {busy === 'export' ? <Spinner /> : <IconShare />} Save backup
      </Button>
      <p className="mt-2 px-1 text-sm text-muted">In the share sheet choose "Save to Files". Files are dated and never overwritten.</p>

      <SectionTitle>Restore</SectionTitle>
      <Button block variant="secondary" size="lg" disabled={busy != null} onClick={() => fileRef.current?.click()}>
        {busy === 'read' ? <Spinner /> : <IconUpload />} Choose a backup file
      </Button>
      <input ref={fileRef} type="file" accept=".zip,application/zip" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
      {errors && (
        <Notice tone="danger" className="mt-3">
          <p className="font-semibold">This file cannot be restored. Nothing was changed.</p>
          <ul className="mt-1 list-disc pl-5">
            {errors.slice(0, 6).map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Notice>
      )}

      <SectionTitle>Other apps</SectionTitle>
      <Button block variant="secondary" disabled={busy != null} onClick={() => void doCsv()}>
        {busy === 'csv' ? <Spinner /> : <IconShare />} Export CSV for Numbers or Excel
      </Button>
      <p className="mt-2 px-1 text-sm text-muted">Diary, sets, cardio and body metrics as four CSV files. The backup's JSON files are readable without the app too.</p>

      <Notice className="mt-6">{BACKUP_ADVICE}</Notice>

      <Sheet
        open={!!restore}
        onClose={() => {
          setRestore(null)
          setPlan(null)
        }}
        title="Restore this backup?"
        footer={
          <Button block size="lg" variant={mode === 'replace' ? 'danger' : 'primary'} disabled={busy === 'restore'} onClick={() => void apply()}>
            {busy === 'restore' ? <Spinner /> : mode === 'replace' ? 'Replace everything' : 'Merge'}
          </Button>
        }
      >
        {restore && (
          <div className="space-y-4 pb-2">
            <p className="text-sm text-muted">
              {restore.fileName} · made {new Date(restore.content.manifest.exportedAt).toLocaleString()}
            </p>
            <Segmented
              value={mode}
              options={[
                { value: 'merge', label: 'Merge' },
                { value: 'replace', label: 'Replace' },
              ]}
              onChange={(m) => void changeMode(m)}
            />
            <p className="text-sm text-muted">
              {mode === 'merge'
                ? 'Adds rows that are missing and keeps the newer version of rows that exist on both. Rows deleted after the backup was made come back.'
                : 'Makes this phone match the backup exactly. Use it for an empty app or a new phone. Anything logged after the backup is lost.'}
            </p>
            {restore.content.warnings.length > 0 && <Notice tone="warn">{restore.content.warnings.join(' ')}</Notice>}
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  <th className="py-1 font-semibold">Data</th>
                  <th className="py-1 text-right font-semibold">Add</th>
                  <th className="py-1 text-right font-semibold">Update</th>
                  <th className="py-1 text-right font-semibold">Remove</th>
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
                    <td colSpan={4} className="py-3 text-muted">
                      Nothing would change: this phone already holds everything in the backup.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <p className="text-xs text-faint">The restore runs as one transaction: if it fails, nothing changes.</p>
          </div>
        )}
      </Sheet>
    </Screen>
  )
}
