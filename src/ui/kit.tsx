// UI building blocks. Tap targets are at least 44 points, number fields open the
// numeric keypad, motion respects "reduce motion", and only sheets cover the screen.

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { fmt2, fmtInt, parseDecimal } from '../lib/format'
import { IconAlert, IconCheckCircle, IconChevronLeft, IconChevronRight, IconInfo, IconX } from './icons'
import { useAnimatedNumber } from './motion'

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ')

export type Tone = 'brand' | 'food' | 'train' | 'body' | 'neutral'

// ---- buttons ----------------------------------------------------------------------

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'glass' | 'ink'

const VARIANTS: Record<Variant, string> = {
  primary: 'btn-primary disabled:opacity-40 disabled:saturate-50',
  secondary: 'bg-fill text-ink disabled:opacity-40',
  ghost: 'text-brand-ink disabled:opacity-40',
  danger: 'bg-danger-soft text-danger disabled:opacity-40',
  outline: 'border border-line text-ink disabled:opacity-40',
  glass: 'glass text-ink disabled:opacity-40',
  ink: 'bg-ink text-page disabled:opacity-40',
}

export function Button({
  variant = 'primary',
  size = 'md',
  block,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; block?: boolean }) {
  const sizes = { sm: 'min-h-9 px-3.5 text-[14px]', md: 'min-h-11 px-5 text-[15px]', lg: 'min-h-14 px-6 text-[17px]' }
  return (
    <button
      type="button"
      className={cx('press inline-flex items-center justify-center gap-2 rounded-full font-semibold', sizes[size], VARIANTS[variant], block && 'w-full', className)}
      {...rest}
    >
      {children}
    </button>
  )
}

export function IconButton({
  label,
  className,
  children,
  variant = 'plain',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; variant?: 'plain' | 'glass' | 'fill' }) {
  const v = { plain: 'text-ink active:bg-fill', glass: 'glass text-ink shadow-float', fill: 'bg-fill text-ink' }[variant]
  return (
    <button type="button" aria-label={label} title={label} className={cx('press inline-flex size-11 shrink-0 items-center justify-center rounded-full', v, className)} {...rest}>
      {children}
    </button>
  )
}

// ---- surfaces -----------------------------------------------------------------------

export function Card({
  className,
  children,
  onClick,
  tone,
  style,
}: {
  className?: string
  children: ReactNode
  onClick?: () => void
  tone?: Tone
  style?: CSSProperties
}) {
  const cls = cx('card relative overflow-hidden p-5', tone && `tone-${tone} tinted`, className)
  if (onClick)
    return (
      <button type="button" onClick={onClick} style={style} className={cx(cls, 'press block w-full text-left')}>
        {children}
      </button>
    )
  return (
    <div className={cls} style={style}>
      {children}
    </div>
  )
}

const TONE_VAR: Record<string, string> = {
  brand: 'var(--brand)',
  food: 'var(--food)',
  train: 'var(--train)',
  body: 'var(--body)',
  amber: 'var(--amber)',
  pink: 'var(--pink)',
  indigo: 'var(--indigo)',
  slate: 'var(--slate)',
  protein: 'var(--protein)',
  danger: 'var(--danger)',
}

export type IconTone = keyof typeof TONE_VAR

