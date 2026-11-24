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
    <Screen back title="About">
      <Card>
        <p className="text-lg font-bold">Fittrack {__APP_VERSION__}</p>
        <p className="mt-1 text-sm text-muted">A private logbook for food, training and body weight. No account, no server: every record stays in this app on this phone.</p>
      </Card>

      <SectionTitle>Disclaimer</SectionTitle>
      <Card>
        <p className="text-[15px] leading-relaxed">{DISCLAIMER}</p>
      </Card>

      <SectionTitle>Storage</SectionTitle>
      <Group>
        <ListRow title="Installed to the Home Screen" detail={isStandalone() ? 'Yes' : 'No'} />
        <ListRow
          title="Persistent storage"
          subtitle="Exempt from eviction when the disk runs short"
          detail={persisted == null ? 'Unknown' : persisted ? 'Yes' : 'Not granted'}
        />
        <ListRow title="Used" detail={`${mb(estimate?.usage)} of ${mb(estimate?.quota)}`} />
      </Group>

      <SectionTitle>Credits</SectionTitle>
      <Card className="space-y-2 text-sm text-muted">
        <p>
          Product data from{' '}
          <a className="text-accent underline" href="https://world.openfoodfacts.org" target="_blank" rel="noreferrer">
            Open Food Facts
          </a>
          , available under the Open Database License.
        </p>
        <p>
          Exercise library seeded from{' '}
          <a className="text-accent underline" href="https://github.com/yuhonas/free-exercise-db" target="_blank" rel="noreferrer">
            free-exercise-db
          </a>{' '}
          (public domain).
        </p>
        <p>Barcode decoding with ZXing compiled to WebAssembly.</p>
      </Card>
    </Screen>
  )
}
