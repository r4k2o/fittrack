// UI building blocks. Tap targets are at least 44 points; number fields open the
// numeric keypad; nothing here covers the whole screen except Sheet.

import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { fmt2, parseDecimal } from '../lib/format'
import { IconChevronLeft, IconChevronRight, IconX } from './icons'

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ')

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink active:opacity-80 disabled:opacity-40',
  secondary: 'bg-sunken text-ink active:opacity-70 disabled:opacity-40',
  ghost: 'text-accent active:opacity-60 disabled:opacity-40',
  danger: 'bg-danger-soft text-danger active:opacity-70 disabled:opacity-40',
  outline: 'border border-line text-ink active:bg-sunken disabled:opacity-40',
}

export function Button({
  variant = 'primary',
  size = 'md',
  block,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; block?: boolean }) {
  const sizes = { sm: 'min-h-9 px-3 text-sm rounded-xl', md: 'min-h-11 px-4 text-[15px] rounded-2xl', lg: 'min-h-13 px-5 text-base rounded-2xl' }
  return (
    <button
      type="button"
      className={cx('inline-flex items-center justify-center gap-2 font-semibold transition', sizes[size], VARIANTS[variant], block && 'w-full', className)}
      {...rest}
    >
      {children}
    </button>
  )
}

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label} className={cx('inline-flex size-11 items-center justify-center rounded-full text-ink active:bg-sunken', className)} {...rest}>
      {children}
    </button>
  )
}

export function Card({ className, children, onClick }: { className?: string; children: ReactNode; onClick?: () => void }) {
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cx('block w-full rounded-3xl bg-surface p-4 text-left active:opacity-80', className)}>
        {children}
      </button>
    )
  return <div className={cx('rounded-3xl bg-surface p-4', className)}>{children}</div>
}

export function Screen({
  title,
  subtitle,
  back,
  actions,
  children,
  className,
  bottomPad = true,
}: {
  title?: ReactNode
  subtitle?: ReactNode
  back?: boolean | string
  actions?: ReactNode
  children: ReactNode
  className?: string
  bottomPad?: boolean
}) {
  const navigate = useNavigate()
  return (
    <div className={cx('mx-auto min-h-dvh w-full max-w-xl', bottomPad && 'pb-[calc(env(safe-area-inset-bottom)+6rem)]')}>
      {(title || back || actions) && (
        <header className="sticky top-0 z-20 bg-canvas/90 px-2 pt-[env(safe-area-inset-top)] backdrop-blur-md">
          <div className="flex min-h-14 items-center gap-1">
            {back ? (
              <IconButton label="Back" onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))}>
                <IconChevronLeft />
              </IconButton>
            ) : (
              <span className="w-2" />
            )}
            <div className="min-w-0 flex-1">
              {title && <h1 className="truncate text-xl font-bold tracking-tight">{title}</h1>}
              {subtitle && <p className="truncate text-sm text-muted">{subtitle}</p>}
            </div>
            {actions && <div className="flex items-center gap-1">{actions}</div>}
          </div>
        </header>
      )}
      <main className={cx('px-4', className)}>{children}</main>
    </div>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex items-end justify-between px-1">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">{children}</h2>
      {action}
    </div>
  )
}

export function ListRow({
  title,
  subtitle,
  detail,
  icon,
  onClick,
  chevron = !!onClick,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  detail?: ReactNode
  icon?: ReactNode
  onClick?: () => void
  chevron?: boolean
  className?: string
}) {
  const inner = (
    <>
      {icon && <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sunken text-muted">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{title}</span>
        {subtitle && <span className="block truncate text-sm text-muted">{subtitle}</span>}
      </span>
      {detail != null && <span className="shrink-0 text-right text-sm tabular-nums text-muted">{detail}</span>}
      {chevron && <IconChevronRight size={18} className="shrink-0 text-faint" />}
    </>
  )
  const cls = cx('flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left', className)
  return onClick ? (
    <button type="button" onClick={onClick} className={cx(cls, 'active:bg-sunken')}>
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  )
}

/** A rounded group of rows separated by hairlines. */
export function Group({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('divide-y divide-line overflow-hidden rounded-3xl bg-surface', className)}>{children}</div>
}

/**
 * A labelled field. With one input inside, a <label> ties the text to it. With a
 * group of buttons (`group`), a labelled role="group" is used instead, because a
 * <label> would hand its text to the first button as that button's name.
 */
export function Field({ label, hint, error, children, group }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode; group?: boolean }) {
  const id = useId()
  const foot = error ? <span className="mt-1 block text-sm text-danger">{error}</span> : hint ? <span className="mt-1 block text-sm text-faint">{hint}</span> : null
  if (group)
    return (
      <div role="group" aria-labelledby={id} className="block">
        <span id={id} className="mb-1.5 block text-sm font-medium text-muted">
          {label}
        </span>
        {children}
        {foot}
      </div>
    )
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-muted">{label}</span>
      {children}
      {foot}
    </label>
  )
}

