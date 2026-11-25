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
import { haptic } from './ui/motion'
import { ToastProvider } from './ui/toast'

// Heavier screens load on first use: the barcode decoder, charts and zip handling.
const Scanner = lazy(() => import('./screens/food/Scanner'))
const Progress = lazy(() => import('./screens/progress/Progress'))
const Backup = lazy(() => import('./screens/more/Backup'))
const FoodList = lazy(() => import('./screens/more/FoodList'))
const DeviceCheck = lazy(() => import('./screens/more/DeviceCheck'))
const NewPlan = lazy(() => import('./screens/train/plan/NewPlan'))
const RecipeEditor = lazy(() => import('./screens/food/RecipeEditor'))
const HealthImport = lazy(() => import('./screens/more/HealthImport'))
const AiSettings = lazy(() => import('./screens/more/AiSettings'))
const PhotoLog = lazy(() => import('./screens/food/PhotoLog'))
const Compare = lazy(() => import('./screens/progress/Compare'))
const PhotoCapture = lazy(() => import('./screens/progress/photos/PhotoCapture'))
const PhotoViewer = lazy(() => import('./screens/progress/photos/PhotoViewer'))
const PhotoCompare = lazy(() => import('./screens/progress/photos/PhotoCompare'))
const Cardio = lazy(() => import('./screens/train/Cardio'))
const CardioForm = lazy(() => import('./screens/train/CardioForm'))
const PlanEditor = lazy(() => import('./screens/train/plan/PlanEditor'))

const TABS = [
  { to: '/today', label: 'Today', Icon: IconToday },
  { to: '/food', label: 'Food', Icon: IconFood },
  { to: '/train', label: 'Train', Icon: IconTrain },
  { to: '/progress', label: 'Progress', Icon: IconProgress },
  { to: '/more', label: 'More', Icon: IconMore },
] as const

/** Full-screen flows hide the tab bar. */
const NO_TABS = [/^\/welcome/, /^\/food\/scan/, /^\/train\/session\//, /^\/train\/plan\/new/, /^\/food\/recipe\//, /^\/train\/cardio\/./, /^\/progress\/photos\/new/, /^\/food\/photo/]

function TabBar() {
  return (
    <nav aria-label="Main" className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
      <div className="glass shadow-float pointer-events-auto mx-auto flex max-w-md items-stretch gap-1 rounded-[30px] p-1.5">
        {TABS.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={() => haptic()}
            className={({ isActive }) =>
              cx(
                'press flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 rounded-[24px] text-[10.5px] font-semibold tracking-wide transition-colors',
                isActive ? 'bg-fill text-ink' : 'text-ink-3',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={23} strokeWidth={isActive ? 2.4 : 2} className={isActive ? 'text-brand-ink' : undefined} />
                {label}
              </>
            )}
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
        {/* a quick fade on each page change; opacity only, so fixed elements inside stay put */}
        <div key={pathname} className="animate-page">
          <Outlet />
        </div>
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
      { path: 'food/photo', element: <PhotoLog /> },
      { path: 'food/recipe/new', element: <RecipeEditor /> },
      { path: 'food/recipe/:id', element: <RecipeEditor /> },
      { path: 'train', element: <Train /> },
      { path: 'train/session/:id', element: <Session /> },
      { path: 'train/summary/:id', element: <Summary /> },
      { path: 'train/exercises', element: <ExerciseLibrary /> },
      { path: 'train/plan', element: <PlanEditor /> },
      { path: 'train/plan/new', element: <NewPlan /> },
      { path: 'train/cardio', element: <Cardio /> },
      { path: 'train/cardio/new', element: <CardioForm /> },
      { path: 'train/cardio/:id', element: <CardioForm /> },
      { path: 'progress', element: <Progress /> },
      { path: 'progress/compare', element: <Compare /> },
      { path: 'progress/photos/new', element: <PhotoCapture /> },
      { path: 'progress/photos/compare', element: <PhotoCompare /> },
      { path: 'progress/photos/:id', element: <PhotoViewer /> },
      { path: 'more', element: <More /> },
      { path: 'more/profile', element: <Profile /> },
      { path: 'more/targets', element: <Targets /> },
      { path: 'more/backup', element: <Backup /> },
      { path: 'more/foods', element: <FoodList /> },
      { path: 'more/device-check', element: <DeviceCheck /> },
      { path: 'more/about', element: <About /> },
      { path: 'more/health', element: <HealthImport /> },
      { path: 'more/ai', element: <AiSettings /> },
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
