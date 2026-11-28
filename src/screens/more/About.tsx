import { useEffect, useState } from 'react'
import { isStandalone } from '../../hooks'
import { DISCLAIMER } from '../../lib/copy'
import { fmt1 } from '../../lib/format'
import { Card, Group, ListRow, Screen, SectionTitle } from '../../ui/kit'

export default function About() {
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [estimate, setEstimate] = useState<StorageEstimate | null>(null)
  useEffect(() => {
    void navigator.storage?.persisted?.().then(setPersisted)
    void navigator.storage?.estimate?.().then(setEstimate)
  }, [])
  const mb = (b?: number) => (b == null ? '–' : `${fmt1(b / 1024 / 1024)} MB`)
  return (
    <Screen back title="Info">
      <Card>
        <p className="text-lg font-bold">Fittrack {__APP_VERSION__}</p>
        <p className="mt-1 text-sm text-ink-2">Ein privates Logbuch für Essen, Training und Gewicht. Kein Konto, kein Server: Alle Daten bleiben in dieser App auf diesem iPhone.</p>
      </Card>

      <SectionTitle>Hinweis</SectionTitle>
      <Card>
        <p className="text-[15px] leading-relaxed">{DISCLAIMER}</p>
      </Card>

      <SectionTitle>Speicher</SectionTitle>
      <Group>
        <ListRow title="Auf dem Home-Bildschirm" detail={isStandalone() ? 'Ja' : 'Nein'} />
        <ListRow
          title="Dauerhafter Speicher"
          subtitle="Wird bei knappem Platz nicht gelöscht"
          detail={persisted == null ? 'Unbekannt' : persisted ? 'Ja' : 'Nicht erteilt'}
        />
        <ListRow title="Belegt" detail={`${mb(estimate?.usage)} von ${mb(estimate?.quota)}`} />
      </Group>

      <SectionTitle>Quellen</SectionTitle>
      <Card className="space-y-2 text-sm text-ink-2">
        <p>
          Produktdaten von{' '}
          <a className="text-brand-ink underline" href="https://world.openfoodfacts.org" target="_blank" rel="noreferrer">
            Open Food Facts
          </a>
          , unter der Open Database License.
        </p>
        <p>
          Übungsbibliothek auf Basis von{' '}
          <a className="text-brand-ink underline" href="https://github.com/yuhonas/free-exercise-db" target="_blank" rel="noreferrer">
            free-exercise-db
          </a>{' '}
          (gemeinfrei).
        </p>
        <p>Barcode-Erkennung mit ZXing als WebAssembly.</p>
      </Card>
    </Screen>
  )
}
