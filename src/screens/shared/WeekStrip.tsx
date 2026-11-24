import type { Meal } from '../../db'
import { addDays, parseDay, weekStart } from '../../lib/dates'
import { IconApple, IconChevronLeft, IconChevronRight, IconMoon, IconSun, IconSunrise } from '../../ui/icons'
import { cx, IconButton, IconTile, type IconTone } from '../../ui/kit'

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/** A week of days: tap one to select it; arrows move a week. Dots mark days with data. */
export function WeekStrip({
  selected,
  today,
  onSelect,
  marked,
  onWeek,
}: {
  selected: string
  today: string
  onSelect?: (day: string) => void
  marked?: ReadonlySet<string>
  onWeek?: (monday: string) => void
}) {
  const monday = weekStart(selected)
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  return (
    <div className="card flex items-center gap-0.5 !rounded-[24px] p-1.5">
      {onWeek && (
        <IconButton label="Previous week" className="size-9 text-ink-2" onClick={() => onWeek(addDays(monday, -7))}>
          <IconChevronLeft size={18} />
        </IconButton>
      )}
      <div className="grid flex-1 grid-cols-7 gap-0.5">
        {days.map((d, i) => {
          const isSel = d === selected
          const isToday = d === today
          const inner = (
            <>
              <span className={cx('text-[11px] font-semibold', isSel ? 'text-page/70' : 'text-ink-3')}>{LETTERS[i]}</span>
              <span className={cx('text-[17px] font-bold leading-tight', isSel ? 'text-page' : isToday ? 'text-brand-ink' : 'text-ink')}>{parseDay(d).getDate()}</span>
              <span className={cx('mt-0.5 size-1 rounded-full', marked?.has(d) ? (isSel ? 'bg-page' : 'bg-ink-3') : 'bg-transparent')} />
            </>
          )
          const cls = cx('flex flex-col items-center rounded-[18px] py-1.5 transition-colors duration-200', isSel ? 'bg-ink' : onSelect && 'active:bg-fill')
          return onSelect ? (
            <button key={d} type="button" aria-label={`${NAMES[i]} ${parseDay(d).getDate()}`} aria-pressed={isSel} className={cls} onClick={() => onSelect(d)}>
              {inner}
            </button>
          ) : (
            <div key={d} className={cls}>
              {inner}
            </div>
          )
        })}
      </div>
      {onWeek && (
        <IconButton label="Next week" className="size-9 text-ink-2" onClick={() => onWeek(addDays(monday, 7))}>
          <IconChevronRight size={18} />
        </IconButton>
      )}
    </div>
  )
}

const MEAL_TONE: Record<Meal, IconTone> = {
  breakfast: 'amber',
  lunch: 'food',
  dinner: 'indigo',
  snacks: 'pink',
}

export function MealIcon({ meal, size = 32 }: { meal: Meal; size?: number }) {
  const glyph = size * 0.56
  const Icon = meal === 'breakfast' ? IconSunrise : meal === 'lunch' ? IconSun : meal === 'dinner' ? IconMoon : IconApple
  return (
    <IconTile tone={MEAL_TONE[meal]} size={size}>
      <Icon size={glyph} strokeWidth={2.2} />
    </IconTile>
  )
}
