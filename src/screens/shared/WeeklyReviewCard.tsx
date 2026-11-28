// The weekly review: weight change against the planned rate, adherence, sets per
// muscle, average sleep and steps, cardio, and at most one suggestion.

import type { ReactNode } from 'react'
import { addDays, formatDayShort } from '../../lib/dates'
import { fmt1, fmt2, fmtInt, fmtSleep } from '../../lib/format'
import type { WeeklyReview } from '../../lib/review'
import { GROUP_LABEL } from '../../lib/volume'
import { applyKcalChange } from '../../store/progress'
import { IconAlert, IconCheckCircle, IconFood, IconFootprints, IconMoon, IconScale, IconSparkle, IconTimer, IconTrain, IconX } from '../../ui/icons'
import { Button, Card, IconButton, IconTile, type IconTone } from '../../ui/kit'
import { haptic } from '../../ui/motion'
import { useToast } from '../../ui/toast'

function Row({ icon, tone, label, children }: { icon: ReactNode; tone: IconTone; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <IconTile tone={tone} size={30}>
        {icon}
      </IconTile>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-ink-2">{label}</p>
        <div className="text-[15px]">{children}</div>
      </div>
    </div>
  )
}

const STATUS: Record<NonNullable<WeeklyReview['status']>, string> = {
  on: 'Im Zielbereich',
  below: 'Unter dem Zielbereich',
  above: 'Über dem Zielbereich',
  fast: 'Schneller als empfohlen',
}

export function WeeklyReviewCard({ review, onDismiss }: { review: WeeklyReview; onDismiss?: () => void }) {
  const toast = useToast()
  const r = review
  const band = r.band ? `${r.band[0] > 0 ? '+' : ''}${fmt2(r.band[0])} bis ${r.band[1] > 0 ? '+' : ''}${fmt2(r.band[1])} % pro Woche` : null
  return (
    <Card className="animate-rise !p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[13px] font-semibold text-ink-2">
            {formatDayShort(r.week)} bis {formatDayShort(addDays(r.week, 6))}
          </p>
          <p className="text-title2">Wochenrückblick</p>
        </div>
        {onDismiss && (
          <IconButton label="Rückblick schließen" className="-mr-2 -mt-1 size-9 text-ink-3" onClick={onDismiss}>
            <IconX size={18} />
          </IconButton>
        )}
      </div>
      <div className="mt-1 divide-y divide-line">
        <Row icon={<IconScale size={17} />} tone="body" label="Gewichtstrend">
          {r.weightChangeKg != null ? (
            <>
              <span className="font-semibold tabular-nums">
                {r.weightChangeKg >= 0 ? '+' : ''}
                {fmt1(r.weightChangeKg)} kg
              </span>
              {r.rate != null && <span className="text-ink-2"> · {`${r.rate > 0 ? '+' : ''}${fmt2(Math.round(r.rate * 100) / 100)} % pro Woche`}</span>}
              {r.status && (
                <span className={`mt-1 flex items-center gap-1 text-[13px] font-semibold ${r.status === 'on' ? 'text-brand-ink' : 'text-warn-ink'}`}>
                  {r.status === 'on' ? <IconCheckCircle size={14} /> : <IconAlert size={14} />}
                  {STATUS[r.status]}
                  {band && <span className="font-normal text-ink-2"> (Ziel {band})</span>}
                </span>
              )}
            </>
          ) : (
            <span className="text-ink-2">Zu wenige Messungen</span>
          )}
        </Row>
        <Row icon={<IconFood size={17} />} tone="food" label="Essen">
          {r.adherence ? (
            <span>
              <b className="tabular-nums">{r.adherence.onTarget}</b> von {r.adherence.logged} erfassten Tagen im Ziel
            </span>
          ) : (
            <span className="text-ink-2">Nichts erfasst</span>
          )}
        </Row>
        <Row icon={<IconTrain size={17} />} tone="train" label="Sätze pro Muskel">
          {!r.trained ? (
            <span className="text-ink-2">Kein Training erfasst</span>
          ) : r.lowGroups.length ? (
            <span>
              Unter 10: {r.lowGroups.map((g) => `${GROUP_LABEL[g.group]} ${fmt1(g.sets).replace(/,0$/, '')}`).join(', ')}
            </span>
          ) : (
            <span>Jede Gruppe mit 10 Sätzen oder mehr</span>
          )}
        </Row>
        {(r.avgSleepMin != null || r.avgSteps != null) && (
          <Row icon={r.avgSleepMin != null ? <IconMoon size={17} /> : <IconFootprints size={17} />} tone="indigo" label="Schlaf und Schritte">
            {[r.avgSleepMin != null ? `${fmtSleep(r.avgSleepMin)} pro Nacht` : null, r.avgSteps != null ? `${fmtInt(r.avgSteps)} Schritte am Tag` : null].filter(Boolean).join(' · ')}
          </Row>
        )}
        {r.cardioMin > 0 && (
          <Row icon={<IconTimer size={17} />} tone="train" label="Cardio">
            {fmtInt(r.cardioMin)} von 150 moderaten Minuten (WHO)
          </Row>
        )}
      </div>
      {r.suggestion && (
        <div className="mt-2 rounded-[18px] bg-fill p-3">
          <p className="flex items-start gap-2 text-[15px]">
            <IconSparkle size={17} className="mt-0.5 shrink-0 text-brand-ink" />
            {r.suggestion.text}
          </p>
          {r.suggestion.kcalDelta != null && (
            <Button
              size="sm"
              className="mt-2"
              onClick={async () => {
                await applyKcalChange(r.suggestion!.kcalDelta!)
                haptic('success')
                toast({ message: `Kalorienziel ab heute um ${Math.abs(r.suggestion!.kcalDelta!)} kcal ${r.suggestion!.kcalDelta! > 0 ? 'erhöht' : 'gesenkt'}` })
                onDismiss?.()
              }}
            >
              {r.suggestion.kcalDelta > 0 ? '+' : '−'}
              {Math.abs(r.suggestion.kcalDelta)} kcal übernehmen
            </Button>
          )}
        </div>
      )}
    </Card>
  )
}
