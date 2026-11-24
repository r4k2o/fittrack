// Destructive actions show an Undo toast instead of a confirmation dialog. Toasts sit at
// the top, clear of the tab bar, the + button, the rest timer and sheet buttons, and
// stay narrow enough to leave the header buttons in both corners free.

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { IconCheckCircle } from './icons'

export interface ToastOptions {
  message: string
  action?: { label: string; onClick: () => void | Promise<void> }
  /** ms; default 3.5 s, or 6 s with an action. */
  duration?: number
}

const ToastContext = createContext<(t: ToastOptions) => void>(() => {})

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastOptions & { id: number }) | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const show = useCallback((t: ToastOptions) => {
    window.clearTimeout(timer.current)
    const id = Date.now()
    setToast({ ...t, id })
    timer.current = window.setTimeout(() => setToast((cur) => (cur?.id === id ? null : cur)), t.duration ?? (t.action ? 6000 : 3500))
  }, [])
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.5rem)] z-[60] flex justify-center px-4">
        {toast && (
          <div key={toast.id} className="animate-drop pointer-events-auto flex w-max max-w-[min(28rem,calc(100%-6.5rem))] items-center gap-2 rounded-full bg-ink py-1 pl-3.5 pr-1 text-page shadow-float">
            <IconCheckCircle size={18} className="shrink-0 opacity-80" />
            <span className="min-w-0 flex-1 truncate py-1.5 text-[14px] font-medium">{toast.message}</span>
            {toast.action ? (
              <button
                type="button"
                className="press min-h-9 shrink-0 rounded-full bg-page/15 px-3.5 text-[14px] font-bold active:opacity-70"
                onClick={async () => {
                  const a = toast.action
                  setToast(null)
                  await a?.onClick()
                }}
              >
                {toast.action.label}
              </button>
            ) : (
              <span className="w-2.5" />
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  )
}
