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
      if (!cfg) throw new Error('Zuerst einen Schlüssel eintragen.')
      setTest({ busy: false, ok: true, text: await testConnection(cfg) })
    } catch (e) {
      setTest({ busy: false, ok: false, text: e instanceof Error ? e.message : String(e) })
    }
  }

  const err = stats && stats.items ? stats.absDiffGrams / stats.items : null
  const bias = stats && stats.aiGrams ? ((stats.finalGrams - stats.aiGrams) / stats.aiGrams) * 100 : null

  return (
    <Screen back="/more" title="Foto-Erfassung">
      <Card className="!p-5">
        <div className="flex items-center gap-3">
          <IconTile size={44}>
            <IconCamera size={24} />
          </IconTile>
          <div>
            <p className="text-[17px] font-bold">Vom Essensfoto zu Lebensmitteln</p>
            <p className="text-[14px] text-ink-2">Optional, mit deinem eigenen Schlüssel</p>
          </div>
        </div>
        <p className="mt-3 text-[14px] text-ink-2">
          Das Modell erkennt die Lebensmittel und schätzt die Gramm; Kalorien kommen immer aus deiner Lebensmittelliste, und nichts wird ohne deine Bestätigung eingetragen. In einer Studie von
          2025 lagen Modelle beim Gewicht um 40 % und mehr daneben. Sieh es als schnellen Start und wiege, was wichtig ist.
        </p>
      </Card>

      <SectionTitle>Anbieter</SectionTitle>
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
          <b>Kostenlos.</b> <span className="text-ink-2">{p.allowance}</span>
        </p>
        <p className="mt-2">
          <b>Haken.</b> <span className="text-ink-2">{p.catch}</span>
        </p>
        <p className="mt-2 text-ink-2">Erstell einen Schlüssel auf {p.keyUrl} ohne Zahlungsmittel und füg ihn hier ein.</p>
      </Card>

      <div className="mt-4 space-y-4">
        <Field label="API-Schlüssel" hint={<span className="inline-flex items-center gap-1"><IconLock size={13} /> Nur auf diesem iPhone gespeichert, nie im Backup oder im Code.</span>}>
          <TextInput type="password" autoComplete="off" spellCheck={false} placeholder="Schlüssel einfügen" value={key} onChange={(e) => setKey(e.target.value)} onBlur={() => void setSetting('aiApiKey', key.trim() || null)} />
        </Field>
        <Field label="Modell" hint={`Standard: ${p.model}`}>
          <TextInput autoCapitalize="off" autoCorrect="off" spellCheck={false} value={model ?? ''} placeholder={p.model} onChange={(e) => void setSetting('aiModel', e.target.value.trim() || null)} />
        </Field>
        <Field label="Tageslimit" hint={`Anfragen pro Tag, danach pausiert die Funktion. Standard ${p.limit}.`}>
          <NumberInput value={limit ?? p.limit} integer ariaLabel="Anfragen pro Tag" onChange={(n) => void setSetting('aiDailyLimit', n && n > 0 ? n : null)} />
        </Field>
      </div>

      <Card className="mt-4 !p-4">
        <div className="flex items-baseline justify-between">
          <p className="text-[16px] font-semibold">Heute</p>
          <p className="text-[15px] tabular-nums text-ink-2">
            <b className="text-ink">{used ?? 0}</b> von {limit ?? p.limit} Anfragen
          </p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-fill">
          <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, ((used ?? 0) / (limit ?? p.limit)) * 100)}%` }} />
        </div>
        <Button block variant="secondary" className="mt-3" disabled={!savedKey || test?.busy} onClick={() => void run()}>
          {test?.busy ? <Spinner /> : 'Verbindung testen'}
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
            Schlüssel entfernen
          </Button>
        )}
      </Card>

      <SectionTitle>Genauigkeit bisher</SectionTitle>
      <Card className="!p-4 text-[14px]">
        {stats && stats.items > 0 ? (
          <p>
            {fmtInt(stats.meals)} Mahlzeiten, {fmtInt(stats.items)} Einträge bestätigt. Du hast die Gramm des Modells im Schnitt um <b>{fmtInt(err ?? 0)} g</b> pro Eintrag geändert
            {bias != null ? `, und deine Summen lagen ${Math.abs(bias).toFixed(0)} % ${bias >= 0 ? 'über' : 'unter'} seinen Schätzungen` : ''}. Wieg 20 Mahlzeiten, dann kennst du seinen
            Fehler für dein Essen.
          </p>
        ) : (
          <p className="text-ink-2">Nach bestätigten Foto-Mahlzeiten siehst du hier, wie weit deine Gramm von den Schätzungen abwichen.</p>
        )}
      </Card>
      <p className="mt-4 px-1 text-[13px] text-ink-2">Gesendet werden nur Essensfotos, verkleinert auf etwa 1.024 px. Im kostenlosen Tarif kann der Anbieter sie lesen. Fortschrittsfotos werden nie gesendet.</p>
    </Screen>
  )
}