const inputCls = 'min-h-12 w-full rounded-2xl border border-transparent bg-sunken px-4 text-ink outline-none placeholder:text-faint focus:border-accent'

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(inputCls, className)} {...rest} />
}

/**
 * A number field that keeps what is typed (including a trailing comma) and reports a
 * parsed number, or null while empty or invalid. Opens the decimal keypad.
 */
export function NumberInput({
  value,
  onChange,
  unit,
  integer,
  placeholder,
  className,
  autoFocus,
  ariaLabel,
  onEnter,
  selectOnFocus = true,
}: {
  value: number | null | undefined
  onChange: (n: number | null) => void
  unit?: string
  integer?: boolean
  placeholder?: string
  className?: string
  autoFocus?: boolean
  ariaLabel?: string
  onEnter?: () => void
  selectOnFocus?: boolean
}) {
  const [text, setText] = useState(value == null ? '' : fmt2(value))
  const last = useRef(value)
  useEffect(() => {
    // follow outside changes, but not the echo of our own typing
    if (value !== last.current) {
      last.current = value
      const parsed = parseDecimal(text)
      if (parsed !== value) setText(value == null ? '' : fmt2(value))
    }
  }, [value, text])
  return (
    <div className={cx('relative', className)}>
      <input
        type="text"
        inputMode={integer ? 'numeric' : 'decimal'}
        pattern={integer ? '[0-9]*' : undefined}
        autoComplete="off"
        aria-label={ariaLabel}
        placeholder={placeholder}
        autoFocus={autoFocus}
        value={text}
        onFocus={(e) => selectOnFocus && e.currentTarget.select()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onEnter) {
            e.preventDefault()
            onEnter()
          }
        }}
        onChange={(e) => {
          const t = e.target.value
          if (!/^[\d.,\s-]*$/.test(t)) return
          setText(t)
          const n = parseDecimal(t)
          const out = n == null ? null : integer ? Math.round(n) : n
          last.current = out
          onChange(out)
        }}
        className={cx(inputCls, 'tabular-nums', unit && 'pr-14')}
      />
      {unit && <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-muted">{unit}</span>}
    </div>
  )
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  className,
  size = 'md',
}: {
  value: T
  options: readonly { value: T; label: ReactNode }[]
  onChange: (v: T) => void
  className?: string
  size?: 'sm' | 'md'
}) {
  return (
    <div role="radiogroup" className={cx('flex rounded-2xl bg-sunken p-1', className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            'flex-1 rounded-xl px-2 font-semibold transition',
            size === 'sm' ? 'min-h-9 text-sm' : 'min-h-10 text-[15px]',
            o.value === value ? 'bg-surface text-ink shadow-sm' : 'text-muted',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode; disabled?: boolean }) {
  const id = useId()
  return (
    <div className={cx('flex min-h-14 items-center gap-3 px-4 py-2', disabled && 'opacity-50')}>
      <label htmlFor={id} className="min-w-0 flex-1">
        <span className="block font-medium">{label}</span>
        {hint && <span className="block text-sm text-muted">{hint}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx('relative h-8 w-13 shrink-0 rounded-full transition', checked ? 'bg-accent' : 'bg-line')}
      >
        <span className={cx('absolute top-1 size-6 rounded-full bg-white shadow transition-all', checked ? 'left-6' : 'left-1')} />
      </button>
    </div>
  )
}

export function Chip({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx('min-h-9 shrink-0 rounded-full px-4 text-sm font-semibold transition', active ? 'bg-ink text-canvas' : 'bg-surface text-ink active:bg-sunken')}
    >
      {children}
    </button>
  )
}

export function Notice({ tone = 'info', children, className }: { tone?: 'info' | 'warn' | 'danger' | 'ok'; children: ReactNode; className?: string }) {
  const tones = {
    info: 'bg-sunken text-ink',
    warn: 'bg-warn-soft text-warn',
    danger: 'bg-danger-soft text-danger',
    ok: 'bg-accent-soft text-accent',
  }
  return <div className={cx('rounded-2xl px-4 py-3 text-sm leading-relaxed', tones[tone], className)}>{children}</div>
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      {icon && <div className="mb-3 text-faint">{icon}</div>}
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </div>
  )
}

