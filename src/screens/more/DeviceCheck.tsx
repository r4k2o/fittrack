// Five things only the phone can confirm. Run it before entering real data and
// after each iOS update.

import { useRef, useState } from 'react'
import { detectInFile } from '../../adapters/barcode'
import { fetchProduct } from '../../adapters/openFoodFacts'
import { shareFiles } from '../../adapters/share'
import { isStandalone, useSetting } from '../../hooks'
import { fmt1, fmtInt } from '../../lib/format'
import { exportBackup, markBackedUp, previewRestore, readBackup } from '../../store/backup'
import { getSetting, setSetting, type DeviceCheckResult } from '../../store/settings'
import { IconCheck, IconWarn } from '../../ui/icons'
import { Button, Card, cx, Notice, Screen, Spinner } from '../../ui/kit'

type Key = 'installed' | 'storage' | 'wakeLock' | 'barcode' | 'backup'
type Result = { ok: boolean; detail: string }

const TEST_CODE = '3017624010701'

const CHECKS: { key: Key; title: string; what: string }[] = [
  { key: 'installed', title: 'Als App installiert', what: 'Vom Home-Bildschirm geöffnet, damit die Daten in der installierten App landen und bleiben.' },
  { key: 'storage', title: 'Dauerhafter Speicher', what: 'Das System löscht die Daten nicht, wenn der Platz knapp wird.' },
  { key: 'wakeLock', title: 'Bildschirm bleibt an', what: 'Wichtig beim Training (ab iOS 18.4).' },
  { key: 'barcode', title: 'Barcode und Suche', what: 'Liest einen Test-Barcode offline und fragt Open Food Facts danach.' },
  { key: 'backup', title: 'Backup sichern und lesen', what: 'Sichert ein Backup über das Teilen-Menü und liest es wieder ein, ohne etwas zu ändern.' },
]

async function checkInstalled(): Promise<Result> {
  return isStandalone()
    ? { ok: true, detail: 'Läuft als installierte App.' }
    : { ok: false, detail: 'Läuft in einem Browser-Tab. Über Teilen → Zum Home-Bildschirm installieren und vom Symbol öffnen.' }
}

async function checkStorage(): Promise<Result> {
  if (!navigator.storage?.persisted) return { ok: false, detail: 'Dieser Browser meldet keinen dauerhaften Speicher.' }
  let persisted = await navigator.storage.persisted()
  if (!persisted && navigator.storage.persist) persisted = await navigator.storage.persist()
  const est = await navigator.storage.estimate?.()
  const used = est?.usage != null ? ` ${fmt1(est.usage / 1024 / 1024)} MB belegt.` : ''
  return persisted
    ? { ok: true, detail: `Erteilt.${used}` }
    : { ok: false, detail: `Noch nicht erteilt. WebKit gewährt ihn eher Apps vom Home-Bildschirm; die App über ihr Symbol öffnen und erneut testen.${used}` }
}

async function checkWakeLock(): Promise<Result> {
  if (!('wakeLock' in navigator)) return { ok: false, detail: 'Dieser Browser kann den Bildschirm nicht anlassen. iOS auf 18.4 oder neuer aktualisieren.' }
  try {
    const s = await navigator.wakeLock.request('screen')
    await s.release()
    return { ok: true, detail: 'Der Bildschirm bleibt beim Training an.' }
  } catch (e) {
    return { ok: false, detail: `Anfrage abgelehnt: ${(e as Error).message}` }
  }
}

async function checkBarcode(): Promise<Result> {
  const res = await fetch(`${import.meta.env.BASE_URL}check-barcode.png`)
  if (!res.ok) return { ok: false, detail: 'Das Testbild fehlt in den App-Dateien.' }
  const found = await detectInFile(await res.blob()).catch(() => null)
  if (!found || found.code !== TEST_CODE) return { ok: false, detail: 'Der Test-Barcode wurde nicht erkannt.' }
  const lookup = await fetchProduct(found.code)
  if (lookup.status === 'found') return { ok: true, detail: `${found.code} erkannt; Open Food Facts antwortet mit „${lookup.food.name}“.` }
  if (lookup.status === 'error') return { ok: false, detail: `${found.code} erkannt, aber die Suche schlug fehl: ${lookup.message}` }
  return { ok: false, detail: `${found.code} erkannt, aber Open Food Facts lieferte kein Produkt.` }
}

