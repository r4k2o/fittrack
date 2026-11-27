// The optional vision and language model, as plain functions: request builders for
// Gemini, OpenRouter and Mistral, reply parsing with Zod, and matching what the model
// saw to the local food list. Calories and macros always come from that list, never
// from the model, and nothing is logged until the user confirms.

import { z } from 'zod'
import type { Food } from '../db'
import { buildFoodIndex, searchFoods } from './foodSearch'
import { DAYS_OPTIONS, EQUIPMENT_CHOICES, JOINTS, MINUTES_OPTIONS, PLAN_GOALS, type PlanAnswers } from './planner'
import { GROUPS } from './volume'

export type AiProvider = 'gemini' | 'openrouter' | 'mistral'

export const PROVIDERS: Record<AiProvider, { label: string; model: string; limit: number; keyUrl: string; allowance: string; catch: string }> = {
  gemini: {
    label: 'Gemini',
    model: 'gemini-flash-lite-latest',
    limit: 500,
    keyUrl: 'aistudio.google.com',
    allowance: 'Kostenlos etwa 15 Anfragen pro Minute und 500 am Tag (Stand Oktober 2026), ohne Kreditkarte.',
    catch: 'Google nennt keine festen Zahlen und kann sie ändern. In der EU verlangen die Bedingungen den Bezahl-Tarif: etwa 0,001 US$ pro Foto, Guthaben ab 5 US$.',
  },
  openrouter: {
    label: 'OpenRouter',
    model: 'google/gemma-3-27b-it:free',
    limit: 50,
    keyUrl: 'openrouter.ai',
    allowance: 'Kostenlose Modelle: 20 pro Minute und 50 am Tag, nach einmalig 10 US$ Guthaben 1.000 am Tag.',
    catch: 'Die kostenlosen Bildmodelle wechseln oft; wähle eins mit Bild-Eingabe.',
  },
  mistral: {
    label: 'Mistral',
    model: 'mistral-small-latest',
    limit: 100,
    keyUrl: 'console.mistral.ai',
    allowance: 'Kostenloser Experiment-Tarif mit Telefonbestätigung, ohne Karte.',
    catch: 'Anfragen dürfen zum Training von Mistrals Modellen dienen; Limits sind nicht offiziell.',
  },
}

export const PHOTO_PROMPT = `You see a photo of a meal. List each separate food you can see.
For each give: "name" (a short generic English food name, e.g. "cooked white rice", "grilled chicken breast"),
"grams" (your best estimate of the edible weight on the plate) and "confidence" (0 to 1, how sure you are of both).
Do not estimate calories. Reply with JSON only: {"items":[{"name":"...","grams":123,"confidence":0.8}]}.
If there is no food in the photo, reply {"items":[]}.`

const confidence = z.union([z.number(), z.string()]).transform((v) => {
  if (typeof v === 'number') return Math.max(0, Math.min(1, v > 1 ? v / 100 : v))
  const s = v.toLowerCase()
  if (s.startsWith('high')) return 0.85
  if (s.startsWith('med')) return 0.6
  if (s.startsWith('low')) return 0.3
  const n = Number(s.replace('%', ''))
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n > 1 ? n / 100 : n)) : 0.5
})

const itemSchema = z.object({
  name: z.string().trim().min(1).max(80),
  grams: z.coerce.number().positive().max(3000),
  confidence: confidence.optional().default(0.5),
})

const itemsSchema = z.object({ items: z.array(z.looseObject({})).max(20) })

export interface SeenItem {
  name: string
  grams: number
  confidence: number
}

/** Pulls the JSON out of a reply that may be wrapped in a code fence or prose. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = (fenced ? fenced[1] : text).trim()
  const start = body.search(/[[{]/)
  if (start < 0) throw new Error('Das Modell hat nicht mit JSON geantwortet.')
  const open = body[start]
  const end = body.lastIndexOf(open === '{' ? '}' : ']')
  return JSON.parse(body.slice(start, end + 1))
}

/** Validates the items; unusable ones are dropped rather than failing the whole photo. */
export function parseItems(text: string): SeenItem[] {
  const raw = extractJson(text)
  const obj = Array.isArray(raw) ? { items: raw } : raw
  const parsed = itemsSchema.parse(obj)
  const out: SeenItem[] = []
  for (const it of parsed.items) {
    const r = itemSchema.safeParse(it)
    if (r.success) out.push({ name: r.data.name, grams: Math.round(r.data.grams), confidence: r.data.confidence })
  }
  return out
}

export interface AiRequest {
  url: string
  init: RequestInit
}

export interface AiInput {
  provider: AiProvider
  model: string
  key: string
  prompt: string
  /** Base64 JPEG, without the data: prefix. */
  image?: { data: string; mime: string }
  /** Ask for a JSON reply. */
  json: boolean
}