/** A coloured rounded square holding a white glyph, like iOS Settings. */
export function IconTile({ tone = 'slate', size = 32, children, className }: { tone?: IconTone; size?: number; children: ReactNode; className?: string }) {
  const bg = TONE_VAR[tone]
  return (
    <span
      className={cx('inline-flex shrink-0 items-center justify-center text-white', className)}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        background: `linear-gradient(160deg, color-mix(in oklab, ${bg} 78%, white), ${bg})`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.25)`,
      }}
    >
      {children}
    </span>
  )
}

/**
 * A screen. Tab roots get an iOS large title that hands over to a compact glass bar
 * on scroll; pushed screens (with `back`) get the compact bar from the start.
 */
export function Screen({
  title,
  eyebrow,
  subtitle,
  back,
  actions,
  children,
  className,
  tone = 'neutral',
  large,
  bottomPad = true,
}: {
  title?: ReactNode
  eyebrow?: ReactNode
  subtitle?: ReactNode
  back?: boolean | string
  actions?: ReactNode
  children: ReactNode
  className?: string
  tone?: Tone
  large?: boolean
  bottomPad?: boolean
}) {
  const navigate = useNavigate()
  const isLarge = large ?? !back
  const sentinel = useRef<HTMLDivElement>(null)
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const el = sentinel.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setScrolled(!e.isIntersecting), { rootMargin: '-60px 0px 0px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  const showBar = !isLarge || scrolled
  return (
    <div className={cx(`tone-${tone}`, 'relative mx-auto min-h-dvh w-full max-w-xl', bottomPad && 'pb-[calc(env(safe-area-inset-bottom)+7.5rem)]')}>
      <div aria-hidden className="ambient pointer-events-none fixed inset-x-0 top-0 -z-10 mx-auto h-[70vh] max-w-xl" />
      <header
        className={cx(
          'sticky top-0 z-20 px-2 pt-[env(safe-area-inset-top)] transition-[background-color,border-color,backdrop-filter] duration-300',
          showBar && scrolled ? 'border-b border-line bg-page/70 backdrop-blur-xl backdrop-saturate-150' : 'border-b border-transparent',
        )}
      >
        <div className="flex min-h-13 items-center gap-1">
          {back ? (
            <IconButton label="Back" onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))}>
              <IconChevronLeft />
            </IconButton>
          ) : (
            <span className="w-3" />
          )}
          <div className={cx('min-w-0 flex-1 transition-opacity duration-200', showBar ? 'opacity-100' : 'opacity-0')} aria-hidden={isLarge ? true : undefined}>
            {title && <p className="truncate text-headline">{title}</p>}
            {!isLarge && subtitle && <p className="truncate text-footnote text-ink-2">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-1 pr-1">{actions}</div>}
        </div>
      </header>
      {isLarge && (title || eyebrow) && (
        <div className="px-5 pb-2 pt-1">
          {eyebrow && <p className="text-footnote font-semibold text-ink-2">{eyebrow}</p>}
          {title && <h1 className="text-title">{title}</h1>}
          {subtitle && <p className="mt-1 text-[15px] text-ink-2">{subtitle}</p>}
        </div>
      )}
      <div ref={sentinel} aria-hidden className="h-px" />
      <main className={cx('px-4', className)}>{children}</main>
    </div>
  )
}

export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx('mb-2.5 mt-7 flex items-end justify-between gap-2 px-1', className)}>
      <h2 className="text-[20px] font-bold tracking-tight">{children}</h2>
      {action}
    </div>
  )
}

export function ListRow({
  title,
  subtitle,
  detail,
  icon,
  iconTone,
  onClick,
  chevron = !!onClick,
  className,
  destructive,
}: {
  title: ReactNode
  subtitle?: ReactNode
  detail?: ReactNode
  icon?: ReactNode
  iconTone?: IconTone
  onClick?: () => void
  chevron?: boolean
  className?: string
  destructive?: boolean
}) {
  const inner = (
    <>
      {icon &&
        (iconTone ? (
          <IconTile tone={iconTone}>{icon}</IconTile>
        ) : (
          <span className="flex size-8 shrink-0 items-center justify-center text-ink-2">{icon}</span>
        ))}
      <span className="min-w-0 flex-1 py-0.5">
        <span className={cx('block truncate text-[16px] font-medium', destructive && 'text-danger')}>{title}</span>
        {subtitle && <span className="block truncate text-[14px] text-ink-2">{subtitle}</span>}
      </span>
      {detail != null && <span className="shrink-0 text-right text-[15px] text-ink-2">{detail}</span>}
      {chevron && <IconChevronRight size={17} className="shrink-0 text-ink-3" />}
    </>
  )
  const cls = cx('relative flex min-h-[58px] w-full items-center gap-3 px-4 py-2 text-left', className)
  return onClick ? (
    <button type="button" onClick={onClick} className={cx(cls, 'transition-colors active:bg-fill')}>
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  )
}

/** An inset group of rows with hairlines between them. */
export function Group({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('card divide-y divide-line overflow-hidden !p-0', className)}>{children}</div>
}

// ---- form controls ------------------------------------------------------------------

/**
 * A labelled field. With one input inside, a <label> ties the text to it. With a
 * group of buttons (`group`), a labelled role="group" is used instead, because a
 * <label> would hand its text to the first button as that button's name.
 */
export function Field({ label, hint, error, children, group }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode; group?: boolean }) {
  const id = useId()
  const foot = error ? <span className="mt-1.5 block px-1 text-[13px] font-medium text-danger">{error}</span> : hint ? <span className="mt-1.5 block px-1 text-[13px] text-ink-3">{hint}</span> : null
  const head = 'mb-1.5 block px-1 text-[13px] font-semibold text-ink-2'
  if (group)
    return (
      <div role="group" aria-labelledby={id} className="block">
        <span id={id} className={head}>
          {label}
        </span>
        {children}
        {foot}
      </div>
    )
  return (
    <label className="block">
      <span className={head}>{label}</span>
      {children}
      {foot}
    </label>
  )
}

const inputCls =
  'min-h-[52px] w-full rounded-2xl border border-transparent bg-fill px-4 text-ink outline-none transition-[border-color,box-shadow] placeholder:text-ink-3 focus:border-brand focus:shadow-[0_0_0_4px_var(--brand-soft)]'

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
  inputClassName,
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
  inputClassName?: string
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
        className={cx(inputCls, 'tabular-nums', unit && 'pr-14', inputClassName)}
      />
      {unit && <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-[15px] font-medium text-ink-3">{unit}</span>}
    </div>
  )
}

/** A segmented control whose thumb slides to the chosen option. */
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
  const index = options.findIndex((o) => o.value === value)
  const n = options.length
  return (
    <div role="radiogroup" className={cx('relative flex rounded-full bg-fill p-1', className)}>
      {index >= 0 && (
        <span
          aria-hidden
          className="absolute bottom-1 top-1 rounded-full bg-surface shadow-[0_2px_8px_-2px_rgba(0,0,0,0.18)] transition-transform duration-300 ease-[var(--ease-spring)] dark:bg-raised"
          style={{ left: 4, width: `calc((100% - 8px) / ${n})`, transform: `translateX(${index * 100}%)` }}
        />
      )}
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            'relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 font-semibold transition-colors',
            size === 'sm' ? 'min-h-9 text-[14px]' : 'min-h-10 text-[15px]',
            o.value === value ? 'text-ink' : 'text-ink-2',
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
    <div className={cx('flex min-h-[58px] items-center gap-3 px-4 py-2', disabled && 'opacity-50')}>
      <label htmlFor={id} className="min-w-0 flex-1">
        <span className="block text-[16px] font-medium">{label}</span>
        {hint && <span className="block text-[14px] text-ink-2">{hint}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx('relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200', checked ? 'bg-brand' : 'bg-fill-strong')}
      >
        <span className={cx('absolute top-[2px] size-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.15)] transition-all duration-300 ease-[var(--ease-spring)]', checked ? 'left-[22px]' : 'left-[2px]')} />
      </button>
    </div>
  )
}

export function Chip({ active, onClick, children, className }: { active?: boolean; onClick?: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'press inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[14px] font-semibold',
        active ? 'bg-ink text-page' : 'card !rounded-full text-ink',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function Notice({ tone = 'info', children, className }: { tone?: 'info' | 'warn' | 'danger' | 'ok'; children: ReactNode; className?: string }) {
  const tones = {
    info: 'bg-fill text-ink',
    warn: 'bg-warn-soft text-warn-ink',
    danger: 'bg-danger-soft text-danger',
    ok: 'bg-brand-soft text-brand-ink',
  }
  const Icon = tone === 'ok' ? IconCheckCircle : tone === 'info' ? IconInfo : IconAlert
  return (
    <div className={cx('flex gap-3 rounded-2xl px-4 py-3 text-[14px] leading-relaxed', tones[tone], className)}>
      <Icon size={18} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      {icon && <div className="mb-4 flex size-16 items-center justify-center rounded-[22px] bg-fill text-ink-2">{icon}</div>}
      <p className="text-headline">{title}</p>
      {children && <div className="mt-1.5 max-w-xs text-[15px] text-ink-2">{children}</div>}
    </div>
  )
}

/** A bottom sheet. Closes on the backdrop, the close button, Escape, or a drag down. */
export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const [drag, setDrag] = useState(0)
  const start = useRef<{ y: number; t: number } | null>(null)
  useEffect(() => {
    if (!open) return
    setDrag(0)
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
  const down = (e: ReactPointerEvent) => {
    start.current = { y: e.clientY, t: performance.now() }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const move = (e: ReactPointerEvent) => {
    if (start.current) setDrag(Math.max(0, e.clientY - start.current.y))
  }
  const up = (e: ReactPointerEvent) => {
    if (!start.current) return
    const dy = e.clientY - start.current.y
    const v = dy / Math.max(1, performance.now() - start.current.t)
    start.current = null
    if (dy > 110 || v > 0.6) onClose()
    else setDrag(0)
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close" className="animate-fade absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className="animate-sheet relative flex max-h-[92dvh] w-full max-w-xl flex-col rounded-t-[32px] bg-surface pb-[env(safe-area-inset-bottom)] text-ink shadow-float"
        style={{ transform: drag ? `translateY(${drag}px)` : undefined, transition: drag ? 'none' : 'transform 260ms var(--ease-spring)' }}
      >
        <div className="touch-none cursor-grab select-none" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-fill-strong" />
          <div className="flex items-center gap-2 px-5 pb-1 pt-2">
            <div className="min-w-0 flex-1 text-[19px] font-bold tracking-tight">{title}</div>
            <IconButton label="Close" variant="fill" className="-mr-1 size-9" onClick={onClose} onPointerDown={(e) => e.stopPropagation()}>
              <IconX size={18} />
            </IconButton>
          </div>
        </div>
        <div className="overflow-y-auto overscroll-contain px-5 pb-5 pt-1">{children}</div>
        {footer && <div className="border-t border-line px-5 pb-3 pt-3">{footer}</div>}
      </div>
    </div>
  )
}

// ---- figures ----------------------------------------------------------------------

/**
 * A meter: the fill shows progress toward a target; the unfilled track is a lighter
 * step of the same colour. Over target, the fill switches to the warning colour and
 * an "over" label appears, so the state never rests on colour alone.
 */
export function MacroBar({ label, value, target, color, track, unit = 'g', compact }: { label: string; value: number; target: number; color: string; track?: string; unit?: string; compact?: boolean }) {
  const pct = target > 0 ? Math.min(1, value / target) : 0
  const over = target > 0 && value > target * 1.05
  const bar = (
    <div className={cx('overflow-hidden rounded-full', compact ? 'h-1.5' : 'h-2')} style={{ background: over ? 'var(--warn-soft)' : (track ?? 'var(--fill)') }}>
      <div className="h-full rounded-full transition-[width] duration-700 ease-[var(--ease-out)]" style={{ width: `${pct * 100}%`, background: over ? 'var(--warn)' : color }} />
    </div>
  )
  const overTag = over && <span className="ml-1 rounded-full bg-warn-soft px-1.5 py-px text-[10px] font-bold uppercase text-warn-ink">over</span>
  if (compact)
    // stacked for narrow columns: name, then amount, then the meter
    return (
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-[13px] font-semibold">
          <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />
          <span className="truncate">{label}</span>
        </div>
        <div className="mb-1.5 mt-0.5 truncate text-[13px] text-ink-2">
          <span className="text-[15px] font-bold text-ink">{fmtInt(value)}</span> / {fmtInt(target)} {unit}
          {overTag}
        </div>
        {bar}
      </div>
    )
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[14px]">
        <span className="flex items-center gap-1.5 font-semibold">
          <span className="size-2 rounded-full" style={{ background: color }} />
          {label}
        </span>
        <span className="text-ink-2">
          <span className="font-semibold text-ink">{fmtInt(value)}</span> / {fmtInt(target)} {unit}
          {overTag}
        </span>
      </div>
      {bar}
    </div>
  )
}

/** The calories ring: a gradient arc over a tinted track. */
export function Ring({
  fraction,
  size = 176,
  stroke = 16,
  children,
  over,
  from = 'var(--btn-from)',
  to = 'var(--brand)',
  track = 'var(--brand-track)',
}: {
  fraction: number
  size?: number
  stroke?: number
  children?: ReactNode
  over?: boolean
  from?: string
  to?: string
  track?: string
}) {
  const id = useId().replace(/:/g, '')
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const f = Math.max(0, Math.min(1, fraction))
  const [drawn, setDrawn] = useState(0)
  useLayoutEffect(() => {
    const t = requestAnimationFrame(() => setDrawn(f))
    return () => cancelAnimationFrame(t)
  }, [f])
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <defs>
          <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={over ? 'var(--warn)' : from} />
            <stop offset="100%" stopColor={over ? 'var(--warn)' : to} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={over ? 'var(--warn-soft)' : track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#g${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - drawn)}
          style={{ transition: 'stroke-dashoffset 900ms var(--ease-out)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  )
}

/** A number that counts toward its value. Proportional figures, as hero numbers should be. */
export function AnimatedNumber({ value, format = fmtInt, className }: { value: number; format?: (n: number) => string; className?: string }) {
  const v = useAnimatedNumber(value)
  return <span className={className}>{format(v)}</span>
}

/** A tiny trend line: 2 px stroke, an end dot with a surface ring, no axes. */
export function Sparkline({ values, color = 'var(--body)', width = 120, height = 36, className }: { values: number[]; color?: string; width?: number; height?: number; className?: string }) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pad = 5
  const pts = values.map((v, i) => [pad + (i / (values.length - 1)) * (width - 2 * pad), pad + (1 - (v - min) / span) * (height - 2 * pad)] as const)
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const [ex, ey] = pts[pts.length - 1]
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden>
      <path d={`${d} L${ex} ${height} L${pts[0][0]} ${height} Z`} fill={color} opacity={0.1} />
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={ex} cy={ey} r={4} fill={color} stroke="var(--surface)" strokeWidth={2} />
    </svg>
  )
}

export function Stepper({ value, onChange, step = 1, min = 0, format = (n: number) => String(n) }: { value: number; onChange: (n: number) => void; step?: number; min?: number; format?: (n: number) => string }) {
  return (
    <div className="flex items-center gap-1 rounded-full bg-fill p-1">
      <button type="button" aria-label="Less" className="press size-10 rounded-full text-xl font-semibold active:bg-surface" onClick={() => onChange(Math.max(min, Math.round((value - step) * 100) / 100))}>
        −
      </button>
      <span className="min-w-12 text-center font-semibold tabular-nums">{format(value)}</span>
      <button type="button" aria-label="More" className="press size-10 rounded-full text-xl font-semibold active:bg-surface" onClick={() => onChange(Math.round((value + step) * 100) / 100)}>
        +
      </button>
    </div>
  )
}

export function Dots({ count, active }: { count: number; active: number }) {
  return (
    <div className="flex justify-center gap-1.5" aria-label={`Step ${active + 1} of ${count}`}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className={cx('h-1.5 rounded-full transition-all duration-300', i === active ? 'w-7 bg-brand' : i < active ? 'w-1.5 bg-brand/50' : 'w-1.5 bg-fill-strong')} />
      ))}
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cx('inline-block size-5 animate-spin rounded-full border-2 border-current border-r-transparent', className)} aria-label="Loading" />
}

// ---- swipe actions ------------------------------------------------------------------

export interface SwipeAction {
  label: string
  icon: ReactNode
  tone: 'danger' | 'neutral' | 'brand'
  onClick: () => void
}

/**
 * A row that slides left to reveal actions. Vertical scrolling stays native; a tap
 * (no slide) runs `onTap`. Actions are also reachable from the row's own sheet, so
 * swiping is a shortcut, never the only way.
 */
export function SwipeRow({ children, actions, onTap, className }: { children: ReactNode; actions: SwipeAction[]; onTap?: () => void; className?: string }) {
  const width = actions.length * 76
  const [x, setX] = useState(0)
  const st = useRef<{ x0: number; y0: number; base: number; mode: 'idle' | 'h' | 'v' } | null>(null)
  const moved = useRef(false)
  const down = (e: ReactPointerEvent) => {
    st.current = { x0: e.clientX, y0: e.clientY, base: x, mode: 'idle' }
    moved.current = false
  }
  const move = (e: ReactPointerEvent) => {
    const s = st.current
    if (!s) return
    const dx = e.clientX - s.x0
    const dy = e.clientY - s.y0
    if (s.mode === 'idle') {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        s.mode = 'h'
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      } else if (Math.abs(dy) > 8) s.mode = 'v'
    }
    if (s.mode === 'h') {
      moved.current = true
      setX(Math.min(0, Math.max(-width - 24, s.base + dx)))
    }
  }
  const up = () => {
    const s = st.current
    st.current = null
    if (!s || s.mode !== 'h') return
    setX((cur) => (cur < -width / 2 ? -width : 0))
  }
  return (
    <div className={cx('relative overflow-hidden', className)}>
      <div className="absolute inset-y-0 right-0 flex" style={{ width }} aria-hidden={x === 0}>
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            tabIndex={x === 0 ? -1 : 0}
            onClick={() => {
              setX(0)
              a.onClick()
            }}
            className={cx(
              'flex flex-1 flex-col items-center justify-center gap-1 text-[12px] font-semibold text-white',
              a.tone === 'danger' ? 'bg-[var(--danger)]' : a.tone === 'brand' ? 'bg-[var(--body)]' : 'bg-[var(--slate)]',
            )}
          >
            {a.icon}
            {a.label}
          </button>
        ))}
      </div>
      <div
        className="relative bg-surface"
        style={{ transform: `translateX(${x}px)`, transition: st.current?.mode === 'h' ? 'none' : 'transform 280ms var(--ease-spring)', touchAction: 'pan-y' }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onClick={() => {
          // a slide, or a tap on an open row, only closes it
          if (moved.current || x !== 0) {
            moved.current = false
            setX(0)
            return
          }
          onTap?.()
        }}
      >
        {children}
      </div>
    </div>
  )
}
