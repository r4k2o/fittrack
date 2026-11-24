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
      <Card tone="brand" className="!p-4">
        <div className="flex items-start gap-3">
          <IconTile tone="brand" size={36}>
            <IconTarget size={20} />
          </IconTile>
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-semibold">Targets from your own data</p>
            <p className="mt-1 text-[14px] text-ink-2">
              Over the last 14 days you used about <b className="text-ink">{fmtInt(proposal.measuredKcal)} kcal</b> a day, {Math.abs(proposal.diffPct).toFixed(0)}%{' '}
              {proposal.diffPct > 0 ? 'more' : 'less'} than the {fmtInt(proposal.currentKcal)} kcal your targets assume. New target: <b className="text-ink">{fmtInt(r.kcal)} kcal</b>,{' '}
              {r.proteinG} g protein, {r.carbsG} g carbs, {r.fatG} g fat.
            </p>
            <p className="mt-1 text-[12px] text-ink-3">7,700 kcal per kg is a convention, so this steers rather than measures.</p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            onClick={async () => {
              await acceptProposal(proposal, today)
              haptic('success')
              toast({ message: `Target updated to ${fmtInt(r.kcal)} kcal from today` })
            }}
          >
            Use new targets
          </Button>
          {!hidden && (
            <Button size="sm" variant="secondary" onClick={() => void snoozeProposal(today)}>
              Ignore
            </Button>
          )}
        </div>
      </Card>
    )
  }
  if (!showProgress) return null
  return (
    <Card className="!p-4">
      <p className="text-[16px] font-semibold">Expenditure from your data</p>
      {estimate ? (
        <p className="mt-1 text-[14px] text-ink-2">
          About <b className="text-ink">{fmtInt(estimate.kcal)} kcal</b> a day over the last 14 days: {fmtInt(estimate.avgIntake)} kcal eaten on average, trend{' '}
          {estimate.trendChangeKg >= 0 ? '+' : ''}
          {fmt1(estimate.trendChangeKg)} kg. Within 5% of your targets' maintenance, so nothing changes.
        </p>
      ) : (
        <p className="mt-1 text-[14px] text-ink-2">
          Needs 14 days with at least 12 of them logged and a weight trend: {loggedDays} of 14 days logged so far. Then the app compares what you ate with how your weight moved.
        </p>
      )}
    </Card>
  )
}
