// Destructive actions show an Undo toast instead of a confirmation dialog.

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
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+6.25rem)] z-[60] flex justify-center px-4">
        {toast && (
          <div key={toast.id} className="animate-toast pointer-events-auto flex max-w-md items-center gap-2.5 rounded-full bg-ink py-1.5 pl-4 pr-1.5 text-page shadow-float">
            <IconCheckCircle size={18} className="shrink-0 opacity-80" />
            <span className="flex-1 py-1.5 text-[15px] font-medium">{toast.message}</span>
            {toast.action ? (
              <button
                type="button"
                className="press min-h-9 rounded-full bg-page/15 px-4 text-[14px] font-bold active:opacity-70"
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
