import { useRef, useState } from 'react';
import {
  User, Palette, Target, Download, Upload, ShieldCheck, TriangleAlert,
  Sun, Moon, CalendarDays, Trash2,
} from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../state/app';
import {
  Button, Card, CardHeader, ConfirmDialog, Field, Input, Modal,
  Segmented, Select, useToast, cx,
} from '../components/ui';
import { formatJalali, formatLongDate, todayIso } from '../lib/date';
import { DOMAINS } from '../lib/domains';
import type { Settings as SettingsType } from '../lib/types';

export default function Settings() {
  const { user, settings, theme, setTheme, saveSettings, refreshUser, signOut } = useApp();
  const toast = useToast();
  const today = todayIso();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [savingProfile, setSavingProfile] = useState(false);

  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwError, setPwError] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  const [confirmReset, setConfirmReset] = useState(false);
  const [importing, setImporting] = useState(false);

  async function patch(key: keyof SettingsType, value: unknown) {
    try {
      await saveSettings({ [key]: value } as Partial<SettingsType>);
      toast.push('Saved');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not save', 'error');
    }
  }

  async function saveProfile() {
    setSavingProfile(true);
    try {
      await api.patch('/api/auth/profile', { name: name.trim(), email: email.trim() });
      await refreshUser();
      toast.push('Profile updated');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not update your profile', 'error');
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword() {
    setPwError('');
    if (pw.next.length < 8) { setPwError('The new password needs at least 8 characters'); return; }
    if (pw.next !== pw.confirm) { setPwError('The two new passwords do not match'); return; }
    setPwSaving(true);
    try {
      await api.post('/api/auth/password', { currentPassword: pw.current, newPassword: pw.next });
      setPwOpen(false);
      setPw({ current: '', next: '', confirm: '' });
      toast.push('Password changed — other sessions were signed out');
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Could not change the password');
    } finally {
      setPwSaving(false);
    }
  }

  async function exportData() {
    try {
      const dump = await api.get<unknown>('/api/export');
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `routine-backup-${today}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.push('Backup downloaded');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not export', 'error');
    }
  }

  async function importData(file: File) {
    setImporting(true);
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      if (!payload?.data) throw new Error('That file is not a Routine backup');
      const result = await api.post<{ imported: Record<string, number> }>('/api/import', payload);
      const total = Object.values(result.imported).reduce((s, n) => s + n, 0);
      toast.push(`Restored ${total} records`);
      window.location.reload();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not import that file', 'error');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-4 max-w-[900px]">
      {/* ---------------- profile ---------------- */}
      <Card>
        <CardHeader title="Profile" icon={<User size={15} />} subtitle="Who this instance belongs to." />
        <div className="px-4 pb-4 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </Field>
            <Field label="Email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary" onClick={saveProfile} loading={savingProfile}
              disabled={name.trim() === user?.name && email.trim() === user?.email}
            >
              Save profile
            </Button>
            <Button onClick={() => setPwOpen(true)}><ShieldCheck size={15} /> Change password</Button>
            <Button variant="ghost" className="ml-auto" onClick={() => signOut()}>Sign out</Button>
          </div>
        </div>
      </Card>

      {/* ---------------- appearance ---------------- */}
      <Card>
        <CardHeader title="Appearance" icon={<Palette size={15} />} subtitle="How Routine looks and reads dates." />
        <div className="px-4 pb-4 space-y-4">
          <Field label="Theme">
            <Segmented
              value={theme}
              onChange={(v) => { setTheme(v); void patch('theme', v); }}
              options={[
                { value: 'dark', label: <span className="flex items-center gap-1.5"><Moon size={13} /> Dark</span> },
                { value: 'light', label: <span className="flex items-center gap-1.5"><Sun size={13} /> Light</span> },
              ]}
            />
          </Field>

          <Field label="Calendar" hint="Persian dates come from your system's own calendar data.">
            <Segmented
              value={settings.calendar}
              onChange={(v) => void patch('calendar', v)}
              options={[
                { value: 'gregorian', label: 'Gregorian' },
                { value: 'jalali', label: 'Jalali' },
                { value: 'both', label: 'Both' },
              ]}
            />
          </Field>

          <div className="flex items-start gap-3 p-3.5 rounded-[var(--radius-md)] bg-[var(--surface-sunken)] border border-[var(--border)]">
            <CalendarDays size={15} className="mt-0.5 text-[var(--ink-muted)] shrink-0" aria-hidden />
            <div className="text-[12.5px]">
              <p className="text-[var(--ink)]">{formatLongDate(today)}</p>
              <p className="text-[var(--ink-muted)] mt-0.5" dir="rtl">{formatJalali(today)}</p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Week starts on">
              <Select value={settings.weekStart} onChange={(e) => void patch('weekStart', Number(e.target.value))}>
                <option value={6}>Saturday</option>
                <option value={0}>Sunday</option>
                <option value={1}>Monday</option>
              </Select>
            </Field>
            <Field label="Units">
              <Select value={settings.units} onChange={(e) => void patch('units', e.target.value)}>
                <option value="metric">Metric (kg, km)</option>
                <option value="imperial">Imperial (lb, mi)</option>
              </Select>
            </Field>
          </div>
        </div>
      </Card>

      {/* ---------------- targets ---------------- */}
      <Card>
        <CardHeader title="Daily targets" icon={<Target size={15} />}
          subtitle="What the dashboard measures your day against." />
        <div className="px-4 pb-4 grid sm:grid-cols-3 gap-3">
          <Field label="Focus goal" hint="minutes per day">
            <Input
              type="number" min={0} max={1440} step={15} defaultValue={settings.dailyFocusGoalMin}
              onBlur={(e) => {
                const v = Number(e.target.value);
                if (v !== settings.dailyFocusGoalMin) void patch('dailyFocusGoalMin', v);
              }}
            />
          </Field>
          <Field label="Water goal" hint="ml per day">
            <Input
              type="number" min={0} max={10000} step={100} defaultValue={settings.waterGoalMl}
              onBlur={(e) => {
                const v = Number(e.target.value);
                if (v !== settings.waterGoalMl) void patch('waterGoalMl', v);
              }}
            />
          </Field>
          <Field label="Sleep goal" hint="hours per night">
            <Input
              type="number" min={0} max={16} step={0.5} defaultValue={settings.sleepGoalHours}
              onBlur={(e) => {
                const v = Number(e.target.value);
                if (v !== settings.sleepGoalHours) void patch('sleepGoalHours', v);
              }}
            />
          </Field>
        </div>
      </Card>

      {/* ---------------- currency ---------------- */}
      <Card>
        <CardHeader title="Money" icon={<Target size={15} />} subtitle="The currency Finance totals in." />
        <div className="px-4 pb-4 max-w-[280px]">
          <Field label="Default currency">
            <Select value={settings.currency} onChange={(e) => void patch('currency', e.target.value)}>
              <option value="IRT">Toman (IRT)</option>
              <option value="IRR">Rial (IRR)</option>
              <option value="USD">US Dollar (USD)</option>
              <option value="EUR">Euro (EUR)</option>
            </Select>
          </Field>
        </div>
      </Card>

      {/* ---------------- areas of life ---------------- */}
      <Card>
        <CardHeader
          title="Areas of life" icon={<Palette size={15} />}
          subtitle="The fixed colour system every chart and chip draws from."
        />
        <div className="px-4 pb-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {DOMAINS.map((d) => (
              <div key={d.id} className="flex items-center gap-2.5 p-2.5 rounded-[var(--radius-md)] border border-[var(--border)]">
                <span className="w-3.5 h-3.5 rounded-[4px] shrink-0" style={{ background: `var(${d.varName})` }} aria-hidden />
                <span className="text-[12.5px] truncate">{d.label}</span>
              </div>
            ))}
          </div>
          <p className="text-[11.5px] text-[var(--ink-muted)] mt-3 leading-relaxed">
            These eight hues were checked for colour-vision separation and for contrast against
            both the light and dark surfaces, so every chart stays readable in either theme.
            A colour is always paired with its name — never used on its own to carry meaning.
          </p>
        </div>
      </Card>

      {/* ---------------- data ---------------- */}
      <Card>
        <CardHeader title="Your data" icon={<Download size={15} />}
          subtitle="Everything lives in a single SQLite file on this machine." />
        <div className="px-4 pb-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={exportData}><Download size={15} /> Export backup</Button>
            <Button onClick={() => fileRef.current?.click()} loading={importing}>
              <Upload size={15} /> Restore from backup
            </Button>
            <input
              ref={fileRef} type="file" accept="application/json,.json" className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importData(file);
                e.target.value = '';
              }}
            />
          </div>
          <p className="text-[11.5px] text-[var(--ink-muted)] leading-relaxed">
            The export is plain JSON containing every record you own. Restoring
            <strong className="text-[var(--ink-secondary)] font-medium"> replaces everything</strong> currently
            in the account, so export first if you are unsure.
          </p>
        </div>
      </Card>

      {/* ---------------- danger ---------------- */}
      <Card className="border-[var(--status-critical)]/30">
        <CardHeader
          title="Danger zone"
          icon={<TriangleAlert size={15} />}
          subtitle="Irreversible. Export a backup first."
        />
        <div className="px-4 pb-4">
          <Button variant="danger" onClick={() => setConfirmReset(true)}>
            <Trash2 size={15} /> Erase all my data
          </Button>
        </div>
      </Card>

      <p className={cx('text-[11.5px] text-[var(--ink-muted)] text-center pt-2')}>
        Routine — a personal operating system. Your data never leaves this machine.
      </p>

      {/* ---------------- password dialog ---------------- */}
      <Modal
        open={pwOpen} onClose={() => setPwOpen(false)} width="sm"
        title="Change password"
        description="Every other signed-in session will be signed out."
        footer={
          <>
            <Button variant="ghost" onClick={() => setPwOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={changePassword} loading={pwSaving}>Change password</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Current password" required>
            <Input type="password" autoComplete="current-password" value={pw.current}
              onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          </Field>
          <Field label="New password" required hint="At least 8 characters.">
            <Input type="password" autoComplete="new-password" value={pw.next}
              onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          </Field>
          <Field label="Confirm new password" required error={pwError || undefined}>
            <Input type="password" autoComplete="new-password" value={pw.confirm}
              onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmReset} onClose={() => setConfirmReset(false)}
        onConfirm={async () => {
          try {
            await api.post('/api/reset', {});
            toast.push('All data erased');
            window.location.reload();
          } catch (err) {
            toast.push(err instanceof Error ? err.message : 'Could not erase', 'error');
          }
        }}
        title="Erase everything?"
        message="Every habit, task, workout, log, transaction and journal entry will be deleted. Your account stays, but all of its history is gone. This cannot be undone."
        confirmLabel="Erase everything"
      />
    </div>
  );
}
