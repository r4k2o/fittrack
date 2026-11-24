import { useEffect, useRef, useState } from 'react'

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/**
 * Animates a number toward `target` (ease-out), starting from `from` on first
 * render. Jumps straight to the value when the user asks for reduced motion.
 */
export function useAnimatedNumber(target: number, duration = 650, from = 0): number {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : from))
  const current = useRef(value)
  useEffect(() => {
    if (prefersReducedMotion() || !Number.isFinite(target)) {
      current.current = target
      setValue(target)
      return
    }
    const start = performance.now()
    const a = current.current
    const b = target
    let raf = 0
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      const v = a + (b - a) * eased
      current.current = v
      setValue(v)
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return value
}

/**
 * A short haptic tap where the platform offers one: the Vibration API on Android,
 * and on iOS 18+ the system switch control, which ticks when toggled from a user
 * gesture. Silently does nothing elsewhere.
 */
export function haptic(kind: 'tap' | 'success' = 'tap'): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(kind === 'success' ? [12, 60, 12] : 10)
      return
    }
    const label = document.createElement('label')
    label.setAttribute('aria-hidden', 'true')
    label.style.cssText = 'position:fixed;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none'
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.setAttribute('switch', '')
    input.tabIndex = -1
    label.appendChild(input)
    document.body.appendChild(label)
    label.click()
    label.remove()
  } catch {
    // no haptics available
  }
}
