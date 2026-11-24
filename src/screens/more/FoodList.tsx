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
      setError((e as Error).message || 'The file could not be read.')
    }
  }

  const mapped = table ? mapFoodRows(table, map) : null
  const missing = missingRequired(map)

  const doImport = async () => {
    if (!mapped || missing.length) return
    setBusy(true)
    try {
      const n = await importFoodList(mapped.foods, name.trim() || 'Food list')
      toast({ message: `${fmtInt(n)} foods imported` })
      setTable(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen tone="food" back title="Food list and my foods">
      <Card>
        {meta ? (
          <>
            <p className="text-xl font-bold">{meta.name}</p>
            <p className="text-sm text-ink-2">
              {fmtInt(meta.count)} foods · imported {formatDate(localDay(new Date(meta.importedAt)))}
            </p>
          </>
        ) : (
          <>
            <p className="text-xl font-bold">No food list yet</p>
            <p className="mt-1 text-sm text-ink-2">Search covers what you have scanned or added. Import a food table to search generic foods too.</p>
          </>
        )}
      </Card>

      <Button block size="lg" className="mt-3" onClick={() => fileRef.current?.click()}>
        <IconUpload /> {meta ? 'Import a new version' : 'Import a food list'}
      </Button>
      <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.json,text/csv,application/json" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
      {error && (
        <Notice tone="danger" className="mt-3">
          {error}
        </Notice>
      )}

      <SectionTitle>Where to get one</SectionTitle>
      <Card className="space-y-2 text-sm text-ink-2">
        <p>
          <b className="text-ink">BLS 4.0</b>, Germany's national food table (7,140 foods), is free from{' '}
          <a className="text-brand-ink underline" href="https://blsdb.de" target="_blank" rel="noreferrer">
            blsdb.de
          </a>
          . Open the download in Numbers or Excel, export it as CSV, and import that file here. Read its licence before sharing the file anywhere public.
        </p>
        <p>
          <b className="text-ink">USDA FoodData Central</b> (English, public domain) works the same way.
        </p>
        <p>The importer needs a name, energy (kcal or kJ), protein, carbohydrate and fat per 100 g; fibre, sugar, saturated fat and salt (or sodium) are used when present. Importing again replaces the list and keeps your history.</p>
      </Card>
      {meta && (
        <Button block variant="ghost" className="mt-2 !text-danger" onClick={() => setConfirmRemove(true)}>
          Remove the food list
        </Button>
      )}

      <SectionTitle>My foods</SectionTitle>
      {mine && mine.length ? (
        <Group>
          {mine.map((f) => (
            <ListRow
              key={f.id}
              title={f.name}
              subtitle={[f.brand, f.source === 'off' ? 'scanned' : 'added by you', f.flagged ? 'check values' : null].filter(Boolean).join(' · ')}
              detail={`${fmtInt(f.per100.kcal)} kcal`}
              onClick={() => navigate(`/food/edit/${f.id}`)}
            />
          ))}
        </Group>
      ) : (
        <EmptyState title="Nothing scanned or added yet">Scanned products and foods added from a label appear here and can be corrected.</EmptyState>
      )}

      <Sheet
        open={!!table}
        onClose={() => setTable(null)}
        title="Check the columns"
        footer={
          <Button block size="lg" disabled={busy || !!missing.length || !mapped?.foods.length} onClick={() => void doImport()}>
            {busy ? <Spinner /> : `Import ${fmtInt(mapped?.foods.length ?? 0)} foods`}
          </Button>
        }
      >
        {table && mapped && (
          <div className="space-y-4 pb-2">
            <p className="text-sm text-ink-2">
              {fmtInt(table.rows.length)} rows, {table.header.length} columns. Each value below was matched to a column; change any that are wrong.
            </p>
            <Field label="Name of the list">
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
                    <option value="">– not in the file –</option>
                    {table.header.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `Column ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            {missing.length > 0 && <Notice tone="danger">Choose a column for: {missing.map((m) => FIELD_LABEL[m]).join(', ')}.</Notice>}
            {mapped.foods.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-2">Preview, per 100 g</p>
                <table className="w-full text-sm tabular-nums">
                  <tbody className="divide-y divide-line">
                    {mapped.foods.slice(0, 5).map((f) => (
                      <tr key={f.key}>
                        <td className="py-1.5 pr-2">{f.name}</td>
                        <td className="whitespace-nowrap py-1.5 text-right text-ink-2">
                          {fmtInt(f.per100.kcal)} kcal · P {fmt1(f.per100.protein)} · C {fmt1(f.per100.carbs)} · F {fmt1(f.per100.fat)}
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
                  `${fmtInt(mapped.skipped.length)} rows will be skipped (first: line ${mapped.skipped[0].row}, ${mapped.skipped[0].reason}). `}
                {mapped.flagged > 0 && `${fmtInt(mapped.flagged)} foods have calories that do not match their macros; they are imported and marked.`}
              </Notice>
            )}
          </div>
        )}
      </Sheet>

      <Sheet
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        title="Remove the food list?"
        footer={
          <Button
            block
            variant="danger"
            onClick={async () => {
              await removeFoodList()
              setConfirmRemove(false)
              toast({ message: 'Food list removed' })
            }}
          >
            Remove {meta ? fmtInt(meta.count) : ''} foods
          </Button>
        }
      >
        <p className="pb-2 text-ink-2">Your diary keeps every entry, since each stores its own values. Scanned and saved foods stay. You can import the list again at any time.</p>
      </Sheet>
    </Screen>
  )
}
