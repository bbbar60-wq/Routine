import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useApp } from './state/app';
import { Shell } from './components/layout/Shell';
import { Skeleton } from './components/ui';
import { LogoMark } from './components/Logo';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

/* Every page past the dashboard is split out — the first paint only pays for
   what it shows. */
const Habits = lazy(() => import('./pages/Habits'));
const Tasks = lazy(() => import('./pages/Tasks'));
const Focus = lazy(() => import('./pages/Focus'));
const Journal = lazy(() => import('./pages/Journal'));
const Gym = lazy(() => import('./pages/Gym'));
const Sports = lazy(() => import('./pages/Sports'));
const Health = lazy(() => import('./pages/Health'));
const Learning = lazy(() => import('./pages/Learning'));
const Goals = lazy(() => import('./pages/Goals'));
const Finance = lazy(() => import('./pages/Finance'));
const Insights = lazy(() => import('./pages/Insights'));
const SettingsPage = lazy(() => import('./pages/Settings'));

function PageFallback() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-56" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

function BootScreen() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-[var(--canvas)]">
      <div className="flex flex-col items-center gap-3">
        <LogoMark size={34} />
        <span className="text-[12px] text-[var(--ink-muted)] animate-pulse-dot">Loading your routine…</span>
      </div>
    </div>
  );
}

export default function App() {
  const { user, loading } = useApp();

  if (loading) return <BootScreen />;
  if (!user) return <Login />;

  return (
    <Shell>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/habits" element={<Habits />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/focus" element={<Focus />} />
          <Route path="/journal" element={<Journal />} />
          <Route path="/gym" element={<Gym />} />
          <Route path="/sports" element={<Sports />} />
          <Route path="/health" element={<Health />} />
          <Route path="/learning" element={<Learning />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="/finance" element={<Finance />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Shell>
  );
}
