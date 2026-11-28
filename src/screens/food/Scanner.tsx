// Barcode to product: camera preview with a framing box → decoder → local foods
// first (a product scanned once works offline) → Open Food Facts on a miss →
// confirmation card → portion screen. Unknown products go to "add from label".

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { Food, Meal } from '../../db'
import { detectBarcode, detectInFile } from '../../adapters/barcode'
import { fetchProduct } from '../../adapters/openFoodFacts'
import { useToday } from '../../hooks'
import { normalizeBarcode } from '../../lib/barcode'
import { fmt1, fmt2, fmtInt } from '../../lib/format'
import { checkEnergy } from '../../lib/macros'
import { mealForNow } from '../../store/diary'
import { findByBarcode, saveFood, type NewFood } from '../../store/foods'
import { IconBolt, IconCamera, IconKeyboard, IconWarn, IconX } from '../../ui/icons'
import { Button, cx, Sheet, Spinner, TextInput } from '../../ui/kit'
import { useToast } from '../../ui/toast'
import { PortionSheet } from './PortionSheet'

type Phase =
  | { kind: 'starting' }
  | { kind: 'scanning' }
  | { kind: 'noCamera'; reason: string }
  | { kind: 'lookup'; code: string }
  | { kind: 'product'; food: NewFood }
  | { kind: 'portion'; food: Food }
  | { kind: 'notFound'; code: string; name?: string; brand?: string }
  | { kind: 'error'; code: string; message: string }

