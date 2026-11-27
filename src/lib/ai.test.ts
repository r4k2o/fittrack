import { describe, expect, it } from 'vitest'
import type { Food } from '../db'
import { buildRequest, describeHttpError, extractJson, matchItems, parseAdapt, parseItems, replyText } from './ai'
import type { PlanAnswers } from './planner'

describe('AI replies', () => {
  it('reads items from plain JSON, fenced JSON and word confidences', () => {
    expect(parseItems('{"items":[{"name":"rice","grams":180,"confidence":0.9}]}')).toEqual([{ name: 'rice', grams: 180, confidence: 0.9 }])
    expect(parseItems('Here you go:\n```json\n{"items":[{"name":"chicken","grams":"150.4","confidence":"high"}]}\n```')).toEqual([{ name: 'chicken', grams: 150, confidence: 0.85 }])
    expect(parseItems('[{"name":"salad","grams":80,"confidence":70}]')).toEqual([{ name: 'salad', grams: 80, confidence: 0.7 }])
  })

  it('drops unusable items instead of failing the photo', () => {
    expect(parseItems('{"items":[{"name":"","grams":10},{"name":"bread","grams":-5},{"name":"apple","grams":150}]}')).toEqual([{ name: 'apple', grams: 150, confidence: 0.5 }])
    expect(() => parseItems('no idea')).toThrow(/JSON/)
  })

  it('finds JSON inside prose', () => {
    expect(extractJson('Sure! {"a":{"b":1}} Hope that helps')).toEqual({ a: { b: 1 } })
  })

  it('builds a Gemini request with the image inline and the key in a header', () => {
    const r = buildRequest({ provider: 'gemini', model: 'gemini-flash-lite-latest', key: 'k', prompt: 'p', image: { data: 'AAA', mime: 'image/jpeg' }, json: true })
    expect(r.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent')
    expect((r.init.headers as Record<string, string>)['x-goog-api-key']).toBe('k')
    const body = JSON.parse(r.init.body as string)
    expect(body.contents[0].parts[1]).toEqual({ inline_data: { mime_type: 'image/jpeg', data: 'AAA' } })
    expect(body.generationConfig.responseMimeType).toBe('application/json')
  })

  it('builds OpenAI-style requests for OpenRouter and Mistral', () => {
    const or = JSON.parse(buildRequest({ provider: 'openrouter', model: 'm', key: 'k', prompt: 'p', image: { data: 'AAA', mime: 'image/jpeg' }, json: true }).init.body as string)
    expect(or.messages[0].content[1]).toEqual({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAA' } })
    const mi = buildRequest({ provider: 'mistral', model: 'm', key: 'k', prompt: 'p', image: { data: 'AAA', mime: 'image/jpeg' }, json: false })
    expect(mi.url).toBe('https://api.mistral.ai/v1/chat/completions')
    expect((mi.init.headers as Record<string, string>).Authorization).toBe('Bearer k')
    expect(JSON.parse(mi.init.body as string).messages[0].content[1]).toEqual({ type: 'image_url', image_url: 'data:image/jpeg;base64,AAA' })
  })

  it('reads the reply text and explains HTTP errors', () => {
    expect(replyText('gemini', { candidates: [{ content: { parts: [{ text: '{"items":[]}' }] } }] })).toBe('{"items":[]}')
    expect(replyText('openrouter', { choices: [{ message: { content: 'hi' } }] })).toBe('hi')
    expect(() => replyText('mistral', { choices: [] })).toThrow(/leer/)
    expect(describeHttpError(429, '')).toMatch(/Limit/)
    expect(describeHttpError(400, 'API key not valid')).toMatch(/Schlüssel/)
  })
})

describe('matching to local foods', () => {
  const food = (id: string, name: string): Food => ({ id, name, source: 'list', per100: { kcal: 100, protein: 1, carbs: 1, fat: 1 }, servings: [], createdAt: 'x', updatedAt: 'x' })
  const foods = [food('a', 'Rice, white, cooked'), food('b', 'Chicken breast, grilled'), food('c', 'Rice cakes')]
  it('takes the best local match and keeps alternatives', () => {
    const [rice, chicken, unknown] = matchItems(
      [
        { name: 'cooked white rice', grams: 180, confidence: 0.9 },
        { name: 'grilled chicken', grams: 150, confidence: 0.5 },
        { name: 'zzzz', grams: 10, confidence: 0.2 },
      ],
      foods,
    )
    expect(rice.food?.id).toBe('a')
    expect(chicken.food?.id).toBe('b')
    expect(unknown.food).toBeNull()
  })
})

describe('plan assistant', () => {
  const current: PlanAnswers = { daysPerWeek: 4, minutes: 60, experience: 'intermediate', equipment: 'full', injuries: [], goal: 'muscle', priority: [] }
  it('accepts valid answer changes and rejects invented values', () => {
    const r = parseAdapt('{"answers":{"equipment":"bodyweight","minutes":"30"},"note":"Hotel week"}', current)
    expect(r.answers.equipment).toBe('bodyweight')
    expect(r.answers.minutes).toBe(30)
    expect(r.answers.daysPerWeek).toBe(4)
    expect(r.note).toBe('Hotel week')
    expect(() => parseAdapt('{"answers":{"equipment":"kettlebell gym"}}', current)).toThrow()
    expect(() => parseAdapt('{"answers":{"minutes":40}}', current)).toThrow()
  })
})
