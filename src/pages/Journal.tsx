import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { NotebookPen, Search, Pencil, Trash2, Sparkles, Quote, CalendarDays } from 'lucide-react';
import { useResource } from '../lib/useResource';
import { api, qs } from '../lib/api';
import {
  Button, Card, ConfirmDialog, EmptyState, Field, Input, Modal,
  ScalePicker, Skeleton, Textarea, useToast, cx,
} from '../components/ui';
import { StatTile } from '../components/charts';
import { domainColor } from '../lib/domains';
import { addDays, formatDate, formatJalaliLatin, formatLongDate, todayIso } from '../lib/date';
import { MOOD_LABELS } from '../lib/format';
import type { JournalEntry } from '../lib/types';

const PERSONAL = 'var(--domain-personal)';

const emptyEntry = (date: string): Partial<JournalEntry> & { date: string } => ({
  date, title: '', body: '', highlights: '', gratitude: '', mood: null, tags: '',
});

export default function Journal() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const res = useResource<{ entries: JournalEntry[] }>(`/api/journal${qs({ search: search.trim() || undefined })}`);
  const toast = useToast();

  const [draft, setDraft] = useState<(Partial<JournalEntry> & { date: string }) | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<JournalEntry | null>(null);
  const [reading, setReading] = useState<JournalEntry | null>(null);

  const today = todayIso();
  const entries = res.data?.entries ?? [];

  const openEditor = useCallback((date: string) => {
    const existing = res.data?.entries.find((e) => e.date === date);
    setDraft(existing ? { ...existing } : emptyEntry(date));
    setReading(null);
  }, [res.data]);

  useEffect(() => {
    if (params.get('edit') === 'today') { openEditor(today); setParams({}, { replace: true }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, openEditor]);

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      await api.put(`/api/journal/${draft.date}`, {
        title: draft.title ?? '', body: draft.body ?? '',
        highlights: draft.highlights ?? '', gratitude: draft.gratitude ?? '',
        mood: draft.mood ?? null, tags: draft.tags ?? '',
      });
      setDraft(null);
      await res.reload();
      toast.push('Entry saved');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not save the entry', 'error');
    } finally {
      setSaving(false);
    }
  }

  /* ---------------- derived ---------------- */
  const hasToday = entries.some((e) => e.date === today);
  const moods = entries.filter((e) => e.mood != null);
  const avgMood = moods.length ? moods.reduce((s, e) => s + (e.mood ?? 0), 0) / moods.length : 0;

  /** Consecutive days written, counting back from today (or yesterday if today is still open). */
  const streak = useMemo(() => {
    const dates = new Set(entries.map((e) => e.date));
    let cursor = hasToday ? today : addDays(today, -1);
    let n = 0;
    while (dates.has(cursor) && n < 3650) { n += 1; cursor = addDays(cursor, -1); }
    return n;
  }, [entries, hasToday, today]);

  const wordCount = entries.reduce((s, e) => s + (e.body?.trim() ? e.body.trim().split(/\s+/).length : 0), 0);

  const grouped = useMemo(() => {
    const map = new Map<string, JournalEntry[]>();
    for (const e of entries) {
      const key = e.date.slice(0, 7);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [entries]);

  if (res.loading && !res.data) {
    return <div className="space-y-4"><Skeleton className="h-[104px]" /><Skeleton className="h-[420px]" /></div>;
  }

  return (
    <div className="space-y-4 max-w-[1500px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)] pointer-events-none" aria-hidden />
          <Input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your entries…" aria-label="Search journal" className="pl-8 h-9"
          />
        </div>
        <Button variant="primary" size="sm" onClick={() => openEditor(today)}>
          <NotebookPen size={15} /> {hasToday ? "Edit today's entry" : 'Write today'}
        </Button>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 stagger">
        <StatTile label="Entries" value={entries.length} icon={<NotebookPen size={15} />} accent={PERSONAL} />
        <StatTile label="Writing streak" value={streak} unit="days" icon={<Sparkles size={15} />} accent={PERSONAL}
          delta={hasToday ? "Today is written" : 'Today still open'} deltaTone={hasToday ? 'good' : 'flat'} />
        <StatTile label="Average mood" value={avgMood ? avgMood.toFixed(1) : '—'} unit={avgMood ? '/ 5' : undefined}
          icon={<Quote size={15} />} accent={domainColor('health')}
          delta={avgMood ? MOOD_LABELS[Math.round(avgMood)] : undefined}
          deltaTone={avgMood >= 3.5 ? 'good' : avgMood >= 2.5 ? 'flat' : 'bad'} />
        <StatTile label="Words written" value={wordCount >= 1000 ? `${(wordCount / 1000).toFixed(1)}k` : wordCount}
          icon={<CalendarDays size={15} />} accent={domainColor('learning')} />
      </div>

      {!hasToday && (
        <Card className="p-4 flex flex-wrap items-center gap-4 border-dashed">
          <div className="min-w-0">
            <p className="text-[13.5px] font-medium">{formatLongDate(today)} is still blank.</p>
            <p className="text-[12px] text-[var(--ink-muted)] mt-0.5">
              What went well, what didn't, and one thing worth keeping.
            </p>
          </div>
          <Button variant="primary" className="ml-auto" onClick={() => openEditor(today)}>
            <NotebookPen size={15} /> Write today
          </Button>
        </Card>
      )}

      {entries.length === 0 ? (
        <Card>
          <EmptyState
            icon={<NotebookPen size={19} />}
            title={search ? 'No entries match' : 'Nothing written yet'}
            message={search ? `Nothing matches “${search}”.` : 'The journal is where the numbers get their context.'}
            action={!search ? <Button variant="primary" onClick={() => openEditor(today)}>Write your first entry</Button> : undefined}
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {grouped.map(([month, monthEntries]) => (
            <section key={month}>
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)] mb-2.5 px-0.5">
                {new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
                <span className="ml-2 opacity-60">{monthEntries.length}</span>
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {monthEntries.map((e) => (
                  <Card
                    key={e.id}
                    className={cx(
                      'p-4 group cursor-pointer transition-all duration-200 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-md)]',
                      e.date === today && 'border-[var(--accent-ring)]/40'
                    )}
                    onClick={() => setReading(e)}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <p className="text-[11.5px] text-[var(--ink-muted)] tabular">
                          {formatDate(e.date, { year: true })}
                          {e.date === today && <span className="ml-1.5 text-[var(--accent-ring)]">· today</span>}
                        </p>
                        {e.title && (
                          <h3 className="text-[14px] font-semibold text-[var(--ink)] mt-1 truncate">{e.title}</h3>
                        )}
                      </div>
                      {e.mood != null && (
                        <span
                          className="shrink-0 text-[10.5px] font-medium px-1.5 h-[20px] inline-flex items-center rounded-[var(--radius-full)]"
                          style={{ background: `color-mix(in oklab, ${PERSONAL} 14%, transparent)`, color: 'var(--ink-secondary)' }}
                          title={`Mood: ${MOOD_LABELS[e.mood]}`}
                        >
                          {MOOD_LABELS[e.mood]}
                        </span>
                      )}
                    </div>

                    {e.body && (
                      <p className="text-[12.5px] text-[var(--ink-secondary)] leading-relaxed line-clamp-3">{e.body}</p>
                    )}

                    {e.highlights && (
                      <p className="mt-2.5 text-[11.5px] text-[var(--ink-muted)] flex items-start gap-1.5">
                        <Sparkles size={11} className="mt-[3px] shrink-0" aria-hidden />
                        <span className="truncate">{e.highlights}</span>
                      </p>
                    )}

                    <div className="flex items-center gap-1 mt-3 pt-2.5 border-t border-[var(--border)]">
                      {e.tags && (
                        <span className="text-[10.5px] text-[var(--ink-muted)] truncate">
                          {e.tags.split(',').map((t) => `#${t.trim()}`).join(' ')}
                        </span>
                      )}
                      <span className="ml-auto flex gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          onClick={(ev) => { ev.stopPropagation(); openEditor(e.date); }}
                          aria-label={`Edit entry for ${formatDate(e.date)}`}
                        >
                          <Pencil size={13} />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          onClick={(ev) => { ev.stopPropagation(); setConfirmDelete(e); }}
                          aria-label={`Delete entry for ${formatDate(e.date)}`}
                        >
                          <Trash2 size={13} />
                        </Button>
                      </span>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* ---------------- reader ---------------- */}
      <Modal
        open={!!reading} onClose={() => setReading(null)}
        title={reading?.title || (reading ? formatLongDate(reading.date) : '')}
        description={reading ? `${formatLongDate(reading.date)} · ${formatJalaliLatin(reading.date)}` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setReading(null)}>Close</Button>
            <Button variant="primary" onClick={() => reading && openEditor(reading.date)}>
              <Pencil size={14} /> Edit
            </Button>
          </>
        }
      >
        {reading && (
          <div className="space-y-4">
            {reading.mood != null && (
              <p className="text-[12px] text-[var(--ink-muted)]">Mood — {MOOD_LABELS[reading.mood]}</p>
            )}
            {reading.body && (
              <p className="text-[14px] leading-[1.75] text-[var(--ink)] whitespace-pre-wrap">{reading.body}</p>
            )}
            {reading.highlights && (
              <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-sunken)]/50 p-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ink-muted)] mb-1.5">Highlight</p>
                <p className="text-[13px] text-[var(--ink-secondary)]">{reading.highlights}</p>
              </div>
            )}
            {reading.gratitude && (
              <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-sunken)]/50 p-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ink-muted)] mb-1.5">Grateful for</p>
                <p className="text-[13px] text-[var(--ink-secondary)]">{reading.gratitude}</p>
              </div>
            )}
            {reading.tags && (
              <p className="text-[11.5px] text-[var(--ink-muted)]">
                {reading.tags.split(',').map((t) => `#${t.trim()}`).join('  ')}
              </p>
            )}
          </div>
        )}
      </Modal>

      {/* ---------------- editor ---------------- */}
      <Modal
        open={!!draft} onClose={() => setDraft(null)} width="lg"
        title={draft?.date === today ? 'Today' : draft ? formatLongDate(draft.date) : ''}
        description={draft ? formatJalaliLatin(draft.date) : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
            <Button variant="primary" onClick={save} loading={saving}>Save entry</Button>
          </>
        }
      >
        {draft && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Date" className="col-span-1">
                <Input type="date" max={today} value={draft.date}
                  onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
              </Field>
              <Field label="Title" className="col-span-2">
                <Input value={draft.title ?? ''} onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="Found the closure bug" />
              </Field>
            </div>

            <Field label="How was the day?">
              <ScalePicker name="Mood" value={draft.mood ?? null} labels={MOOD_LABELS}
                onChange={(v) => setDraft({ ...draft, mood: v })} />
            </Field>

            <Field label="What happened">
              <Textarea
                value={draft.body ?? ''} onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                placeholder="Write it the way you would tell it to someone."
                className="min-h-[180px] text-[14px] leading-[1.7]"
              />
            </Field>

            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Highlight of the day">
                <Textarea value={draft.highlights ?? ''} onChange={(e) => setDraft({ ...draft, highlights: e.target.value })}
                  placeholder="The one thing worth keeping." className="min-h-[70px]" />
              </Field>
              <Field label="Grateful for">
                <Textarea value={draft.gratitude ?? ''} onChange={(e) => setDraft({ ...draft, gratitude: e.target.value })}
                  placeholder="Something small counts." className="min-h-[70px]" />
              </Field>
            </div>

            <Field label="Tags" hint="Comma separated — research, work, health…">
              <Input value={draft.tags ?? ''} onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
                placeholder="research, breakthrough" />
            </Field>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete} onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return;
          await api.del(`/api/journal/${confirmDelete.date}`);
          await res.reload();
          toast.push('Entry deleted');
        }}
        title="Delete this entry?"
        message={`Your writing from ${confirmDelete ? formatLongDate(confirmDelete.date) : ''} will be permanently removed.`}
      />
    </div>
  );
}
