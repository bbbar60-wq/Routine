import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, AlertTriangle } from 'lucide-react';
import { useApp } from '../state/app';
import { Button, Field, Input } from '../components/ui';
import { LogoMark } from '../components/Logo';
import { api } from '../lib/api';
import { formatJalali, formatLongDate, todayIso } from '../lib/date';

export default function Login() {
  const { signIn, register } = useApp();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [needsSetup, setNeedsSetup] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const today = todayIso();

  useEffect(() => {
    api.get<{ needsSetup: boolean }>('/api/auth/status')
      .then((s) => { setNeedsSetup(s.needsSetup); if (s.needsSetup) setMode('signup'); })
      .catch(() => { /* the form still works; the submit will surface any problem */ });
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'signup') await register(name.trim(), email.trim(), password);
      else await signIn(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh grid lg:grid-cols-[1fr_1.1fr] bg-[var(--canvas)]">
      {/* form side */}
      <div className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-[352px] animate-fade-up">
          <div className="flex items-center gap-2.5 mb-8">
            <LogoMark size={30} />
            <span className="text-[17px] font-semibold tracking-[-0.02em]">Routine</span>
          </div>

          <h1 className="text-[24px] font-semibold tracking-[-0.025em] mb-1.5">
            {needsSetup ? 'Set up your account' : mode === 'signup' ? 'Create an account' : 'Welcome back'}
          </h1>
          <p className="text-[13px] text-[var(--ink-muted)] mb-7 leading-relaxed">
            {needsSetup
              ? 'This instance has no owner yet. The first account you create becomes yours.'
              : 'Sign in to pick up your day where you left it.'}
          </p>

          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            {mode === 'signup' && (
              <Field label="Name" required>
                <Input
                  value={name} onChange={(e) => setName(e.target.value)}
                  autoComplete="name" placeholder="Reza" required
                />
              </Field>
            )}

            <Field label="Email" required>
              <Input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                autoComplete="email" placeholder="you@example.com" required
              />
            </Field>

            <Field
              label="Password"
              required
              hint={mode === 'signup' ? 'At least 8 characters.' : undefined}
            >
              <Input
                type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                placeholder="••••••••" required minLength={mode === 'signup' ? 8 : undefined}
              />
            </Field>

            {error && (
              <p className="flex items-start gap-2 text-[12.5px] text-[var(--status-critical-text)] bg-[var(--status-critical)]/10 border border-[var(--status-critical)]/25 rounded-[var(--radius-md)] px-3 py-2.5" role="alert">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" aria-hidden />
                {error}
              </p>
            )}

            <Button type="submit" variant="primary" size="lg" loading={busy} className="w-full justify-center mt-1">
              {mode === 'signup' ? 'Create account' : 'Sign in'}
              {!busy && <ArrowRight size={16} />}
            </Button>
          </form>

          {!needsSetup && (
            <p className="text-[12.5px] text-[var(--ink-muted)] mt-5 text-center">
              {mode === 'signin' ? 'First time here?' : 'Already have an account?'}{' '}
              <button
                type="button"
                onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); }}
                className="text-[var(--ink)] font-medium hover:underline cursor-pointer"
              >
                {mode === 'signin' ? 'Create one' : 'Sign in'}
              </button>
            </p>
          )}
        </div>
      </div>

      {/* poster side */}
      <div className="hidden lg:flex relative items-center justify-center overflow-hidden border-l border-[var(--border)] bg-[var(--surface)]">
        <div className="absolute inset-0 surface-grid opacity-40" aria-hidden />
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(120% 90% at 70% 15%, color-mix(in oklab, var(--domain-work) 16%, transparent), transparent 62%)' }}
          aria-hidden
        />

        <div className="relative z-10 max-w-[420px] px-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)] mb-4">
            {formatLongDate(today)}
            <span className="mx-2 opacity-40">·</span>
            <span dir="rtl">{formatJalali(today)}</span>
          </p>
          <h2 className="text-[30px] leading-[1.2] font-semibold tracking-[-0.03em] mb-5">
            Everything you do,<br />in one honest picture.
          </h2>
          <p className="text-[13.5px] text-[var(--ink-secondary)] leading-relaxed mb-8">
            Work, research, training, sport, sleep, study, money and the notes you
            keep along the way — tracked in one place, so the patterns become
            visible instead of remembered.
          </p>

          <ul className="space-y-2.5">
            {[
              ['Work', 'Projects, tasks and where the hours actually went'],
              ['Fitness', 'Every set, every lift, every personal record'],
              ['Health', 'Sleep, weight, mood and energy over time'],
              ['Learning', 'Courses, study hours and the papers you read'],
            ].map(([label, text], i) => (
              <li key={label} className="flex items-start gap-3 text-[12.5px]">
                <span
                  className="w-2 h-2 rounded-full mt-[6px] shrink-0"
                  style={{ background: `var(--domain-${['work', 'fitness', 'health', 'learning'][i]})` }}
                  aria-hidden
                />
                <span>
                  <span className="font-medium text-[var(--ink)]">{label}</span>
                  <span className="text-[var(--ink-muted)]"> — {text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
