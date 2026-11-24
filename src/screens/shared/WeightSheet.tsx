import { useEffect, useState } from 'react'
import { localDay } from '../../lib/dates'
import { latestMetric, upsertMetric } from '../../store/metrics'
import { Button, Field, NumberInput, Sheet, TextInput } from '../../ui/kit'
import { useToast } from '../../ui/toast'

/** Log a body-weight reading. One value per day: a second entry for a day replaces the first. */
export function WeightSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [kg, setKg] = useState<number | null>(null)
  const [date, setDate] = useState(localDay())
  const toast = useToast()
  useEffect(() => {
    if (!open) return
    setDate(localDay())
    void latestMetric('weight').then((m) => setKg(m?.value ?? null))
  }, [open])
  const valid = kg != null && kg >= 30 && kg <= 300
  const save = async () => {
    if (!valid) return
    await upsertMetric('weight', date, kg as number, 'manual')
    toast({ message: `Weight saved: ${kg} kg` })
    onClose()
  }
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Log weight"
      footer={
        <Button block size="lg" disabled={!valid} onClick={save}>
          Save
        </Button>
      }
    >
      <div className="space-y-4 pt-2">
        <Field label="Weight" hint="Best taken in the morning, after the bathroom, before eating.">
          <NumberInput value={kg} unit="kg" autoFocus ariaLabel="Weight" onChange={setKg} onEnter={save} />
        </Field>
        <Field label="Date">
          <TextInput type="date" value={date} max={localDay()} onChange={(e) => setDate(e.target.value || localDay())} />
        </Field>
      </div>
    </Sheet>
  )
}
