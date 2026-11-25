// Calls to the user's own model provider, straight from the browser. Only the meal
// photo (downscaled to about 1,024 px) or the plan's JSON is sent. Every call counts
// toward today's limit; when it is spent the feature steps aside for manual entry.

import { buildRequest, describeHttpError, PHOTO_PROMPT, PROVIDERS, parseItems, replyText, type AiProvider, type SeenItem } from '../lib/ai'
import { localDay } from '../lib/dates'
import { getSetting, setSetting } from '../store/settings'
import { toJpeg } from './camera'

export interface AiConfig {
  provider: AiProvider
  model: string
  key: string
  limit: number
}

export async function aiConfig(): Promise<AiConfig | null> {
  const key = await getSetting('aiApiKey')
  if (!key) return null
  const provider = await getSetting('aiProvider')
  return { provider, key, model: (await getSetting('aiModel')) || PROVIDERS[provider].model, limit: (await getSetting('aiDailyLimit')) ?? PROVIDERS[provider].limit }
}

export async function usedToday(): Promise<number> {
  const u = await getSetting('aiUsage')
  return u && u.date === localDay() ? u.count : 0
}

async function countRequest(): Promise<void> {
  const today = localDay()
  const u = await getSetting('aiUsage')
  await setSetting('aiUsage', { date: today, count: u && u.date === today ? u.count + 1 : 1 })
}

export class AiError extends Error {}

async function call(cfg: AiConfig, prompt: string, json: boolean, image?: { data: string; mime: string }): Promise<string> {
  if ((await usedToday()) >= cfg.limit) throw new AiError(`Today's ${cfg.limit} requests are used up. Log by search instead; the count resets at midnight.`)
  const { url, init } = buildRequest({ provider: cfg.provider, model: cfg.model, key: cfg.key, prompt, json, image })
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), 45_000)
  let res: Response
  try {
    await countRequest()
    res = await fetch(url, { ...init, signal: ctrl.signal })
  } catch (e) {
    throw new AiError(
      e instanceof DOMException && e.name === 'AbortError'
        ? 'The provider took too long to answer.'
        : 'No connection to the provider, or it does not accept calls from a browser. Check the network, or try another provider.',
    )
  } finally {
    window.clearTimeout(timer)
  }
  if (!res.ok) throw new AiError(describeHttpError(res.status, await res.text().catch(() => '')))
  try {
    return replyText(cfg.provider, await res.json())
  } catch (e) {
    throw new AiError(e instanceof Error ? e.message : 'The reply could not be read.')
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]+,/, ''))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

/** Downscales the photo, asks for the foods and grams it shows, and validates the answer. */
export async function analyzeMealPhoto(cfg: AiConfig, photo: Blob): Promise<{ items: SeenItem[]; preview: Blob }> {
  const bmp = await createImageBitmap(photo)
  const preview = await toJpeg(bmp, bmp.width, bmp.height, 1024, 0.8)
  bmp.close()
  const text = await call(cfg, PHOTO_PROMPT, true, { data: await blobToBase64(preview), mime: 'image/jpeg' })
  try {
    return { items: parseItems(text), preview }
  } catch {
    throw new AiError('The model’s answer was not in the expected form. Try again, or log by search.')
  }
}

/** A short text call that shows whether the key, the model and browser access work. */
export async function testConnection(cfg: AiConfig): Promise<string> {
  const text = await call(cfg, 'Reply with the JSON {"ok":true} and nothing else.', true)
  return /ok/i.test(text) ? 'Connected: the provider answered from this browser.' : `The provider answered: ${text.slice(0, 80)}`
}

export async function askText(cfg: AiConfig, prompt: string, json = false): Promise<string> {
  return call(cfg, prompt, json)
}
