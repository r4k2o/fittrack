import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { db } from './db'
import { localDay } from './lib/dates'
import { SETTING_DEFAULTS, type SettingsMap } from './store/settings'
import { targetFor } from './store/profile'

/** A setting, live. Undefined only while the first read is in flight. */
export function useSetting<K extends keyof SettingsMap>(key: K): SettingsMap[K] | undefined {
  return useLiveQuery(async () => {
    const row = await db.settings.get(key)
    return (row ? row.value : SETTING_DEFAULTS[key]) as SettingsMap[K]
  }, [key])
}

/** Today's local day; rolls over at midnight and when the app comes back to the front. */
export function useToday(): string {
  const [day, setDay] = useState(localDay())
  useEffect(() => {
    const check = () => setDay(localDay())
    const t = window.setInterval(check, 30_000)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.clearInterval(t)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])
  return day
}

/** The current time, re-rendering every `ms` while mounted. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms)
    return () => window.clearInterval(t)
  }, [ms])
  return now
}

export function useTarget(date: string) {
  return useLiveQuery(() => targetFor(date), [date])
}

/**
 * Keeps the screen awake while `active` (iOS 18.4+ in an installed web app). The
 * lock is released by the system when the app goes to the background, so it is
 * requested again when the app returns.
 */
export function useWakeLock(active: boolean): boolean {
  const [held, setHeld] = useState(false)
  const sentinel = useRef<WakeLockSentinel | null>(null)
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let cancelled = false
    const acquire = async () => {
      if (document.visibilityState !== 'visible' || sentinel.current) return
      try {
        const s = await navigator.wakeLock.request('screen')
        if (cancelled) {
          await s.release()
          return
        }
        sentinel.current = s
        setHeld(true)
        s.addEventListener('release', () => {
          sentinel.current = null
          setHeld(false)
        })
      } catch {
        setHeld(false)
      }
    }
    void acquire()
    document.addEventListener('visibilitychange', acquire)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', acquire)
      void sentinel.current?.release()
      sentinel.current = null
    }
  }, [active])
  return held
}

export function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export function isIos(): boolean {
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

/** 'light' or 'dark', following the system setting live (charts read colours from CSS). */
export function useColorScheme(): 'light' | 'dark' {
  const query = '(prefers-color-scheme: dark)'
  const [scheme, setScheme] = useState<'light' | 'dark'>(() => (window.matchMedia?.(query).matches ? 'dark' : 'light'))
  useEffect(() => {
    const mq = window.matchMedia?.(query)
    if (!mq) return
    const on = () => setScheme(mq.matches ? 'dark' : 'light')
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return scheme
}
