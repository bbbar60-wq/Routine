import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { CornerDownLeft, Search, Sun, Moon, LogOut } from 'lucide-react';
import { NAV } from './Shell';
import { useApp } from '../../state/app';
import { cx } from '../ui';

interface Command {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  run: () => void;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { theme, setTheme, signOut } = useApp();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const commands = useMemo<Command[]>(() => {
    const go = NAV.map((item) => ({
      id: `nav:${item.to}`,
      label: item.label,
      hint: item.group,
      group: 'Go to',
      icon: item.icon,
      run: () => navigate(item.to),
    }));

    const actions: Command[] = [
      {
        id: 'act:theme', group: 'Actions',
        label: `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`,
        icon: theme === 'dark' ? Sun : Moon,
        run: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
      },
      {
        id: 'act:focus', group: 'Actions', label: 'Start a focus session',
        icon: NAV.find((n) => n.to === '/focus')!.icon,
        run: () => navigate('/focus?start=1'),
      },
      {
        id: 'act:task', group: 'Actions', label: 'Add a task',
        icon: NAV.find((n) => n.to === '/tasks')!.icon,
        run: () => navigate('/tasks?new=1'),
      },
      {
        id: 'act:workout', group: 'Actions', label: 'Log a workout',
        icon: NAV.find((n) => n.to === '/gym')!.icon,
        run: () => navigate('/gym?new=1'),
      },
      {
        id: 'act:journal', group: 'Actions', label: "Write today's journal",
        icon: NAV.find((n) => n.to === '/journal')!.icon,
        run: () => navigate('/journal?edit=today'),
      },
      {
        id: 'act:health', group: 'Actions', label: 'Log health for today',
        icon: NAV.find((n) => n.to === '/health')!.icon,
        run: () => navigate('/health?edit=today'),
      },
      { id: 'act:signout', group: 'Actions', label: 'Sign out', icon: LogOut, run: () => void signOut() },
    ];

    return [...go, ...actions];
  }, [navigate, theme, setTheme, signOut]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands
      .map((c) => {
        const label = c.label.toLowerCase();
        // Prefix beats word-start beats substring, so short queries rank sanely.
        const score = label.startsWith(q) ? 0
          : label.includes(` ${q}`) ? 1
          : label.includes(q) ? 2
          : c.hint?.toLowerCase().includes(q) ? 3
          : -1;
        return { c, score };
      })
      .filter((r) => r.score >= 0)
      .sort((a, b) => a.score - b.score)
      .map((r) => r.c);
  }, [commands, query]);

  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => { if (open) { setQuery(''); setActive(0); } }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const chosen = results[active];
        if (chosen) { chosen.run(); onClose(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, results, active, onClose]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  let lastGroup = '';

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[12vh] px-4">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px] animate-fade" onClick={onClose} aria-hidden />
      <div
        role="dialog" aria-modal="true" aria-label="Command palette"
        className="relative w-full max-w-lg bg-[var(--surface)] border border-[var(--border-strong)] rounded-[var(--radius-xl)] shadow-[var(--shadow-pop)] overflow-hidden animate-scale-in"
      >
        <div className="flex items-center gap-2.5 px-3.5 h-12 border-b border-[var(--border)]">
          <Search size={16} className="text-[var(--ink-muted)] shrink-0" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to a page or run an action…"
            aria-label="Search commands"
            className="flex-1 bg-transparent border-0 outline-none text-[14px] text-[var(--ink)] placeholder:text-[var(--ink-muted)]"
          />
          <kbd className="text-[10.5px] font-mono text-[var(--ink-muted)] px-1.5 h-5 flex items-center rounded-[4px] bg-[var(--surface-sunken)] border border-[var(--border)]">
            esc
          </kbd>
        </div>

        <ul ref={listRef} className="max-h-[52vh] overflow-y-auto py-1.5" role="listbox">
          {results.length === 0 && (
            <li className="px-4 py-6 text-center text-[12.5px] text-[var(--ink-muted)]">
              Nothing matches “{query}”.
            </li>
          )}
          {results.map((c, i) => {
            const showGroup = c.group !== lastGroup;
            lastGroup = c.group;
            const isActive = i === active;
            return (
              <li key={c.id}>
                {showGroup && (
                  <p className="px-3.5 pt-2 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">
                    {c.group}
                  </p>
                )}
                <button
                  role="option"
                  aria-selected={isActive}
                  data-active={isActive}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => { c.run(); onClose(); }}
                  className={cx(
                    'w-full flex items-center gap-2.5 px-3.5 h-9 text-left cursor-pointer transition-colors',
                    isActive ? 'bg-[var(--surface-active)]' : 'hover:bg-[var(--surface-hover)]'
                  )}
                >
                  <c.icon size={15} className="text-[var(--ink-muted)] shrink-0" />
                  <span className="text-[13px] text-[var(--ink)] truncate">{c.label}</span>
                  {c.hint && <span className="text-[11px] text-[var(--ink-muted)] ml-auto">{c.hint}</span>}
                  {isActive && <CornerDownLeft size={12} className="text-[var(--ink-muted)] shrink-0 ml-1.5" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>,
    document.body
  );
}
