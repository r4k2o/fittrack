// Targets corrected from real data: after 14 days with at least 80% of them logged,
// measured expenditure is average intake minus the weight trend's change × 7,700 kcal
// per kg ÷ days. When it differs from the maintenance in use by more than 5%, new
// targets are proposed; the user accepts or ignores them. A steering signal, not a
// measurement.

import { useLiveQuery } from 'dexie-react-hooks'
import { useSetting, useToday } from '../../hooks'
import { fmt1, fmtInt } from '../../lib/format'
import { acceptProposal, expenditureState, snoozeProposal } from '../../store/progress'
import { IconTarget } from '../../ui/icons'
import { Button, Card, IconTile } from '../../ui/kit'
import { haptic } from '../../ui/motion'
import { useToast } from '../../ui/toast'

/** `showProgress` also shows the card while data is still collecting (Progress); Today shows only proposals. */
export function AdaptiveCard({ showProgress = false }: { showProgress?: boolean }) {
  const toast = useToast()
  const today = useToday()
  const snoozed = useSetting('adaptiveSnoozedUntil')
  const state = useLiveQuery(() => expenditureState(today), [today])
  if (!state) return null
  const hidden = !!snoozed && today < snoozed
  const { estimate, proposal, loggedDays } = state

  if (proposal && (!hidden || showProgress)) {
    const r = proposal.result
    return (
      <Card className="!p-4">
        <div className="flex items-start gap-3">
          <IconTile tone="brand" size={36}>
            <IconTarget size={20} />
          </IconTile>
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-semibold">Ziele aus deinen Daten</p>
            <p className="mt-1 text-[14px] text-ink-2">
              In den letzten 14 Tagen hast du etwa <b className="text-ink">{fmtInt(proposal.measuredKcal)} kcal</b> pro Tag verbraucht, {Math.abs(proposal.diffPct).toFixed(0)} %{' '}
              {proposal.diffPct > 0 ? 'mehr' : 'weniger'} als die {fmtInt(proposal.currentKcal)} kcal deiner Ziele. Neues Ziel: <b className="text-ink">{fmtInt(r.kcal)} kcal</b>,{' '}
              {r.proteinG} g Eiweiß, {r.carbsG} g Kohlenhydrate, {r.fatG} g Fett.
            </p>
            <p className="mt-1 text-[12px] text-ink-3">7.700 kcal pro kg sind eine Faustregel; das hier lenkt, es misst nicht.</p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            onClick={async () => {
              await acceptProposal(proposal, today)
              haptic('success')
              toast({ message: `Ab heute ${fmtInt(r.kcal)} kcal als Ziel` })
            }}
          >
            Neue Ziele übernehmen
          </Button>
          {!hidden && (
            <Button size="sm" variant="secondary" onClick={() => void snoozeProposal(today)}>
              Ignorieren
            </Button>
          )}
        </div>
      </Card>
    )
  }
  if (!showProgress) return null
  return (
    <Card className="!p-4">
      <p className="text-[16px] font-semibold">Verbrauch aus deinen Daten</p>
      {estimate ? (
        <p className="mt-1 text-[14px] text-ink-2">
          Etwa <b className="text-ink">{fmtInt(estimate.kcal)} kcal</b> pro Tag in den letzten 14 Tagen: im Schnitt {fmtInt(estimate.avgIntake)} kcal gegessen, Trend{' '}
          {estimate.trendChangeKg >= 0 ? '+' : ''}
          {fmt1(estimate.trendChangeKg)} kg. Weniger als 5 % Abweichung von deinem Erhaltungsbedarf, also bleibt alles, wie es ist.
        </p>
      ) : (
        <p className="mt-1 text-[14px] text-ink-2">
          Braucht 14 Tage, davon mindestens 12 erfasst, und einen Gewichtstrend: bisher {loggedDays} von 14 Tagen. Dann vergleicht die App, was du gegessen hast, mit deinem Gewicht.
        </p>
      )}
    </Card>
  )
}