/** A bottom sheet. Closes on the backdrop, the close button and Escape. */
export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close" className="animate-fade absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="animate-sheet relative flex max-h-[92dvh] w-full max-w-xl flex-col rounded-t-[28px] bg-surface pb-[env(safe-area-inset-bottom)] text-ink shadow-2xl">
        <div className="flex items-center gap-2 px-4 pb-1 pt-3">
          <div className="min-w-0 flex-1 text-lg font-bold">{title}</div>
          <IconButton label="Close" onClick={onClose} className="-mr-1">
            <IconX />
          </IconButton>
        </div>
        <div className="overflow-y-auto overscroll-contain px-4 pb-4">{children}</div>
        {footer && <div className="border-t border-line px-4 pb-3 pt-3">{footer}</div>}
      </div>
    </div>
  )
}

/** A thin horizontal bar: value against a target, overflowing in the warning colour. */
export function MacroBar({ label, value, target, color, unit = 'g' }: { label: string; value: number; target: number; color: string; unit?: string }) {
  const pct = target > 0 ? Math.min(1, value / target) : 0
  const over = target > 0 && value > target * 1.05
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className={cx('tabular-nums', over ? 'text-warn' : 'text-muted')}>
          <span className="font-semibold text-ink">{Math.round(value)}</span> / {Math.round(target)} {unit}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-sunken">
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct * 100}%`, background: over ? 'var(--warn)' : color }} />
      </div>
    </div>
  )
}

/** The calories-remaining ring. */
export function Ring({ fraction, size = 168, stroke = 14, children, over }: { fraction: number; size?: number; stroke?: number; children?: ReactNode; over?: boolean }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const f = Math.max(0, Math.min(1, fraction))
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--sunken)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={over ? 'var(--warn)' : 'var(--accent)'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - f)}
          style={{ transition: 'stroke-dashoffset 600ms ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  )
}

export function Stepper({ value, onChange, step = 1, min = 0, format = (n: number) => String(n) }: { value: number; onChange: (n: number) => void; step?: number; min?: number; format?: (n: number) => string }) {
  return (
    <div className="flex items-center gap-1 rounded-2xl bg-sunken p-1">
      <button type="button" aria-label="Less" className="size-10 rounded-xl text-xl font-semibold active:bg-surface" onClick={() => onChange(Math.max(min, Math.round((value - step) * 100) / 100))}>
        −
      </button>
      <span className="min-w-12 text-center font-semibold tabular-nums">{format(value)}</span>
      <button type="button" aria-label="More" className="size-10 rounded-xl text-xl font-semibold active:bg-surface" onClick={() => onChange(Math.round((value + step) * 100) / 100)}>
        +
      </button>
    </div>
  )
}

export function Dots({ count, active }: { count: number; active: number }) {
  return (
    <div className="flex justify-center gap-1.5" aria-label={`Step ${active + 1} of ${count}`}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className={cx('h-1.5 rounded-full transition-all', i === active ? 'w-6 bg-accent' : 'w-1.5 bg-line')} />
      ))}
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cx('inline-block size-5 animate-spin rounded-full border-2 border-current border-r-transparent', className)} aria-label="Loading" />
}
