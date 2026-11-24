import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { useSetting, useTarget, useToday } from '../../hooks'
import { daysBetween, localDay } from '../../lib/dates'
import { fmt1, fmtInt } from '../../lib/format'
import { GOALS } from '../../lib/nutrition'
import { latestMetric } from '../../store/metrics'
import { getActiveGoal } from '../../store/profile'
import { IconDatabase, IconFood, IconInfo, IconPhone, IconShield, IconTarget, IconTrain, IconUser } from '../../ui/icons'
import { Group, ListRow, Screen, SectionTitle } from '../../ui/kit'

export default function More() {
  const navigate = useNavigate()
  const today = useToday()
  const target = useTarget(today)
  const goal = useLiveQuery(() => getActiveGoal())
  const weight = useLiveQuery(() => latestMetric('weight'))
  const lastBackupAt = useSetting('lastBackupAt')
  const foodList = useSetting('foodList')
  const deviceCheck = useSetting('deviceCheck')

  const backupAge = lastBackupAt ? daysBetween(localDay(new Date(lastBackupAt)), today) : null
  const checks = deviceCheck ? Object.values(deviceCheck.results) : []

  return (
    <Screen title="More">
      <SectionTitle>You</SectionTitle>
      <Group>
        <ListRow
          icon={<IconUser size={20} />}
          title="Profile and goal"
          subtitle={[goal ? GOALS[goal.type].label : null, weight ? `${fmt1(weight.value)} kg` : null].filter(Boolean).join(' · ')}
          onClick={() => navigate('/more/profile')}
        />
        <ListRow
          icon={<IconTarget size={20} />}
          title="Targets"
          subtitle={target ? `${fmtInt(target.kcal)} kcal · P ${target.proteinG} · C ${target.carbsG} · F ${target.fatG} g` : 'Not set'}
          onClick={() => navigate('/more/targets')}
        />
      </Group>

      <SectionTitle>Data</SectionTitle>
      <Group>
        <ListRow
          icon={<IconShield size={20} />}
          title="Backup and restore"
          subtitle={backupAge == null ? 'No backup yet' : backupAge === 0 ? 'Last backup today' : `Last backup ${backupAge} ${backupAge === 1 ? 'day' : 'days'} ago`}
          onClick={() => navigate('/more/backup')}
        />
        <ListRow
          icon={<IconFood size={20} />}
          title="Food list and my foods"
          subtitle={foodList ? `${foodList.name} · ${fmtInt(foodList.count)} foods` : 'No food list imported'}
          onClick={() => navigate('/more/foods')}
        />
        <ListRow icon={<IconTrain size={20} />} title="Exercises" subtitle="Library, load steps, your own" onClick={() => navigate('/train/exercises')} />
      </Group>

      <SectionTitle>This phone</SectionTitle>
      <Group>
        <ListRow
          icon={<IconPhone size={20} />}
          title="Device check"
          subtitle={deviceCheck ? `${checks.filter((c) => c.ok).length} of ${checks.length} checks passed` : 'Run it before entering real data'}
          onClick={() => navigate('/more/device-check')}
        />
        <ListRow icon={<IconInfo size={20} />} title="About and disclaimer" subtitle={`Version ${__APP_VERSION__}`} onClick={() => navigate('/more/about')} />
      </Group>

      <SectionTitle>Later phases</SectionTitle>
      <Group>
        <ListRow icon={<IconDatabase size={20} />} title="Apple Health import" subtitle="Steps, weight, body fat and sleep from a Shortcut file" chevron={false} className="opacity-50" />
        <ListRow icon={<IconDatabase size={20} />} title="Photo logging" subtitle="Your own key on a vision API, optional" chevron={false} className="opacity-50" />
      </Group>
    </Screen>
  )
}
