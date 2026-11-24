import { lazy, Suspense, useEffect } from 'react'
import { createHashRouter, Navigate, NavLink, Outlet, RouterProvider, useLocation } from 'react-router-dom'
import { useSetting } from './hooks'
import Onboarding from './screens/onboarding/Onboarding'
import Today from './screens/Today'
import AddFood from './screens/food/AddFood'
import Diary from './screens/food/Diary'
import FoodForm from './screens/food/FoodForm'
import QuickAdd from './screens/food/QuickAdd'
import About from './screens/more/About'
import More from './screens/more/More'
import Profile from './screens/more/Profile'
import Targets from './screens/more/Targets'
import ExerciseLibrary from './screens/train/ExerciseLibrary'
import Session from './screens/train/Session'
import Summary from './screens/train/Summary'
import Train from './screens/train/Train'
import { seedExercises } from './store/seed'
import { getSetting, setSetting } from './store/settings'
import { IconFood, IconMore, IconProgress, IconToday, IconTrain } from './ui/icons'
import { cx, Spinner } from './ui/kit'
import { ToastProvider } from './ui/toast'

// Heavier screens load on first use: the barcode decoder, charts and zip handling.
const Scanner = lazy(() => import('./screens/food/Scanner'))
const Progress = lazy(() => import('./screens/progress/Progress'))
const Backup = lazy(() => import('./screens/more/Backup'))
const FoodList = lazy(() => import('./screens/more/FoodList'))
const DeviceCheck = lazy(() => import('./screens/more/DeviceCheck'))

const TABS = [
  { to: '/today', label: 'Today', Icon: IconToday },
  { to: '/food', label: 'Food', Icon: IconFood },
  { to: '/train', label: 'Train', Icon: IconTrain },
  { to: '/progress', label: 'Progress', Icon: IconProgress },
  { to: '/more', label: 'More', Icon: IconMore },
] as const

/** Full-screen flows hide the tab bar. */
const NO_TABS = [/^\/welcome/, /^\/food\/scan/, /^\/train\/session\//]

function TabBar() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-canvas/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
      <div className="mx-auto flex max-w-xl">
        {TABS.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => cx('flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold', isActive ? 'text-accent' : 'text-faint')}
          >
            <Icon size={24} />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center text-muted">
      <Spinner />
    </div>
  )
}

function Root() {
  const onboardingDone = useSetting('onboardingDone')
  const { pathname } = useLocation()

  useEffect(() => {
    void (async () => {
      if (!(await getSetting('firstRunAt'))) await setSetting('firstRunAt', new Date().toISOString())
      await seedExercises()
    })()
  }, [])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  // The stored setting is the only thing that routes between onboarding and the app:
  // onboarding just saves it, and this redirect follows once the saved value is read
  // back, so a stale value can never bounce a finished onboarding back to its start.
  if (onboardingDone === undefined) return <Splash />
  const onWelcome = pathname.startsWith('/welcome')
  if (!onboardingDone && !onWelcome) return <Navigate to="/welcome" replace />
  if (onboardingDone && onWelcome) return <Navigate to="/today" replace />
  const showTabs = onboardingDone && !NO_TABS.some((r) => r.test(pathname))
  return (
    <>
      <Suspense fallback={<Splash />}>
        <Outlet />
      </Suspense>
      {showTabs && <TabBar />}
    </>
  )
}

const router = createHashRouter([
  {
    path: '/',
    element: <Root />,
    children: [
      { index: true, element: <Navigate to="/today" replace /> },
      { path: 'welcome', element: <Onboarding /> },
      { path: 'today', element: <Today /> },
      { path: 'food', element: <Diary /> },
      { path: 'food/add', element: <AddFood /> },
      { path: 'food/scan', element: <Scanner /> },
      { path: 'food/quick', element: <QuickAdd /> },
      { path: 'food/new', element: <FoodForm /> },
      { path: 'food/edit/:foodId', element: <FoodForm /> },
      { path: 'train', element: <Train /> },
      { path: 'train/session/:id', element: <Session /> },
      { path: 'train/summary/:id', element: <Summary /> },
      { path: 'train/exercises', element: <ExerciseLibrary /> },
      { path: 'progress', element: <Progress /> },
      { path: 'more', element: <More /> },
      { path: 'more/profile', element: <Profile /> },
      { path: 'more/targets', element: <Targets /> },
      { path: 'more/backup', element: <Backup /> },
      { path: 'more/foods', element: <FoodList /> },
      { path: 'more/device-check', element: <DeviceCheck /> },
      { path: 'more/about', element: <About /> },
      { path: '*', element: <Navigate to="/today" replace /> },
    ],
  },
])

export default function App() {
  return (
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>
  )
}
