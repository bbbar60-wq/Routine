import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Repeat2, CheckSquare, Timer, Dumbbell, Trophy, HeartPulse,
  GraduationCap, Wallet, Target, NotebookPen, ChartNoAxesCombined, Settings2,
  Menu, Sun, Moon, Search, LogOut, Command,
} from 'lucide-react';
import { useApp } from '../../state/app';
import { Button, cx } from '../ui';
import { formatJalali, formatLongDate, todayIso } from '../../lib/date';
import { initials } from '../../lib/format';
import { Logo } from '../Logo';
import { CommandPalette } from './CommandPalette';

export interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  group: string;
}

export const NAV: NavItem[] = [
  { to: '/', label: 'Today', icon: LayoutDashboard, group: 'Daily' },
  { to: '/habits', label: 'Habits', icon: Repeat2, group: 'Daily' },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare, group: 'Daily' },
  { to: '/focus', label: 'Focus', icon: Timer, group: 'Daily' },
  { to: '/journal', label: 'Journal', icon: NotebookPen, group: 'Daily' },

  { to: '/gym', label: 'Gym', icon: Dumbbell, group: 'Body' },
  { to: '/sports', label: 'Sports', icon: Trophy, group: 'Body' },
  { to: '/health', label: 'Health', icon: HeartPulse, group: 'Body' },

  { to: '/learning', label: 'Learning', icon: GraduationCap, group: 'Growth' },
  { to: '/goals', label: 'Goals', icon: Target, group: 'Growth' },
  { to: '/finance', label: 'Finance', icon: Wallet, group: 'Growth' },

  { to: '/insights', label: 'Insights', icon: ChartNoAxesCombined, group: 'Review' },
  { to: '/settings', label: 'Settings', icon: Settings2, group: 'Review' },
];

const GROUPS = ['Daily', 'Body', 'Growth', 'Review'];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user, signOut } = useApp();

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 h-14 flex items-center shrink-0">
        <Logo />
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 pb-3" aria-label="Main">
        {GROUPS.map((group) => (
          <div key={group} className="mb-4">
            <p className="px-2.5 mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">
              {group}
            </p>
            <ul className="space-y-0.5">
              {NAV.filter((n) => n.group === group).map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === '/'}
                    onClick={onNavigate}
                    className={({ isActive }) => cx(
                      'group relative flex items-center gap-2.5 h-9 px-2.5 rounded-[var(--radius-md)]',
                      'text-[13px] font-medium transition-colors duration-150',
                      isActive
                        ? 'bg-[var(--surface-active)] text-[var(--ink)]'
                        : 'text-[var(--ink-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--ink)]'
                    )}
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <span className="absolute left-0 top-1.5 bottom-1.5 w-[2.5px] rounded-full bg-[var(--accent)]" aria-hidden />
                        )}
                        <item.icon size={16} className="shrink-0" aria-hidden />
                        {item.label}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-[var(--border)] p-2.5 shrink-0">
        <div className="flex items-center gap-2.5 px-1.5 py-1.5">
          <span
            className="w-8 h-8 rounded-full bg-[var(--surface-active)] border border-[var(--border-strong)] flex items-center justify-center text-[11.5px] font-semibold text-[var(--ink-secondary)] shrink-0"
            aria-hidden
          >
            {initials(user?.name ?? '')}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-medium text-[var(--ink)] truncate">{user?.name}</p>
            <p className="text-[11px] text-[var(--ink-muted)] truncate">{user?.email}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => signOut()} aria-label="Sign out" title="Sign out">
            <LogOut size={15} />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { theme, setTheme } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const location = useLocation();
  const today = todayIso();

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const current = NAV.find((n) => (n.to === '/' ? location.pathname === '/' : location.pathname.startsWith(n.to)));

  return (
    <div className="min-h-dvh flex bg-[var(--canvas)]">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-[224px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] sticky top-0 h-dvh">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/55 animate-fade" onClick={() => setMobileOpen(false)} aria-hidden />
          <aside className="relative w-[264px] h-full bg-[var(--surface)] border-r border-[var(--border)] animate-fade-up">
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 h-14 shrink-0 flex items-center gap-2 px-3 sm:px-5 border-b border-[var(--border)] bg-[var(--surface)]/85 backdrop-blur-xl">
          <Button
            variant="ghost" size="icon" className="lg:hidden"
            onClick={() => setMobileOpen(true)} aria-label="Open navigation"
          >
            <Menu size={18} />
          </Button>

          <div className="min-w-0 flex items-baseline gap-2.5">
            <h1 className="text-[15px] font-semibold text-[var(--ink)] truncate">{current?.label ?? 'Routine'}</h1>
            <span className="hidden md:inline text-[12px] text-[var(--ink-muted)] truncate">
              {formatLongDate(today)}
              <span className="mx-1.5 opacity-40">·</span>
              <span dir="rtl" className="font-medium">{formatJalali(today)}</span>
            </span>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => setPaletteOpen(true)}
              className="hidden sm:flex items-center gap-2 h-9 pl-2.5 pr-2 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-raised)] text-[var(--ink-muted)] hover:border-[var(--ink-muted)] hover:text-[var(--ink-secondary)] transition-colors cursor-pointer"
              aria-label="Open command palette"
            >
              <Search size={14} />
              <span className="text-[12.5px]">Jump to…</span>
              <kbd className="ml-3 flex items-center gap-0.5 h-5 px-1.5 rounded-[4px] bg-[var(--surface-sunken)] border border-[var(--border)] text-[10.5px] font-mono">
                <Command size={9} />K
              </kbd>
            </button>
            <Button
              variant="ghost" size="icon" className="sm:hidden"
              onClick={() => setPaletteOpen(true)} aria-label="Search"
            >
              <Search size={17} />
            </Button>
            <Button
              variant="ghost" size="icon"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            >
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </Button>
          </div>
        </header>

        <main className="flex-1 min-w-0 px-3 sm:px-5 lg:px-6 py-4 sm:py-5 pb-16">
          {children}
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
