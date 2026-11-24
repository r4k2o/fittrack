import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { useSetting, useTarget, useToday } from '../../hooks'
import { daysBetween, formatDate, localDay } from '../../lib/dates'
import { listImports } from '../../store/health'
import { fmt1, fmtInt } from '../../lib/format'
import { GOALS } from '../../lib/nutrition'
import { latestMetric } from '../../store/metrics'
import { getActiveGoal } from '../../store/profile'
import { IconChevronRight, IconFood, IconHeart, IconInfo, IconPhone, IconScale, IconShield, IconTarget, IconTrain, IconUser } from '../../ui/icons'
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
  const lastImport = useLiveQuery(async () => (await listImports())[0] ?? null, [])
  const go = (to: string) => navigate(to)

  const backupAge = lastBackupAt ? daysBetween(localDay(new Date(lastBackupAt)), today) : null
  const checks = deviceCheck ? Object.values(deviceCheck.results) : []

  return (
    <Screen tone="neutral" title="More">
      <Card tone="brand" onClick={() => go('/more/profile')} className="animate-rise !p-5">
        <div className="flex items-center gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-full btn-primary">
            <IconUser size={28} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-ink-2">Your plan</p>
            <p className="truncate text-[20px] font-bold tracking-tight">{goal ? GOALS[goal.type].label : 'No goal yet'}</p>
            <p className="truncate text-[14px] text-ink-2">{[weight ? `${fmt1(weight.value)} kg` : null, target ? `${fmtInt(target.kcal)} kcal a day` : null].filter(Boolean).join(' · ')}</p>
          </div>
          <IconChevronRight size={18} className="text-ink-3" />
        </div>
        {target && (
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              { label: 'Protein', g: target.proteinG, c: 'var(--protein)' },
              { label: 'Carbs', g: target.carbsG, c: 'var(--carbs)' },
              { label: 'Fat', g: target.fatG, c: 'var(--fat)' },
            ].map((m) => (
              <div key={m.label} className="rounded-[18px] bg-surface/70 py-2">
                <div className="text-[17px] font-bold">{m.g} g</div>
                <div className="flex items-center justify-center gap-1 text-[12px] font-semibold text-ink-2">
                  <span className="size-2 rounded-full" style={{ background: m.c }} />
                  {m.label}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <SectionTitle>Plan</SectionTitle>
      <Group>
        <ListRow icon={<IconTarget size={18} />} iconTone="brand" title="Targets" subtitle="Calories, macros and why" onClick={() => go('/more/targets')} />
        <ListRow icon={<IconUser size={18} />} iconTone="pink" title="Profile and goal" subtitle="Body data, goal, activity" onClick={() => go('/more/profile')} />
      </Group>

      <SectionTitle>Data</SectionTitle>
      <Group>
        <ListRow
          icon={<IconShield size={18} />}
          iconTone="amber"
          title="Backup and restore"
          subtitle={backupAge == null ? 'No backup yet' : backupAge === 0 ? 'Last backup today' : `Last backup ${backupAge} ${backupAge === 1 ? 'day' : 'days'} ago`}
          onClick={() => go('/more/backup')}
        />
        <ListRow
          icon={<IconFood size={18} />}
          iconTone="food"
          title="Food list and my foods"
          subtitle={foodList ? `${foodList.name} · ${fmtInt(foodList.count)} foods` : 'No food list imported'}
          onClick={() => go('/more/foods')}
        />
        <ListRow icon={<IconHeart size={18} />} iconTone="pink" title="Apple Health" subtitle={lastImport ? `Last import ${formatDate(lastImport.createdAt.slice(0, 10))}` : 'Steps, weight, sleep and workouts'} onClick={() => go('/more/health')} />
        <ListRow icon={<IconTrain size={18} />} iconTone="train" title="Exercises" subtitle="Library, load steps, your own" onClick={() => go('/train/exercises')} />
      </Group>

      <SectionTitle>This phone</SectionTitle>
      <Group>
        <ListRow
          icon={<IconPhone size={18} />}
          iconTone="slate"
          title="Device check"
          subtitle={deviceCheck ? `${checks.filter((c) => c.ok).length} of ${checks.length} checks passed` : 'Run it before entering real data'}
          onClick={() => go('/more/device-check')}
        />
        <ListRow icon={<IconInfo size={18} />} iconTone="indigo" title="About and disclaimer" subtitle={`Version ${__APP_VERSION__}`} onClick={() => go('/more/about')} />
      </Group>

      <SectionTitle>Coming in later phases</SectionTitle>
      <Group className="opacity-60">
        <ListRow icon={<IconScale size={18} />} iconTone="indigo" title="Photo logging" subtitle="Meal photo to foods, with your own key" chevron={false} />
      </Group>
    </Screen>
  )
}