export default function Scanner() {
  const navigate = useNavigate()
  const toast = useToast()
  const today = useToday()
  const [params] = useSearchParams()
  const meal = (params.get('meal') as Meal | null) ?? mealForNow()
  const date = params.get('d') ?? today
  const diary = `/food${date !== today ? `?d=${date}` : ''}`

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<number | undefined>(undefined)
  const scanning = useRef(false)
  const [phase, setPhase] = useState<Phase>({ kind: 'starting' })
  const [torch, setTorch] = useState({ supported: false, on: false })
  const [manualOpen, setManualOpen] = useState(false)
  const [manualCode, setManualCode] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const stopCamera = useCallback(() => {
    scanning.current = false
    window.clearTimeout(timerRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const lookup = useCallback(
    async (code: string) => {
      stopCamera()
      setPhase({ kind: 'lookup', code })
      const local = await findByBarcode(code)
      if (local) {
        setPhase({ kind: 'portion', food: local })
        return
      }
      const res = await fetchProduct(code)
      if (res.status === 'found') setPhase({ kind: 'product', food: res.food })
      else if (res.status === 'incomplete') setPhase({ kind: 'notFound', code, name: res.partial.name, brand: res.partial.brand })
      else if (res.status === 'notFound') setPhase({ kind: 'notFound', code })
      else setPhase({ kind: 'error', code, message: res.message })
    },
    [stopCamera],
  )

  /** Decodes only the framing box: faster, and fewer stray reads from the edges. */
  const scanFrame = useCallback(async function scan(): Promise<void> {
    const video = videoRef.current
    if (!video || !scanning.current) return
    if (video.readyState >= 2 && video.videoWidth > 0) {
      const vw = video.videoWidth
      const vh = video.videoHeight
      const w = Math.round(vw * 0.8)
      const h = Math.round(Math.min(vw * 0.45, vh * 0.6))
      const scale = Math.min(1, 960 / w)
      canvasRef.current ??= document.createElement('canvas')
      const canvas = canvasRef.current
      canvas.width = Math.round(w * scale)
      canvas.height = Math.round(h * scale)
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      ctx?.drawImage(video, (vw - w) / 2, (vh - h) / 2, w, h, 0, 0, canvas.width, canvas.height)
      try {
        const found = await detectBarcode(canvas)
        if (found && scanning.current) {
          void lookup(found.code)
          return
        }
      } catch {
        // a frame that fails to decode is simply skipped
      }
    }
    if (scanning.current) timerRef.current = window.setTimeout(() => void scan(), 120)
  }, [lookup])

  const startCamera = useCallback(
    async (isCancelled: () => boolean) => {
      setPhase({ kind: 'starting' })
      if (!navigator.mediaDevices?.getUserMedia) {
        setPhase({
          kind: 'noCamera',
          reason: window.isSecureContext ? 'Dieser Browser gibt keinen Kamerazugriff.' : 'Die Live-Kamera geht nur über die https://-Adresse der App.',
        })
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
        if (isCancelled()) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play().catch(() => undefined)
        const caps = stream.getVideoTracks()[0]?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined
        setTorch({ supported: !!caps?.torch, on: false })
        setPhase({ kind: 'scanning' })
        scanning.current = true
        void scanFrame()
      } catch (e) {
        const name = (e as Error).name
        setPhase({
          kind: 'noCamera',
          reason: name === 'NotAllowedError' ? 'Kamerazugriff abgelehnt. Erlaube ihn in den iPhone-Einstellungen oder mach stattdessen ein Foto.' : 'Die Kamera ließ sich nicht starten.',
        })
      }
    },
    [scanFrame],
  )

  useEffect(() => {
    let cancelled = false
    void startCamera(() => cancelled)
    return () => {
      cancelled = true
      stopCamera()
    }
  }, [startCamera, stopCamera])

  const restart = () => void startCamera(() => false)

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    const on = !torch.on
    try {
      await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] })
      setTorch({ supported: true, on })
    } catch {
      setTorch({ supported: false, on: false })
    }
  }

  const fromPhoto = async (file: File | undefined) => {
    if (!file) return
    stopCamera()
    setPhase({ kind: 'lookup', code: '' })
    const found = await detectInFile(file).catch(() => null)
    if (found) void lookup(found.code)
    else {
      toast({ message: 'Kein Barcode im Foto gefunden. Näher ran, gerade halten, gutes Licht.' })
      setPhase({ kind: 'noCamera', reason: 'Neues Foto machen oder den Code eintippen.' })
    }
  }

  const submitManual = () => {
    const code = normalizeBarcode(manualCode)
    if (!code) return
    setManualOpen(false)
    setManualCode('')
    void lookup(code)
  }

  const confirmProduct = async (food: NewFood) => {
    const saved = await saveFood(food)
    setPhase({ kind: 'portion', food: saved })
  }

  const labelForm = (code: string, name?: string, brand?: string) => {
    const q = new URLSearchParams({ meal, barcode: code, ...(date !== today ? { d: date } : {}), ...(name ? { name } : {}), ...(brand ? { brand } : {}) })
    navigate(`/food/new?${q}`, { replace: true })
  }

  const product = phase.kind === 'product' ? phase.food : null
  const energy = product ? checkEnergy(product.per100) : null
  const manualValid = !!normalizeBarcode(manualCode)

  return (
    <div className="fixed inset-0 z-40 bg-black text-white">
      <video ref={videoRef} playsInline muted autoPlay className={cx('absolute inset-0 size-full object-cover', phase.kind !== 'scanning' && 'opacity-30')} />

      {/* framing box: everything outside it is dimmed; corner brackets mark the target */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="relative aspect-[16/9] w-[80%] max-w-md rounded-[28px] shadow-[0_0_0_200vmax_rgba(0,0,0,0.55)]">
          {(['left-0 top-0 border-l-[3px] border-t-[3px] rounded-tl-[28px]', 'right-0 top-0 border-r-[3px] border-t-[3px] rounded-tr-[28px]', 'bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-[28px]', 'bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-[28px]'] as const).map((c) => (
            <span key={c} className={cx('absolute size-10 transition-colors', c, phase.kind === 'scanning' ? 'border-white' : 'border-white/30')} />
          ))}
          {phase.kind === 'scanning' && <div className="absolute inset-x-8 top-1/2 h-[3px] -translate-y-1/2 animate-pulse rounded-full bg-[var(--brand)] shadow-[0_0_18px_var(--brand)]" />}
        </div>
      </div>

      <div className="absolute inset-x-0 top-0 flex items-center justify-between px-3 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
        <button type="button" aria-label="Scanner schließen" onClick={() => navigate(-1)} className="press flex size-12 items-center justify-center rounded-full bg-white/15 backdrop-blur-xl">
          <IconX />
        </button>
        {torch.supported && (
          <button type="button" aria-label="Taschenlampe" aria-pressed={torch.on} onClick={toggleTorch} className={cx('press flex size-12 items-center justify-center rounded-full backdrop-blur-xl', torch.on ? 'bg-white text-black' : 'bg-white/15')}>
            <IconBolt />
          </button>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
        <p className="mb-4 min-h-6 text-center text-[15px] font-medium text-white/90">
          {phase.kind === 'starting' && 'Kamera startet …'}
          {phase.kind === 'scanning' && 'Barcode in den Rahmen halten'}
          {phase.kind === 'lookup' && (
            <span className="inline-flex items-center gap-2">
              <Spinner className="size-4" /> {phase.code ? `Suche ${phase.code} …` : 'Lese das Foto …'}
            </span>
          )}
          {phase.kind === 'noCamera' && phase.reason}
        </p>
        <div className="mx-auto grid max-w-md grid-cols-2 gap-2">
          <button type="button" onClick={() => setManualOpen(true)} className="press flex min-h-[52px] items-center justify-center gap-2 rounded-full bg-white/15 font-semibold backdrop-blur-xl active:bg-white/25">
            <IconKeyboard size={20} /> Code eintippen
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} className="press flex min-h-[52px] items-center justify-center gap-2 rounded-full bg-white/15 font-semibold backdrop-blur-xl active:bg-white/25">
            <IconCamera size={20} /> Foto machen
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void fromPhoto(e.target.files?.[0])} />
      </div>

      <Sheet open={manualOpen} onClose={() => setManualOpen(false)} title="Barcode eintippen">
        <div className="space-y-3 pb-2 pt-1 text-ink">
          <TextInput
            inputMode="numeric"
            autoFocus
            placeholder="8, 12 oder 13 Ziffern"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && submitManual()}
          />
          {manualCode.length >= 8 && !manualValid && <p className="text-sm text-danger">Die Prüfziffer passt nicht. Bitte die Nummer prüfen.</p>}
          <Button block size="lg" disabled={!manualValid} onClick={submitManual}>
            Suchen
          </Button>
        </div>
      </Sheet>

      <Sheet
        open={phase.kind === 'product'}
        onClose={restart}
        title="Ist das das Produkt?"
        footer={
          product && (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => navigate(`/food/new?meal=${meal}${date !== today ? `&d=${date}` : ''}`, { state: { draft: product }, replace: true })}>
                Erst bearbeiten
              </Button>
              <Button className="flex-1" size="lg" onClick={() => void confirmProduct(product)}>
                Bestätigen
              </Button>
            </div>
          )
        }
      >
        {product && (
          <div className="space-y-3 text-ink">
            <div>
              <p className="text-lg font-bold">{product.name}</p>
              <p className="text-sm text-ink-2">{[product.brand, product.barcode].filter(Boolean).join(' · ')}</p>
            </div>
            <table className="w-full text-sm tabular-nums">
              <caption className="pb-1 text-left text-xs font-semibold text-ink-2">Pro 100 g</caption>
              <tbody className="divide-y divide-line">
                {[
                  ['Energie', `${fmtInt(product.per100.kcal)} kcal`],
                  ['Eiweiß', `${fmt1(product.per100.protein)} g`],
                  ['Kohlenhydrate', `${fmt1(product.per100.carbs)} g`],
                  ['davon Zucker', product.per100.sugar != null ? `${fmt1(product.per100.sugar)} g` : null],
                  ['Fett', `${fmt1(product.per100.fat)} g`],
                  ['davon gesättigt', product.per100.satFat != null ? `${fmt1(product.per100.satFat)} g` : null],
                  ['Ballaststoffe', product.per100.fibre != null ? `${fmt1(product.per100.fibre)} g` : null],
                  ['Salz', product.per100.salt != null ? `${fmt2(product.per100.salt)} g` : null],
                ]
                  .filter((r) => r[1] != null)
                  .map(([k, val]) => (
                    <tr key={k}>
                      <td className="py-2 text-ink-2">{k}</td>
                      <td className="py-2 text-right font-semibold">{val}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {energy && !energy.ok && (
              <div className="flex gap-3 rounded-2xl bg-warn-soft px-4 py-3 text-sm text-warn">
                <IconWarn size={18} className="mt-0.5 shrink-0" />
                <span>
                  Die angegebenen {fmtInt(product.per100.kcal)} kcal passen nicht zu den Makros ({fmtInt(energy.computedKcal)} kcal). Gemeinschaftsdaten können falsch sein: mit dem Etikett vergleichen oder „Erst bearbeiten“ tippen.
                </span>
              </div>
            )}
            <p className="text-xs text-ink-3">Produktdaten von Open Food Facts, unter der Open Database License.</p>
          </div>
        )}
      </Sheet>

      <Sheet
        open={phase.kind === 'notFound' || phase.kind === 'error'}
        onClose={restart}
        title={phase.kind === 'error' ? 'Suche fehlgeschlagen' : 'Produkt nicht gefunden'}
        footer={
          (phase.kind === 'notFound' || phase.kind === 'error') && (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={restart}>
                Neu scannen
              </Button>
              <Button className="flex-1" size="lg" onClick={() => labelForm(phase.code, phase.kind === 'notFound' ? phase.name : undefined, phase.kind === 'notFound' ? phase.brand : undefined)}>
                Vom Etikett
              </Button>
            </div>
          )
        }
      >
        <div className="pb-2 text-[15px] text-ink">
          {phase.kind === 'notFound' &&
            (phase.name ? (
              <p>
                Open Food Facts kennt <b>{phase.name}</b>, hat aber keine vollständigen Nährwerte. Trag sie vom Etikett ein; das Produkt wird dann auf diesem iPhone gespeichert.
              </p>
            ) : (
              <p>
                Open Food Facts hat kein Produkt mit dem Code <b className="tabular-nums">{phase.code}</b>. Trag es einmal vom Etikett ein; danach klappt das Scannen auch offline.
              </p>
            ))}
          {phase.kind === 'error' && <p>{phase.message}</p>}
        </div>
      </Sheet>

      <PortionSheet
        open={phase.kind === 'portion'}
        food={phase.kind === 'portion' ? phase.food : null}
        date={date}
        meal={meal}
        source="barcode"
        onClose={restart}
        onDone={() => navigate(diary, { replace: true })}
      />
    </div>
  )
}
