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
  { key: 'installed', title: 'Installed mode', what: 'Opened from the Home Screen icon, so data lands in the installed app and is kept.' },
  { key: 'storage', title: 'Persistent storage', what: 'The system will not evict the data when the disk runs short.' },
  { key: 'wakeLock', title: 'Screen stays awake', what: 'Needed during workouts (iOS 18.4 or later).' },
  { key: 'barcode', title: 'Barcode and lookup', what: 'Decodes a test barcode offline, then asks Open Food Facts for it.' },
  { key: 'backup', title: 'Backup saved and restored', what: 'Saves a backup through the share sheet, then reads it back without changing anything.' },
]

async function checkInstalled(): Promise<Result> {
  return isStandalone()
    ? { ok: true, detail: 'Running as an installed app.' }
    : { ok: false, detail: 'Running in a browser tab. Install with Share → Add to Home Screen and open the app from its icon.' }
}

async function checkStorage(): Promise<Result> {
  if (!navigator.storage?.persisted) return { ok: false, detail: 'This browser does not report storage persistence.' }
  let persisted = await navigator.storage.persisted()
  if (!persisted && navigator.storage.persist) persisted = await navigator.storage.persist()
  const est = await navigator.storage.estimate?.()
  const used = est?.usage != null ? ` ${fmt1(est.usage / 1024 / 1024)} MB used.` : ''
  return persisted
    ? { ok: true, detail: `Granted.${used}` }
    : { ok: false, detail: `Not granted yet. WebKit grants it more readily to apps opened from the Home Screen; open the app from its icon and run this again.${used}` }
}

async function checkWakeLock(): Promise<Result> {
  if (!('wakeLock' in navigator)) return { ok: false, detail: 'No wake lock in this browser. Update iOS to 18.4 or later.' }
  try {
    const s = await navigator.wakeLock.request('screen')
    await s.release()
    return { ok: true, detail: 'The screen can be kept on during a workout.' }
  } catch (e) {
    return { ok: false, detail: `The request was refused: ${(e as Error).message}` }
  }
}

async function checkBarcode(): Promise<Result> {
  const res = await fetch(`${import.meta.env.BASE_URL}check-barcode.png`)
  if (!res.ok) return { ok: false, detail: 'The test image is missing from the app files.' }
  const found = await detectInFile(await res.blob()).catch(() => null)
  if (!found || found.code !== TEST_CODE) return { ok: false, detail: 'The decoder did not read the test barcode.' }
  const lookup = await fetchProduct(found.code)
  if (lookup.status === 'found') return { ok: true, detail: `Decoded ${found.code}; Open Food Facts answered with "${lookup.food.name}".` }
  if (lookup.status === 'error') return { ok: false, detail: `Decoded ${found.code}, but the lookup failed: ${lookup.message}` }
  return { ok: false, detail: `Decoded ${found.code}, but Open Food Facts did not return the product.` }
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
        await record('backup', { ok: false, detail: r.errors[0] ?? 'The file could not be read.' })
        return
      }
      const plan = await previewRestore(r.content, 'merge')
      const rows = plan.reduce((s, p) => s + p.inBackup, 0)
      await record('backup', { ok: true, detail: `${file.name} read back: ${fmtInt(rows)} rows, all valid. Nothing was changed.` })
    } finally {
      setRunning(null)
    }
  }

  return (
    <Screen back title="Device check">
      <Notice className="mb-3">Run this before entering real data and after each iOS update. Results are kept on this phone only.</Notice>
      <Button block size="lg" disabled={running != null} onClick={() => void runAll()}>
        {running === 'all' ? <Spinner /> : null} Run checks 1–4
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
                    {running === c.key ? <Spinner className="size-4" /> : r ? 'Run again' : 'Run'}
                  </Button>
                ) : (
                  <>
                    <Button size="sm" variant="secondary" disabled={running != null} onClick={() => void saveBackup()}>
                      1. Save a backup
                    </Button>
                    <Button size="sm" variant={backupShared ? 'primary' : 'secondary'} disabled={running != null} onClick={() => fileRef.current?.click()}>
                      2. Pick it again
                    </Button>
                  </>
                )}
              </div>
            </Card>
          )
        })}
      </div>
      <input ref={fileRef} type="file" accept=".zip,application/zip" className="hidden" onChange={(e) => void readBack(e.target.files?.[0])} />
      {saved?.ranAt && <p className="mt-4 text-center text-xs text-ink-3">Last run {new Date(saved.ranAt).toLocaleString()}</p>}
    </Screen>
  )
}
