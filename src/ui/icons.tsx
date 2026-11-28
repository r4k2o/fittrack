// A small inline icon set (24 × 24, stroke icons), so the app needs no icon font.

import type { ReactNode, SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function base(size: number, props: SVGProps<SVGSVGElement>) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    ...props,
  }
}

const make = (paths: ReactNode) =>
  function Icon({ size = 22, ...props }: IconProps) {
    return <svg {...base(size, props)}>{paths}</svg>
  }

export const IconToday = make(
  <>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 4a8 8 0 0 1 8 8" strokeWidth="3" />
  </>,
)
export const IconFood = make(
  <>
    <path d="M7 3v8a2 2 0 0 0 4 0V3M9 11v10" />
    <path d="M17 3c-1.7 1.2-2.5 3.3-2.5 6.2V13H17v8" />
  </>,
)
export const IconTrain = make(
  <>
    <path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11" />
  </>,
)
export const IconProgress = make(
  <>
    <path d="M4 19h16" />
    <path d="M5 15l4-5 4 3 6-7" />
  </>,
)
export const IconMore = make(
  <>
    <circle cx="5" cy="12" r="1.2" fill="currentColor" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    <circle cx="19" cy="12" r="1.2" fill="currentColor" />
  </>,
)
export const IconPlus = make(<path d="M12 5v14M5 12h14" />)
export const IconMinus = make(<path d="M5 12h14" />)
export const IconCheck = make(<path d="M5 12.5l4.5 4.5L19 7.5" />)
export const IconX = make(<path d="M6 6l12 12M18 6L6 18" />)
export const IconChevronLeft = make(<path d="M15 5l-7 7 7 7" />)
export const IconChevronRight = make(<path d="M9 5l7 7-7 7" />)
export const IconChevronDown = make(<path d="M5 9l7 7 7-7" />)
export const IconSearch = make(
  <>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </>,
)
export const IconBarcode = make(
  <>
    <path d="M4 7V5h3M17 5h3v2M20 17v2h-3M7 19H4v-2" />
    <path d="M8 9v6M11 9v6M13.5 9v6M16 9v6" />
  </>,
)
export const IconBolt = make(<path d="M13 3L5 13.5h6L10 21l8-10.5h-6L13 3z" />)
export const IconCamera = make(
  <>
    <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5v-9z" />
    <circle cx="12" cy="13" r="3.5" />
  </>,
)
export const IconKeyboard = make(
  <>
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10" />
  </>,
)
export const IconTrash = make(<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />)
export const IconCopy = make(
  <>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a1 1 0 0 1 1-1h9" />
  </>,
)
export const IconEdit = make(<path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />)
export const IconClock = make(
  <>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v4l3 2" />
  </>,
)
export const IconWarn = make(
  <>
    <path d="M12 4l9 16H3l9-16z" />
    <path d="M12 10v4M12 17h.01" />
  </>,
)
export const IconInfo = make(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5M12 8h.01" />
  </>,
)
export const IconShare = make(
  <>
    <path d="M12 15V4M8 8l4-4 4 4" />
    <path d="M6 12v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7" />
  </>,
)
export const IconUpload = make(
  <>
    <path d="M12 4v11M8 11l4 4 4-4" />
    <path d="M5 19h14" />
  </>,
)
export const IconStar = make(<path d="M12 4l2.4 5 5.6.7-4.1 3.8 1.1 5.5L12 16.3 7 19l1.1-5.5L4 9.7 9.6 9 12 4z" />)
export const IconDots = make(
  <>
    <circle cx="12" cy="5" r="1.3" fill="currentColor" />
    <circle cx="12" cy="12" r="1.3" fill="currentColor" />
    <circle cx="12" cy="19" r="1.3" fill="currentColor" />
  </>,
)
export const IconScale = make(
  <>
    <rect x="4" y="4" width="16" height="16" rx="4" />
    <path d="M9 9.5a4 4 0 0 1 6 0l-2 2.5" />
  </>,
)
export const IconRepeat = make(
  <>
    <path d="M17 3l3 3-3 3" />
    <path d="M4 12V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3" />
    <path d="M20 12v3a3 3 0 0 1-3 3H4" />
  </>,
)
export const IconTrophy = make(
  <>
    <path d="M8 4h8v5a4 4 0 0 1-8 0V4zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8M9.5 17h5" />
  </>,
)
export const IconPhone = make(
  <>
    <rect x="7" y="3" width="10" height="18" rx="2" />
    <path d="M11 18h2" />
  </>,
)
export const IconDatabase = make(
  <>
    <ellipse cx="12" cy="6" rx="7" ry="3" />
    <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
  </>,
)
export const IconSun = make(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </>,
)
export const IconUser = make(
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </>,
)
export const IconTarget = make(
  <>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="12" cy="12" r="0.8" fill="currentColor" />
  </>,
)
export const IconList = make(<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />)
export const IconShield = make(<path d="M12 3l7 3v6c0 4.4-3 7.8-7 9-4-1.2-7-4.6-7-9V6l7-3z" />)
export const IconAlert = make(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5v5.5M12 16.5h.01" />
  </>,
)
export const IconCheckCircle = make(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M8.5 12.2l2.4 2.4 4.6-5" />
  </>,
)
export const IconFlame = make(<path d="M12 21c3.9 0 6.5-2.6 6.5-6.3 0-3.3-2.2-5.3-3.6-7.2-.4 1.6-1.2 2.6-2.4 3.2.3-2.9-1-5.6-3.5-7.7.2 2.9-1.4 4.8-2.9 6.6C4.9 11.1 5.5 13.1 5.5 14.7 5.5 18.4 8.1 21 12 21z" />)
export const IconSunrise = make(
  <>
    <path d="M5 17a7 7 0 0 1 14 0" />
    <path d="M3 21h18M12 3v4M5.6 8.6l1.4 1.4M18.4 8.6L17 10M2 17h1.5M20.5 17H22" />
  </>,
)
export const IconMoon = make(<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />)
export const IconApple = make(
  <>
    <path d="M12 7.5c-1.4-1-3.1-1.3-4.6-.6C4.9 8 4 11.4 5.2 14.8 6.3 18 8.5 20.5 10.4 20c.6-.2 1-.4 1.6-.4s1 .2 1.6.4c1.9.5 4.1-2 5.2-5.2 1.2-3.4.3-6.8-2.2-7.9-1.5-.7-3.2-.4-4.6.6z" />
    <path d="M12 7.5c0-2 .8-3.5 2.5-4.5" />
  </>,
)
export const IconCalendar = make(
  <>
    <rect x="4" y="5" width="16" height="15" rx="3" />
    <path d="M4 10h16M8.5 3v4M15.5 3v4" />
  </>,
)
export const IconTrendUp = make(<path d="M4 16.5l5.5-5.5 3.5 3.5L20 7.5M14.5 7.5H20V13" />)
export const IconTrendDown = make(<path d="M4 7.5l5.5 5.5 3.5-3.5 7 7M14.5 16.5H20V11" />)
export const IconTrendFlat = make(<path d="M4 12h15M15 8l4 4-4 4" />)
export const IconPlay = make(<path d="M8 5.5v13l10.5-6.5L8 5.5z" fill="currentColor" stroke="none" />)
export const IconTimer = make(
  <>
    <circle cx="12" cy="13.5" r="7" />
    <path d="M12 10v4l2.5 1.5M9.5 3h5M19 6.5l-1.3 1.3" />
  </>,
)
export const IconArrowRight = make(<path d="M5 12h14M13 6l6 6-6 6" />)
export const IconGear = make(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </>,
)
export const IconLock = make(
  <>
    <rect x="5" y="11" width="14" height="10" rx="2.5" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </>,
)
export const IconWifiOff = make(<path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 5-2.6M14.5 9.9A10 10 0 0 1 19 12.5M2 8.8a15 15 0 0 1 4.3-2.6M10.4 5.1A15 15 0 0 1 22 8.8M12 20h.01" />)
export const IconZap = make(<path d="M13 2.5L4.5 13.5H12l-1 8 8.5-11H12l1-8z" />)
export const IconHeart = make(<path d="M12 20s-7-4.4-9.2-9A5 5 0 0 1 12 6.2 5 5 0 0 1 21.2 11C19 15.6 12 20 12 20z" />)
export const IconFootprints = make(
  <>
    <path d="M7.5 3.5c1.7 0 2.8 1.9 2.6 4.6-.2 2.3-1.3 3.4-2.7 3.4S5 10.4 4.9 8.1C4.7 5.4 5.8 3.5 7.5 3.5zM5.5 14h4.2l-.3 2.6a2 2 0 0 1-3.9 0z" />
    <path d="M16.5 7.5c1.7 0 2.8 1.9 2.6 4.6-.2 2.3-1.3 3.4-2.7 3.4s-2.4-1.1-2.5-3.4c-.2-2.7.9-4.6 2.6-4.6zM14.5 18h4.2l-.3 2.6a2 2 0 0 1-3.9 0z" />
  </>,
)
export const IconBed = make(<path d="M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5M7 11.5a1.5 1.5 0 1 0 0-.01" />)
export const IconImage = make(
  <>
    <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="M20.5 16l-5-5L6 19.5" />
  </>,
)
export const IconSparkle = make(<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" />)
export const IconHome = make(
  <>
    <path d="M4 10.5L12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-5.5h-6v5.5H5.5A1.5 1.5 0 0 1 4 19z" />
  </>,
)
/** Back to the current day: a curved arrow. */
export const IconReturn = make(<path d="M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />)
