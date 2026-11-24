// Destructive actions show an Undo toast instead of a confirmation dialog.

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

export interface ToastOptions {
  message: string
  action?: { label: string; onClick: () => void | Promise<void> }
  /** ms; default 4 s, or 6 s with an action. */
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
    timer.current = window.setTimeout(() => setToast((cur) => (cur?.id === id ? null : cur)), t.duration ?? (t.action ? 6000 : 4000))
  }, [])
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-[60] flex justify-center px-4">
        {toast && (
          <div key={toast.id} className="animate-fade pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl bg-ink py-2 pl-4 pr-2 text-canvas shadow-xl">
            <span className="flex-1 py-1.5 text-[15px]">{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                className="min-h-10 rounded-xl px-3 font-semibold text-accent-soft active:opacity-70"
                onClick={async () => {
                  const a = toast.action
                  setToast(null)
                  await a?.onClick()
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  )
}