export function buildRequest(i: AiInput): AiRequest {
  if (i.provider === 'gemini') {
    const parts: unknown[] = [{ text: i.prompt }]
    if (i.image) parts.push({ inline_data: { mime_type: i.image.mime, data: i.image.data } })
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(i.model)}:generateContent`,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': i.key },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: { temperature: 0.2, ...(i.json ? { responseMimeType: 'application/json' } : {}) },
        }),
      },
    }
  }
  const content: unknown[] = [{ type: 'text', text: i.prompt }]
  if (i.image) {
    const url = `data:${i.image.mime};base64,${i.image.data}`
    content.push(i.provider === 'mistral' ? { type: 'image_url', image_url: url } : { type: 'image_url', image_url: { url } })
  }
  const base = i.provider === 'openrouter' ? 'https://openrouter.ai/api/v1/chat/completions' : 'https://api.mistral.ai/v1/chat/completions'
  return {
    url: base,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${i.key}`, ...(i.provider === 'openrouter' ? { 'X-Title': 'Fittrack' } : {}) },
      body: JSON.stringify({
        model: i.model,
        temperature: 0.2,
        messages: [{ role: 'user', content: i.image ? content : i.prompt }],
        ...(i.json ? { response_format: { type: 'json_object' } } : {}),
      }),
    },
  }
}

/** The reply text from each provider's response body. */
export function replyText(provider: AiProvider, body: unknown): string {
  const b = body as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
    choices?: { message?: { content?: string | { type?: string; text?: string }[] } }[]
  }
  if (provider === 'gemini') {
    const text = b.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
    if (!text) throw new Error('Das Modell hat leer geantwortet.')
    return text
  }
  const c = b.choices?.[0]?.message?.content
  const text = typeof c === 'string' ? c : Array.isArray(c) ? c.map((p) => p.text ?? '').join('') : ''
  if (!text) throw new Error('Das Modell hat leer geantwortet.')
  return text
}

/** Plain words for failed calls. */
export function describeHttpError(status: number, body: string): string {
  if (status === 400 && /api key|API_KEY/i.test(body)) return 'Der Schlüssel wurde abgelehnt. Prüf ihn unter Mehr → Foto-Erfassung.'
  if (status === 401 || status === 403) return 'Der Schlüssel wurde abgelehnt. Prüf ihn unter Mehr → Foto-Erfassung.'
  if (status === 404) return 'Modell nicht gefunden. Prüf den Modellnamen in den Einstellungen.'
  if (status === 429) return 'Das Limit des Anbieters ist gerade erreicht. Trag die Mahlzeit über die Suche ein.'
  if (status >= 500) return 'Der Anbieter hat gerade Probleme. Später erneut versuchen oder über die Suche eintragen.'
  return `Der Anbieter hat die Anfrage abgelehnt (${status}).`
}

// ---- matching ---------------------------------------------------------------------------

export interface MatchedItem {
  seen: SeenItem
  /** Best local food, or null when nothing matches. */
  food: Food | null
  /** Other close foods to switch to. */
  alternatives: Food[]
}

export const LOW_CONFIDENCE = 0.6

export function matchItems(items: readonly SeenItem[], foods: readonly Food[]): MatchedItem[] {
  if (!foods.length) return items.map((seen) => ({ seen, food: null, alternatives: [] }))
  const index = buildFoodIndex(foods)
  const byId = new Map(foods.map((f) => [f.id, f]))
  return items.map((seen) => {
    const ids = searchFoods(index, seen.name, new Map(), 6)
    const found = ids.map((id) => byId.get(id)).filter((f): f is Food => !!f)
    return { seen, food: found[0] ?? null, alternatives: found.slice(1) }
  })
}

// ---- plan assistant ------------------------------------------------------------------------

export const EXPLAIN_PROMPT = (planJson: string) => `You are a strength coach. Explain this training plan to its user in plain German (Du-Form), under 180 words:
what the split is, why the exercises and weekly sets are where they are, and one thing to watch.
Do not invent numbers; use only what is in the JSON.
${planJson}`

export const ADAPT_PROMPT = (answersJson: string, request: string) => `A rule engine builds training plans from these questionnaire answers:
${answersJson}
Allowed values: daysPerWeek ${DAYS_OPTIONS.join('|')}; minutes ${MINUTES_OPTIONS.join('|')}; equipment ${Object.keys(EQUIPMENT_CHOICES).join('|')};
injuries any of ${JOINTS.join('|')}; goal ${Object.keys(PLAN_GOALS).join('|')}; priority up to two of ${GROUPS.join('|')}.
The user asks: "${request.replace(/"/g, "'").slice(0, 300)}"
Change only the answers the request needs. Reply with JSON only: {"answers":{...only changed fields...},"note":"one sentence in German (Du-Form) on what changed and why"}`

const answersPatch = z
  .object({
    daysPerWeek: z.coerce.number().refine((n) => (DAYS_OPTIONS as readonly number[]).includes(n)),
    minutes: z.coerce.number().refine((n) => (MINUTES_OPTIONS as readonly number[]).includes(n)),
    equipment: z.enum(Object.keys(EQUIPMENT_CHOICES) as [string, ...string[]]),
    injuries: z.array(z.enum(JOINTS as unknown as [string, ...string[]])),
    goal: z.enum(Object.keys(PLAN_GOALS) as [string, ...string[]]),
    priority: z.array(z.enum(GROUPS as unknown as [string, ...string[]])).max(2),
  })
  .partial()

/** The model's change to the answers, validated field by field; the engine then builds the plan. */
export function parseAdapt(text: string, current: PlanAnswers): { answers: PlanAnswers; note: string } {
  const raw = extractJson(text) as { answers?: unknown; note?: unknown }
  const patch = answersPatch.parse(raw.answers ?? {})
  const note = typeof raw.note === 'string' ? raw.note.slice(0, 300) : ''
  return { answers: { ...current, ...(patch as Partial<PlanAnswers>), weekdays: undefined }, note }
}
