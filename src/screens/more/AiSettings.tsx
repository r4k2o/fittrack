// Photo logging needs the user's own key for a vision model. The key is stored only on
// this phone and never goes into a backup. The screen shows today's request count beside
// the limit, a connection test, and how far confirmed grams were from the model's guesses.

import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { aiConfig, testConnection, usedToday } from '../../adapters/vision'
import { useSetting } from '../../hooks'
import { PROVIDERS, type AiProvider } from '../../lib/ai'
import { fmtInt } from '../../lib/format'
import { setSetting } from '../../store/settings'
import { IconCamera, IconLock } from '../../ui/icons'
import { Button, Card, Field, IconTile, Notice, NumberInput, Screen, SectionTitle, Segmented, Spinner, TextInput } from '../../ui/kit'

export default function AiSettings() {
  const provider = useSetting('aiProvider') ?? 'gemini'
  const savedKey = useSetting('aiApiKey')
  const model = useSetting('aiModel')
  const limit = useSetting('aiDailyLimit')
  const stats = useSetting('aiStats')
  const used = useLiveQuery(() => usedToday(), [])
  const [key, setKey] = useState('')
  const [test, setTest] = useState<{ busy: boolean; ok?: boolean; text?: string } | null>(null)
  const p = PROVIDERS[provider]
  useEffect(() => setKey(savedKey ?? ''), [savedKey])

  const run = async () => {
    setTest({ busy: true })
    try {
      const cfg = await aiConfig()
      if (!cfg) throw new Error('Add a key first.')
      setTest({ busy: false, ok: true, text: await testConnection(cfg) })
    } catch (e) {
      setTest({ busy: false, ok: false, text: e instanceof Error ? e.message : String(e) })
    }
  }

  const err = stats && stats.items ? stats.absDiffGrams / stats.items : null
  const bias = stats && stats.aiGrams ? ((stats.finalGrams - stats.aiGrams) / stats.aiGrams) * 100 : null

  return (
    <Screen back="/more" title="Photo logging" tone="food">
      <Card tone="food" className="!p-5">
        <div className="flex items-center gap-3">
          <IconTile tone="food" size={44}>
            <IconCamera size={24} />
          </IconTile>
          <div>
            <p className="text-[17px] font-bold">Meal photo to foods</p>
            <p className="text-[14px] text-ink-2">With your own key, optional</p>
          </div>
        </div>
        <p className="mt-3 text-[14px] text-ink-2">
          The model names the foods and guesses grams; calories always come from your food list, and nothing is logged until you confirm. In a 2025 study, models were off by
          about 40% or more on weight. Treat it as a quicker start, and weigh anything that matters.
        </p>
      </Card>

      <SectionTitle>Provider</SectionTitle>
      <Segmented
        value={provider}
        options={(Object.keys(PROVIDERS) as AiProvider[]).map((k) => ({ value: k, label: PROVIDERS[k].label }))}
        onChange={(v) => {
          void setSetting('aiProvider', v)
          void setSetting('aiModel', null)
          void setSetting('aiDailyLimit', null)
          setTest(null)
        }}
      />
      <Card className="mt-3 !p-4 text-[14px]">
        <p>
          <b>Free allowance.</b> <span className="text-ink-2">{p.allowance}</span>
        </p>
        <p className="mt-2">
          <b>Catch.</b> <span className="text-ink-2">{p.catch}</span>
        </p>
        <p className="mt-2 text-ink-2">Create a key at {p.keyUrl} without attaching a payment method, then paste it here.</p>
      </Card>

      <div className="mt-4 space-y-4">
        <Field label="API key" hint={<span className="inline-flex items-center gap-1"><IconLock size={13} /> Stored only on this phone; never in backups or the code.</span>}>
          <TextInput type="password" autoComplete="off" spellCheck={false} placeholder="Paste your key" value={key} onChange={(e) => setKey(e.target.value)} onBlur={() => void setSetting('aiApiKey', key.trim() || null)} />
        </Field>
        <Field label="Model" hint={`Default: ${p.model}`}>
          <TextInput autoCapitalize="off" autoCorrect="off" spellCheck={false} value={model ?? ''} placeholder={p.model} onChange={(e) => void setSetting('aiModel', e.target.value.trim() || null)} />
        </Field>
        <Field label="Daily limit" hint={`Requests a day before the feature steps aside. Default ${p.limit}.`}>
          <NumberInput value={limit ?? p.limit} integer ariaLabel="Daily request limit" onChange={(n) => void setSetting('aiDailyLimit', n && n > 0 ? n : null)} />
        </Field>
      </div>

      <Card className="mt-4 !p-4">
        <div className="flex items-baseline justify-between">
          <p className="text-[16px] font-semibold">Today</p>
          <p className="text-[15px] tabular-nums text-ink-2">
            <b className="text-ink">{used ?? 0}</b> of {limit ?? p.limit} requests
          </p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-fill">
          <div className="h-full rounded-full bg-food" style={{ width: `${Math.min(100, ((used ?? 0) / (limit ?? p.limit)) * 100)}%` }} />
        </div>
        <Button block variant="secondary" className="mt-3" disabled={!savedKey || test?.busy} onClick={() => void run()}>
          {test?.busy ? <Spinner /> : 'Test connection'}
        </Button>
        {test && !test.busy && (
          <Notice tone={test.ok ? 'ok' : 'danger'} className="mt-3">
            {test.text}
          </Notice>
        )}
        {savedKey && (
          <Button
            block
            variant="ghost"
            className="mt-1 !text-danger"
            onClick={() => {
              setKey('')
              void setSetting('aiApiKey', null)
              setTest(null)
            }}
          >
            Remove key
          </Button>
        )}
      </Card>

      <SectionTitle>Accuracy so far</SectionTitle>
      <Card className="!p-4 text-[14px]">
        {stats && stats.items > 0 ? (
          <p>
            {fmtInt(stats.meals)} meals, {fmtInt(stats.items)} items confirmed. You changed the model's grams by <b>{fmtInt(err ?? 0)} g</b> per item on average
            {bias != null ? `, and your totals were ${Math.abs(bias).toFixed(0)}% ${bias >= 0 ? 'above' : 'below'} its guesses` : ''}. Weigh 20 meals to know its error for your
            food.
          </p>
        ) : (
          <p className="text-ink-2">After you confirm photo meals, this shows how far your grams were from the model's guesses.</p>
        )}
      </Card>
      <p className="mt-4 px-1 text-[13px] text-ink-2">Only meal photos are sent, downscaled to about 1,024 px. On a free tier, treat them as readable by the provider. Progress photos are never sent.</p>
    </Screen>
  )
}
