// The built-in food list comes from a food table you download once (BLS 4.0, or
// USDA FoodData Central) and import here as CSV or JSON. Columns are guessed and
// shown for checking before anything is written.

import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSetting } from '../../hooks'
import { formatDate, localDay } from '../../lib/dates'
import { fmt1, fmtInt } from '../../lib/format'
import { detectColumns, FIELD_LABEL, FIELDS, mapFoodRows, missingRequired, readFoodTable, type ColumnMap, type FieldKey, type FoodTable } from '../../lib/foodImport'
import { importFoodList, myFoods, removeFoodList } from '../../store/foods'
import { IconUpload } from '../../ui/icons'
import { Button, Card, EmptyState, Field, Group, ListRow, Notice, Screen, SectionTitle, Sheet, Spinner, TextInput } from '../../ui/kit'
import { useToast } from '../../ui/toast'

const selectCls = 'min-h-11 w-full rounded-xl bg-fill px-3 text-[15px] outline-none focus:ring-2 focus:ring-accent'

export default function FoodList() {
  const navigate = useNavigate()
  const toast = useToast()
  const meta = useSetting('foodList')
  const mine = useLiveQuery(() => myFoods())
  const fileRef = useRef<HTMLInputElement>(null)
  const [table, setTable] = useState<FoodTable | null>(null)
  const [map, setMap] = useState<ColumnMap>({})
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)

  const pick = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = ''
    if (!file) return
    setError(null)
    try {
      const t = readFoodTable(await file.text())
      setTable(t)
      setMap(detectColumns(t.header))
      setName(file.name.replace(/\.(csv|tsv|txt|json)$/i, ''))
    } catch (e) {
      setError((e as Error).message || 'Die Datei ließ sich nicht lesen.')
    }
  }

  const mapped = table ? mapFoodRows(table, map) : null
  const missing = missingRequired(map)

  const doImport = async () => {
    if (!mapped || missing.length) return
    setBusy(true)
    try {
      const n = await importFoodList(mapped.foods, name.trim() || 'Lebensmittelliste')
      toast({ message: `${fmtInt(n)} Lebensmittel importiert` })
      setTable(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen back title="Lebensmittel">
      <Card>
        {meta ? (
          <>
            <p className="text-xl font-bold">{meta.name}</p>
            <p className="text-sm text-ink-2">
              {fmtInt(meta.count)} Lebensmittel · importiert am {formatDate(localDay(new Date(meta.importedAt)))}
            </p>
          </>
        ) : (
          <>
            <p className="text-xl font-bold">Noch keine Lebensmittelliste</p>
            <p className="mt-1 text-sm text-ink-2">Die Suche findet, was du gescannt oder angelegt hast. Mit einer importierten Nährwerttabelle findest du auch allgemeine Lebensmittel.</p>
          </>
        )}
      </Card>

      <Button block size="lg" className="mt-3" onClick={() => fileRef.current?.click()}>
        <IconUpload /> {meta ? 'Neue Version importieren' : 'Lebensmittelliste importieren'}
      </Button>
      <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.json,text/csv,application/json" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
      {error && (
        <Notice tone="danger" className="mt-3">
          {error}
        </Notice>
      )}

      <SectionTitle>Woher bekommen</SectionTitle>
      <Card className="space-y-2 text-sm text-ink-2">
        <p>
          <b className="text-ink">BLS 4.0</b>, der Bundeslebensmittelschlüssel (7.140 Lebensmittel), ist kostenlos auf{' '}
          <a className="text-brand-ink underline" href="https://blsdb.de" target="_blank" rel="noreferrer">
            blsdb.de
          </a>
          . Den Download in Numbers oder Excel öffnen, als CSV exportieren und hier importieren. Vor dem öffentlichen Teilen die Lizenz lesen.
        </p>
        <p>
          <b className="text-ink">USDA FoodData Central</b> (Englisch, gemeinfrei) geht genauso.
        </p>
        <p>Gebraucht werden Name, Energie (kcal oder kJ), Eiweiß, Kohlenhydrate und Fett pro 100 g; Ballaststoffe, Zucker, gesättigte Fette und Salz (oder Natrium) werden genutzt, wenn vorhanden. Ein neuer Import ersetzt die Liste, dein Verlauf bleibt.</p>
      </Card>
      {meta && (
        <Button block variant="ghost" className="mt-2 !text-danger" onClick={() => setConfirmRemove(true)}>
          Lebensmittelliste entfernen
        </Button>
      )}

      <SectionTitle>Eigene Lebensmittel</SectionTitle>
      {mine && mine.length ? (
        <Group>
          {mine.map((f) => (
            <ListRow
              key={f.id}
              title={f.name}
              subtitle={[f.brand, f.source === 'off' ? 'gescannt' : 'selbst angelegt', f.flagged ? 'Werte prüfen' : null].filter(Boolean).join(' · ')}
              detail={`${fmtInt(f.per100.kcal)} kcal`}
              onClick={() => navigate(`/food/edit/${f.id}`)}
            />
          ))}
        </Group>
      ) : (
        <EmptyState title="Noch nichts gescannt oder angelegt">Gescannte Produkte und vom Etikett eingetragene Lebensmittel erscheinen hier und lassen sich korrigieren.</EmptyState>
      )}

      <Sheet
        open={!!table}
        onClose={() => setTable(null)}
        title="Spalten prüfen"
        footer={
          <Button block size="lg" disabled={busy || !!missing.length || !mapped?.foods.length} onClick={() => void doImport()}>
            {busy ? <Spinner /> : `${fmtInt(mapped?.foods.length ?? 0)} Lebensmittel importieren`}
          </Button>
        }
      >
        {table && mapped && (
          <div className="space-y-4 pb-2">
            <p className="text-sm text-ink-2">
              {fmtInt(table.rows.length)} Zeilen, {table.header.length} Spalten. Jeder Wert unten ist einer Spalte zugeordnet; ändere falsche Zuordnungen.
            </p>
            <Field label="Name der Liste">
              <TextInput value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <div className="space-y-2">
              {FIELDS.map((f: FieldKey) => (
                <label key={f} className="grid grid-cols-[9rem_1fr] items-center gap-2">
                  <span className="text-sm font-medium">{FIELD_LABEL[f]}</span>
                  <select
                    className={selectCls}
                    value={map[f] ?? ''}
                    onChange={(e) => {
                      const v = e.target.value
                      const next = { ...map }
                      if (v === '') delete next[f]
                      else next[f] = Number(v)
                      setMap(next)
                    }}
                  >
                    <option value="">– nicht in der Datei –</option>
                    {table.header.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `Spalte ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            {missing.length > 0 && <Notice tone="danger">Spalte wählen für: {missing.map((m) => FIELD_LABEL[m]).join(', ')}.</Notice>}
            {mapped.foods.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold text-ink-2">Vorschau, pro 100 g</p>
                <table className="w-full text-sm tabular-nums">
                  <tbody className="divide-y divide-line">
                    {mapped.foods.slice(0, 5).map((f) => (
                      <tr key={f.key}>
                        <td className="py-1.5 pr-2">{f.name}</td>
                        <td className="whitespace-nowrap py-1.5 text-right text-ink-2">
                          {fmtInt(f.per100.kcal)} kcal · E {fmt1(f.per100.protein)} · K {fmt1(f.per100.carbs)} · F {fmt1(f.per100.fat)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {(mapped.skipped.length > 0 || mapped.flagged > 0) && (
              <Notice tone="warn">
                {mapped.skipped.length > 0 &&
                  `${fmtInt(mapped.skipped.length)} Zeilen werden übersprungen (erste: Zeile ${mapped.skipped[0].row}, ${mapped.skipped[0].reason}). `}
                {mapped.flagged > 0 && `Bei ${fmtInt(mapped.flagged)} Lebensmitteln passen Kalorien und Makros nicht zusammen; sie werden importiert und markiert.`}
              </Notice>
            )}
          </div>
        )}
      </Sheet>

      <Sheet
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        title="Lebensmittelliste entfernen?"
        footer={
          <Button
            block
            variant="danger"
            onClick={async () => {
              await removeFoodList()
              setConfirmRemove(false)
              toast({ message: 'Lebensmittelliste entfernt' })
            }}
          >
            {meta ? fmtInt(meta.count) : ''} Lebensmittel entfernen
          </Button>
        }
      >
        <p className="pb-2 text-ink-2">Dein Tagebuch behält jeden Eintrag, weil jeder seine Werte selbst speichert. Gescannte und eigene Lebensmittel bleiben. Du kannst die Liste jederzeit wieder importieren.</p>
      </Sheet>
    </Screen>
  )
}
