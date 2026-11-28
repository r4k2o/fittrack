import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { useSetting, useTarget, useToday } from '../../hooks'
import { daysBetween, formatDate, localDay } from '../../lib/dates'
import { listImports } from '../../store/health'
import { fmt1, fmtInt } from '../../lib/format'
import { GOALS } from '../../lib/nutrition'
import { latestMetric } from '../../store/metrics'
import { getActiveGoal } from '../../store/profile'
import { IconCamera, IconChevronRight, IconFood, IconHeart, IconImage, IconInfo, IconList, IconPhone, IconShield, IconTarget, IconTimer, IconTrain, IconUser } from '../../ui/icons'
import { activePlan } from '../../store/plans'
import { PROVIDERS } from '../../lib/ai'
import { Card, Group, ListRow, Screen, SectionTitle } from '../../ui/kit'

export default function More() {
  const navigate = useNavigate()
  const today = useToday()
  const target = useTarget(today)
  const goal = useLiveQuery(() => getActiveGoal())
  const weight = useLiveQuery(() => latestMetric('weight'))
  const lastBackupAt = useSetting('lastBackupAt')
  const foodList = useSetting('foodList')
  const deviceCheck = useSetting('deviceCheck')
  const aiKey = useSetting('aiApiKey')
  const plan = useLiveQuery(async () => (await activePlan()) ?? null, [])
  const aiProvider = useSetting('aiProvider')
  const lastImport = useLiveQuery(async () => (await listImports())[0] ?? null, [])
  const go = (to: string) => navigate(to)

  const backupAge = lastBackupAt ? daysBetween(localDay(new Date(lastBackupAt)), today) : null
  const checks = deviceCheck ? Object.values(deviceCheck.results) : []

  return (
    <Screen title="Mehr">
      <Card onClick={() => go('/more/profile')} className="animate-rise !p-4">
        <div className="flex items-center gap-3.5">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-fill">
            <IconUser size={24} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[18px] font-semibold tracking-tight">{goal ? GOALS[goal.type].label : 'Noch kein Ziel'}</p>
            <p className="truncate text-[14px] text-ink-2">{[weight ? `${fmt1(weight.value)} kg` : null, target ? `${fmtInt(target.kcal)} kcal am Tag` : null].filter(Boolean).join(' · ')}</p>
          </div>
          <IconChevronRight size={18} className="text-ink-3" />
        </div>
        {target && (
          <div className="mt-3.5 grid grid-cols-3 gap-2 text-center">
            {[
              { label: 'Eiweiß', g: target.proteinG, c: 'var(--protein)' },
              { label: 'Kohlenh.', g: target.carbsG, c: 'var(--carbs)' },
              { label: 'Fett', g: target.fatG, c: 'var(--fat)' },
            ].map((m) => (
              <div key={m.label} className="rounded-[14px] bg-fill py-2">
                <div className="text-[16px] font-bold tabular-nums">{m.g} g</div>
                <div className="flex items-center justify-center gap-1 text-[12px] font-semibold text-ink-2">
                  <span className="size-2 rounded-full" style={{ background: m.c }} />
                  {m.label}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <SectionTitle>Ziele und Plan</SectionTitle>
      <Group>
        <ListRow icon={<IconTarget size={18} />} title="Kalorien und Makros" onClick={() => go('/more/targets')} />
        <ListRow icon={<IconUser size={18} />} title="Profil und Ziel" onClick={() => go('/more/profile')} />
        <ListRow
          icon={<IconTrain size={18} />}
          title="Trainingsplan"
          subtitle={plan ? plan.plan.name : 'Noch keiner'}
          onClick={() => go(plan ? '/train/plan' : '/train/plan/new')}
        />
      </Group>

      <SectionTitle>Erfassen</SectionTitle>
      <Group>
        <ListRow icon={<IconHeart size={18} />} title="Apple Health" subtitle={lastImport ? `Letzter Import ${formatDate(lastImport.createdAt.slice(0, 10))}` : undefined} onClick={() => go('/more/health')} />
        <ListRow icon={<IconCamera size={18} />} title="Foto-Erfassung" subtitle={aiKey ? PROVIDERS[aiProvider ?? 'gemini'].label : 'Aus'} onClick={() => go('/more/ai')} />
        <ListRow icon={<IconList size={18} />} title="Rezepte und Mahlzeiten" onClick={() => go('/food/add?tab=recipes')} />
        <ListRow icon={<IconTimer size={18} />} title="Cardio" onClick={() => go('/train/cardio')} />
        <ListRow icon={<IconImage size={18} />} title="Fortschrittsfotos" onClick={() => go('/progress?tab=photos')} />
      </Group>

      <SectionTitle>Daten</SectionTitle>
      <Group>
        <ListRow
          icon={<IconShield size={18} />}
          title="Backup"
          subtitle={backupAge == null ? 'Noch kein Backup' : backupAge === 0 ? 'Heute gesichert' : `Vor ${backupAge} ${backupAge === 1 ? 'Tag' : 'Tagen'} gesichert`}
          onClick={() => go('/more/backup')}
        />
        <ListRow icon={<IconFood size={18} />} title="Lebensmittel" subtitle={foodList ? `${foodList.name} · ${fmtInt(foodList.count)}` : 'Keine Liste importiert'} onClick={() => go('/more/foods')} />
        <ListRow icon={<IconTrain size={18} />} title="Übungen" onClick={() => go('/train/exercises')} />
      </Group>

      <SectionTitle>Dieses iPhone</SectionTitle>
      <Group>
        <ListRow
          icon={<IconPhone size={18} />}
          title="Gerätetest"
          subtitle={deviceCheck ? `${checks.filter((c) => c.ok).length} von ${checks.length} bestanden` : 'Vor echten Daten einmal ausführen'}
          onClick={() => go('/more/device-check')}
        />
        <ListRow icon={<IconInfo size={18} />} title="Info und Hinweise" subtitle={`Version ${__APP_VERSION__}`} onClick={() => go('/more/about')} />
      </Group>
    </Screen>
  )
}