export default function DeviceCheck() {
  const saved = useSetting('deviceCheck')
  const [results, setResults] = useState<Partial<Record<Key, Result>>>({})
  const [running, setRunning] = useState<Key | 'all' | null>(null)
  const [backupShared, setBackupShared] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const shown: Partial<Record<Key, Result>> = { ...(saved?.results as Partial<Record<Key, Result>> | undefined), ...results }

  const record = async (key: Key, r: Result) => {
    setResults((cur) => ({ ...cur, [key]: r }))
    const current = (await getSetting('deviceCheck')) ?? { ranAt: '', results: {} }
    const next: DeviceCheckResult = { ranAt: new Date().toISOString(), results: { ...current.results, [key]: r } }
    await setSetting('deviceCheck', next)
  }

  const run = async (key: Key) => {
    setRunning(key)
    try {
      const r = key === 'installed' ? await checkInstalled() : key === 'storage' ? await checkStorage() : key === 'wakeLock' ? await checkWakeLock() : await checkBarcode()
      await record(key, r)
    } catch (e) {
      await record(key, { ok: false, detail: (e as Error).message })
    } finally {
      setRunning(null)
    }
  }

  const runAll = async () => {
    setRunning('all')
    for (const k of ['installed', 'storage', 'wakeLock', 'barcode'] as const) {
      try {
        const r = k === 'installed' ? await checkInstalled() : k === 'storage' ? await checkStorage() : k === 'wakeLock' ? await checkWakeLock() : await checkBarcode()
        await record(k, r)
      } catch (e) {
        await record(k, { ok: false, detail: (e as Error).message })
      }
    }
    setRunning(null)
  }

  const saveBackup = async () => {
    setRunning('backup')
    try {
      const file = await exportBackup(false)
      const outcome = await shareFiles([file], file.name)
      if (outcome === 'cancelled') return
      await markBackedUp()
      setBackupShared(true)
    } finally {
      setRunning(null)
    }
  }

  const readBack = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = ''
    if (!file) return
    setRunning('backup')
    try {
      const r = await readBackup(file)
      if (!r.ok) {
        await record('backup', { ok: false, detail: r.errors[0] ?? 'Die Datei ließ sich nicht lesen.' })
        return
      }
      const plan = await previewRestore(r.content, 'merge')
      const rows = plan.reduce((s, p) => s + p.inBackup, 0)
      await record('backup', { ok: true, detail: `${file.name} gelesen: ${fmtInt(rows)} Zeilen, alle gültig. Nichts wurde geändert.` })
    } finally {
      setRunning(null)
    }
  }

  return (
    <Screen back title="Gerätetest">
      <Notice className="mb-3">Vor echten Daten und nach jedem iOS-Update ausführen. Die Ergebnisse bleiben auf diesem iPhone.</Notice>
      <Button block size="lg" disabled={running != null} onClick={() => void runAll()}>
        {running === 'all' ? <Spinner /> : null} Tests 1–4 starten
      </Button>

      <div className="mt-4 space-y-3">
        {CHECKS.map((c, i) => {
          const r = shown[c.key]
          return (
            <Card key={c.key}>
              <div className="flex items-start gap-3">
                <span
                  className={cx(
                    'flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                    !r ? 'bg-fill text-ink-2' : r.ok ? 'btn-accent' : 'bg-warn-soft text-warn',
                  )}
                >
                  {!r ? i + 1 : r.ok ? <IconCheck size={18} strokeWidth={3} /> : <IconWarn size={18} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{c.title}</p>
                  <p className="text-sm text-ink-2">{r ? r.detail : c.what}</p>
                </div>
              </div>
              <div className="mt-3 flex gap-2 pl-12">
                {c.key !== 'backup' ? (
                  <Button size="sm" variant="secondary" disabled={running != null} onClick={() => void run(c.key)}>
                    {running === c.key ? <Spinner className="size-4" /> : r ? 'Nochmal' : 'Starten'}
                  </Button>
                ) : (
                  <>
                    <Button size="sm" variant="secondary" disabled={running != null} onClick={() => void saveBackup()}>
                      1. Backup sichern
                    </Button>
                    <Button size="sm" variant={backupShared ? 'primary' : 'secondary'} disabled={running != null} onClick={() => fileRef.current?.click()}>
                      2. Wieder auswählen
                    </Button>
                  </>
                )}
              </div>
            </Card>
          )
        })}
      </div>
      <input ref={fileRef} type="file" accept=".zip,application/zip" className="hidden" onChange={(e) => void readBack(e.target.files?.[0])} />
      {saved?.ranAt && <p className="mt-4 text-center text-xs text-ink-3">Zuletzt {new Date(saved.ranAt).toLocaleString('de-DE')}</p>}
    </Screen>
  )
}
