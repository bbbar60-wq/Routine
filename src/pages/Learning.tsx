import { useMemo, useState } from 'react';
import {
  Plus, GraduationCap, BookOpen, FileText, Trash2, Pencil, Clock,
  Star, ExternalLink, Layers,
} from 'lucide-react';
import { useResource } from '../lib/useResource';
import { api, qs } from '../lib/api';
import {
  Button, Card, CardHeader, ConfirmDialog, EmptyState, Field, Input, Modal,
  Progress, Segmented, Select, Skeleton, Textarea, useToast, cx,
} from '../components/ui';
import { StatTile, BarChart, type BarDatum } from '../components/charts';
import { domainColor } from '../lib/domains';
import { addDays, formatDate, formatMinutes, startOfWeek, todayIso, toHours } from '../lib/date';
import { progressPercent } from '../lib/format';
import type { Course, Reading, StudySession } from '../lib/types';

const LEARNING = 'var(--domain-learning)';
const RESEARCH = 'var(--domain-research)';

type Tab = 'courses' | 'reading' | 'sessions';

const emptyCourse = {
  id: undefined as number | undefined,
  title: '', provider: '', status: 'active',
  progress: 0, total_units: 100, unit_label: 'lessons', target_date: '', notes: '',
};

const emptyReading = {
  id: undefined as number | undefined,
  kind: 'paper', title: '', authors: '', venue: '', year: '' as string | number,
  status: 'reading', rating: '' as string | number, progress: 0,
  total_pages: '' as string | number, url: '', notes: '',
};

const emptyStudy = (date: string) => ({
  course_id: '' as string | number, date, minutes: 45, topic: '', notes: '',
});

export default function Learning() {
  const [tab, setTab] = useState<Tab>('courses');
  const today = todayIso();
  const from = useMemo(() => addDays(today, -89), [today]);

  const res = useResource<{ courses: Course[]; sessions: StudySession[]; readings: Reading[] }>(
    `/api/learning${qs({ from, to: today })}`
  );
  const toast = useToast();

  const [courseDraft, setCourseDraft] = useState<typeof emptyCourse | null>(null);
  const [readingDraft, setReadingDraft] = useState<typeof emptyReading | null>(null);
  const [studyDraft, setStudyDraft] = useState<ReturnType<typeof emptyStudy> | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'course' | 'reading' | 'study'; id: number; label: string } | null>(null);

  const courses = res.data?.courses ?? [];
  const readings = res.data?.readings ?? [];
  const sessions = res.data?.sessions ?? [];

  /* ---------------- mutations ---------------- */
  async function saveCourse() {
    if (!courseDraft?.title.trim()) return;
    try {
      const payload = {
        title: courseDraft.title.trim(), provider: courseDraft.provider.trim(),
        status: courseDraft.status, progress: Number(courseDraft.progress),
        total_units: Number(courseDraft.total_units) || 100,
        unit_label: courseDraft.unit_label.trim() || 'lessons',
        target_date: courseDraft.target_date || null, notes: courseDraft.notes.trim(),
      };
      if (courseDraft.id) await api.patch(`/api/courses/${courseDraft.id}`, payload);
      else await api.post('/api/courses', payload);
      setCourseDraft(null);
      await res.reload();
      toast.push(courseDraft.id ? 'Course updated' : 'Course added');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not save', 'error');
    }
  }

  async function saveReading() {
    if (!readingDraft?.title.trim()) return;
    try {
      const payload = {
        kind: readingDraft.kind, title: readingDraft.title.trim(),
        authors: readingDraft.authors.trim(), venue: readingDraft.venue.trim(),
        year: readingDraft.year === '' ? null : Number(readingDraft.year),
        status: readingDraft.status,
        rating: readingDraft.rating === '' ? null : Number(readingDraft.rating),
        progress: Number(readingDraft.progress) || 0,
        total_pages: readingDraft.total_pages === '' ? null : Number(readingDraft.total_pages),
        url: readingDraft.url.trim(), notes: readingDraft.notes.trim(),
      };
      if (readingDraft.id) await api.patch(`/api/readings/${readingDraft.id}`, payload);
      else await api.post('/api/readings', payload);
      setReadingDraft(null);
      await res.reload();
      toast.push(readingDraft.id ? 'Updated' : 'Added to your library');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not save', 'error');
    }
  }

  async function saveStudy() {
    if (!studyDraft) return;
    try {
      await api.post('/api/study', {
        course_id: studyDraft.course_id === '' ? null : Number(studyDraft.course_id),
        date: studyDraft.date, minutes: Number(studyDraft.minutes),
        topic: studyDraft.topic.trim(), notes: studyDraft.notes.trim(),
      });
      setStudyDraft(null);
      await res.reload();
      toast.push('Study session logged');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not save', 'error');
    }
  }

  /* ---------------- derived ---------------- */
  const weekStart = startOfWeek(today);
  const studyThisWeek = sessions.filter((s) => s.date >= weekStart).reduce((s, x) => s + x.minutes, 0);
  const totalStudy = sessions.reduce((s, x) => s + x.minutes, 0);
  const papersDone = readings.filter((r) => r.kind === 'paper' && r.status === 'done').length;
  const activeCourses = courses.filter((c) => c.status === 'active').length;

  const weeklyStudy = useMemo<BarDatum[]>(() => {
    const weeks = new Map<string, number>();
    for (const s of sessions) {
      const key = startOfWeek(s.date);
      weeks.set(key, (weeks.get(key) ?? 0) + s.minutes);
    }
    return [...weeks.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([week, minutes]) => ({
        label: week.slice(5).replace('-', '/'),
        values: { minutes },
        meta: `Week of ${formatDate(week)}`,
      }));
  }, [sessions]);

  if (res.loading && !res.data) {
    return <div className="space-y-4"><Skeleton className="h-[104px]" /><Skeleton className="h-[420px]" /></div>;
  }

  return (
    <div className="space-y-4 max-w-[1500px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={tab} onChange={setTab}
          options={[
            { value: 'courses', label: 'Courses' },
            { value: 'reading', label: 'Papers & books' },
            { value: 'sessions', label: 'Study log' },
          ]}
        />
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setStudyDraft(emptyStudy(today))}>
            <Clock size={15} /> Log study
          </Button>
          {tab === 'reading' ? (
            <Button variant="primary" size="sm" onClick={() => setReadingDraft({ ...emptyReading })}>
              <Plus size={15} /> Add paper
            </Button>
          ) : (
            <Button variant="primary" size="sm" onClick={() => setCourseDraft({ ...emptyCourse })}>
              <Plus size={15} /> Add course
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 stagger">
        <StatTile label="Study this week" value={toHours(studyThisWeek)} unit="h" icon={<Clock size={15} />}
          accent={LEARNING} foot={`${toHours(totalStudy)}h over 90 days`} />
        <StatTile label="Active courses" value={activeCourses} icon={<GraduationCap size={15} />} accent={LEARNING}
          foot={`${courses.length} total`} />
        <StatTile label="Papers read" value={papersDone} icon={<FileText size={15} />} accent={RESEARCH}
          foot={`${readings.filter((r) => r.status === 'reading').length} in progress`} />
        <StatTile label="Books" value={readings.filter((r) => r.kind === 'book').length} icon={<BookOpen size={15} />}
          accent={domainColor('personal')}
          foot={`${readings.filter((r) => r.kind === 'book' && r.status === 'done').length} finished`} />
      </div>

      <Card className="p-4">
        <h3 className="text-[13px] font-semibold mb-1">Weekly study time</h3>
        <p className="text-[11.5px] text-[var(--ink-muted)] mb-3">Deliberate study, separate from project work.</p>
        {weeklyStudy.length === 0 ? (
          <EmptyState title="No study logged yet" message="Log a session and the trend starts here." />
        ) : (
          <BarChart
            data={weeklyStudy} series={[{ key: 'minutes', label: 'Minutes', color: LEARNING }]}
            height={200} stacked highlightLast
            formatValue={(v) => (v >= 60 ? `${Math.round(v / 60)}h` : `${Math.round(v)}m`)}
          />
        )}
      </Card>

      {/* ---------------- courses ---------------- */}
      {tab === 'courses' && (
        courses.length === 0 ? (
          <Card>
            <EmptyState icon={<GraduationCap size={19} />} title="No courses yet"
              message="Track anything with a finish line — a course, a specialisation, a certification."
              action={<Button variant="primary" onClick={() => setCourseDraft({ ...emptyCourse })}>Add a course</Button>} />
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 stagger">
            {courses.map((c) => {
              const pct = progressPercent(c.progress, c.total_units);
              return (
                <Card key={c.id} className="p-4 group">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <h3 className="text-[14px] font-semibold text-[var(--ink)] leading-snug">{c.title}</h3>
                      {c.provider && <p className="text-[11.5px] text-[var(--ink-muted)] mt-1">{c.provider}</p>}
                    </div>
                    <span className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7" aria-label={`Edit ${c.title}`}
                        onClick={() => setCourseDraft({
                          id: c.id, title: c.title, provider: c.provider, status: c.status,
                          progress: c.progress, total_units: c.total_units, unit_label: c.unit_label,
                          target_date: c.target_date ?? '', notes: c.notes,
                        })}
                      >
                        <Pencil size={13} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Delete ${c.title}`}
                        onClick={() => setConfirm({ kind: 'course', id: c.id, label: c.title })}>
                        <Trash2 size={13} />
                      </Button>
                    </span>
                  </div>

                  <span className={cx(
                    'inline-flex items-center h-[20px] px-1.5 rounded-[var(--radius-full)] text-[10.5px] font-medium capitalize mb-3',
                    c.status === 'active' ? 'bg-[var(--status-good)]/12 text-[var(--status-good-text)]'
                      : c.status === 'done' ? 'bg-[var(--surface-hover)] text-[var(--ink-muted)]'
                      : 'bg-[var(--status-warning)]/12 text-[var(--status-warning-text)]'
                  )}>
                    {c.status}
                  </span>

                  <div className="flex items-baseline justify-between text-[11.5px] mb-1.5">
                    <span className="text-[var(--ink-muted)]">
                      {Math.round(c.progress)} of {c.total_units} {c.unit_label}
                    </span>
                    <span className="tabular text-[var(--ink)] font-medium">{pct}%</span>
                  </div>
                  <Progress value={pct} color={LEARNING} label={`${c.title} progress`} />

                  {c.target_date && (
                    <p className="text-[11.5px] text-[var(--ink-muted)] mt-3 pt-3 border-t border-[var(--border)]">
                      Target {formatDate(c.target_date, { year: true })}
                    </p>
                  )}
                </Card>
              );
            })}
          </div>
        )
      )}

      {/* ---------------- reading ---------------- */}
      {tab === 'reading' && (
        readings.length === 0 ? (
          <Card>
            <EmptyState icon={<FileText size={19} />} title="Nothing in the library"
              message="Papers, books and notes you're working through."
              action={<Button variant="primary" onClick={() => setReadingDraft({ ...emptyReading })}>Add a paper</Button>} />
          </Card>
        ) : (
          <Card>
            <CardHeader title="Library" subtitle={`${readings.length} items`} icon={<Layers size={15} />} />
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)]">
                    <th className="text-left font-semibold px-4 py-2">Title</th>
                    <th className="text-left font-semibold px-3 py-2 hidden md:table-cell">Authors</th>
                    <th className="text-left font-semibold px-3 py-2 hidden lg:table-cell">Venue</th>
                    <th className="text-left font-semibold px-3 py-2">Status</th>
                    <th className="text-left font-semibold px-3 py-2 hidden sm:table-cell">Rating</th>
                    <th className="w-16" />
                  </tr>
                </thead>
                <tbody>
                  {readings.map((r) => (
                    <tr key={r.id} className="border-t border-[var(--border)] hover:bg-[var(--surface-hover)] transition-colors group">
                      <td className="px-4 py-2.5 max-w-[300px]">
                        <span className="flex items-start gap-2">
                          <span
                            className="mt-[5px] w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ background: r.kind === 'book' ? domainColor('personal') : RESEARCH }}
                            title={r.kind}
                          />
                          <span className="min-w-0">
                            <span className="block text-[var(--ink)] truncate">{r.title}</span>
                            {r.total_pages ? (
                              <span className="block text-[11px] text-[var(--ink-muted)] tabular">
                                {r.progress} / {r.total_pages} pages
                              </span>
                            ) : null}
                          </span>
                          {r.url && (
                            <a href={r.url} target="_blank" rel="noreferrer noopener"
                              className="shrink-0 text-[var(--ink-muted)] hover:text-[var(--ink)]"
                              aria-label={`Open ${r.title}`}>
                              <ExternalLink size={12} />
                            </a>
                          )}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-[var(--ink-muted)] hidden md:table-cell truncate max-w-[180px]">{r.authors || '—'}</td>
                      <td className="px-3 py-2.5 text-[var(--ink-muted)] hidden lg:table-cell truncate max-w-[150px]">
                        {r.venue}{r.year ? ` ${r.year}` : ''}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={cx(
                          'inline-flex items-center h-[20px] px-1.5 rounded-[var(--radius-full)] text-[10.5px] font-medium capitalize',
                          r.status === 'done' ? 'bg-[var(--status-good)]/12 text-[var(--status-good-text)]'
                            : r.status === 'reading' ? 'bg-[var(--accent-ring)]/12 text-[var(--accent-ring)]'
                            : 'bg-[var(--surface-hover)] text-[var(--ink-muted)]'
                        )}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 hidden sm:table-cell">
                        {r.rating ? (
                          <span className="flex items-center gap-0.5" title={`${r.rating} of 5`}>
                            {Array.from({ length: 5 }, (_, i) => (
                              <Star key={i} size={11}
                                className={i < (r.rating ?? 0) ? 'fill-current text-[var(--status-warning)]' : 'text-[var(--border-strong)]'} />
                            ))}
                          </span>
                        ) : <span className="text-[var(--ink-muted)]">—</span>}
                      </td>
                      <td className="pr-3">
                        <span className="flex justify-end gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7" aria-label={`Edit ${r.title}`}
                            onClick={() => setReadingDraft({
                              id: r.id, kind: r.kind, title: r.title, authors: r.authors, venue: r.venue,
                              year: r.year ?? '', status: r.status, rating: r.rating ?? '',
                              progress: r.progress, total_pages: r.total_pages ?? '', url: r.url, notes: r.notes,
                            })}
                          >
                            <Pencil size={13} />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Delete ${r.title}`}
                            onClick={() => setConfirm({ kind: 'reading', id: r.id, label: r.title })}>
                            <Trash2 size={13} />
                          </Button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )
      )}

      {/* ---------------- study log ---------------- */}
      {tab === 'sessions' && (
        <Card>
          <CardHeader title="Study log" subtitle={`${sessions.length} sessions in 90 days`} icon={<Clock size={15} />} />
          {sessions.length === 0 ? (
            <EmptyState icon={<Clock size={19} />} title="No study sessions"
              message="Log the hours you spend learning, separate from project work."
              action={<Button variant="primary" onClick={() => setStudyDraft(emptyStudy(today))}>Log a session</Button>} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)]">
                    <th className="text-left font-semibold px-4 py-2">Date</th>
                    <th className="text-left font-semibold px-3 py-2">Topic</th>
                    <th className="text-left font-semibold px-3 py-2 hidden sm:table-cell">Course</th>
                    <th className="text-right font-semibold px-3 py-2">Time</th>
                    <th className="w-9" />
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr key={s.id} className="border-t border-[var(--border)] hover:bg-[var(--surface-hover)] transition-colors group">
                      <td className="px-4 py-2.5 tabular text-[var(--ink-muted)] whitespace-nowrap">{formatDate(s.date)}</td>
                      <td className="px-3 py-2.5 truncate max-w-[280px]">{s.topic || '—'}</td>
                      <td className="px-3 py-2.5 text-[var(--ink-muted)] hidden sm:table-cell truncate max-w-[200px]">
                        {s.course_title ?? '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular font-medium">{formatMinutes(s.minutes)}</td>
                      <td className="pr-3">
                        <Button
                          variant="ghost" size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                          onClick={() => setConfirm({ kind: 'study', id: s.id, label: s.topic || formatDate(s.date) })}
                          aria-label="Delete session"
                        >
                          <Trash2 size={13} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* ---------------- course editor ---------------- */}
      <Modal
        open={!!courseDraft} onClose={() => setCourseDraft(null)}
        title={courseDraft?.id ? 'Edit course' : 'Add a course'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCourseDraft(null)}>Cancel</Button>
            <Button variant="primary" onClick={saveCourse}>{courseDraft?.id ? 'Save changes' : 'Add course'}</Button>
          </>
        }
      >
        {courseDraft && (
          <div className="space-y-4">
            <Field label="Title" required>
              <Input value={courseDraft.title} onChange={(e) => setCourseDraft({ ...courseDraft, title: e.target.value })}
                placeholder="Machine Learning Specialization" autoFocus />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Provider">
                <Input value={courseDraft.provider} onChange={(e) => setCourseDraft({ ...courseDraft, provider: e.target.value })}
                  placeholder="Coursera" />
              </Field>
              <Field label="Status">
                <Select value={courseDraft.status} onChange={(e) => setCourseDraft({ ...courseDraft, status: e.target.value })}>
                  <option value="planned">Planned</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="done">Done</option>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Completed">
                <Input type="number" min={0} value={courseDraft.progress}
                  onChange={(e) => setCourseDraft({ ...courseDraft, progress: Number(e.target.value) })} />
              </Field>
              <Field label="Total">
                <Input type="number" min={1} value={courseDraft.total_units}
                  onChange={(e) => setCourseDraft({ ...courseDraft, total_units: Number(e.target.value) })} />
              </Field>
              <Field label="Unit">
                <Input value={courseDraft.unit_label}
                  onChange={(e) => setCourseDraft({ ...courseDraft, unit_label: e.target.value })} placeholder="lessons" />
              </Field>
            </div>
            <Field label="Target date">
              <Input type="date" value={courseDraft.target_date}
                onChange={(e) => setCourseDraft({ ...courseDraft, target_date: e.target.value })} />
            </Field>
            <Field label="Notes">
              <Textarea value={courseDraft.notes} onChange={(e) => setCourseDraft({ ...courseDraft, notes: e.target.value })}
                className="min-h-[60px]" />
            </Field>
          </div>
        )}
      </Modal>

      {/* ---------------- reading editor ---------------- */}
      <Modal
        open={!!readingDraft} onClose={() => setReadingDraft(null)}
        title={readingDraft?.id ? 'Edit item' : 'Add to library'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setReadingDraft(null)}>Cancel</Button>
            <Button variant="primary" onClick={saveReading}>{readingDraft?.id ? 'Save changes' : 'Add'}</Button>
          </>
        }
      >
        {readingDraft && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-3">
              <Field label="Kind">
                <Select value={readingDraft.kind} onChange={(e) => setReadingDraft({ ...readingDraft, kind: e.target.value })}>
                  <option value="paper">Paper</option>
                  <option value="book">Book</option>
                  <option value="notes">Notes</option>
                </Select>
              </Field>
              <Field label="Title" required className="col-span-3">
                <Input value={readingDraft.title} onChange={(e) => setReadingDraft({ ...readingDraft, title: e.target.value })}
                  placeholder="Attention Is All You Need" autoFocus />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Authors">
                <Input value={readingDraft.authors} onChange={(e) => setReadingDraft({ ...readingDraft, authors: e.target.value })}
                  placeholder="Vaswani et al." />
              </Field>
              <Field label="Venue">
                <Input value={readingDraft.venue} onChange={(e) => setReadingDraft({ ...readingDraft, venue: e.target.value })}
                  placeholder="NeurIPS" />
              </Field>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <Field label="Year">
                <Input type="number" min={1500} max={2200} value={readingDraft.year}
                  onChange={(e) => setReadingDraft({ ...readingDraft, year: e.target.value })} placeholder="2022" />
              </Field>
              <Field label="Status">
                <Select value={readingDraft.status} onChange={(e) => setReadingDraft({ ...readingDraft, status: e.target.value })}>
                  <option value="queued">Queued</option>
                  <option value="reading">Reading</option>
                  <option value="done">Done</option>
                  <option value="dropped">Dropped</option>
                </Select>
              </Field>
              <Field label="Page">
                <Input type="number" min={0} value={readingDraft.progress}
                  onChange={(e) => setReadingDraft({ ...readingDraft, progress: Number(e.target.value) })} />
              </Field>
              <Field label="Of">
                <Input type="number" min={1} value={readingDraft.total_pages}
                  onChange={(e) => setReadingDraft({ ...readingDraft, total_pages: e.target.value })} placeholder="28" />
              </Field>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <Field label="Rating" hint="1–5">
                <Input type="number" min={1} max={5} value={readingDraft.rating}
                  onChange={(e) => setReadingDraft({ ...readingDraft, rating: e.target.value })} />
              </Field>
              <Field label="Link" className="col-span-3">
                <Input type="url" value={readingDraft.url}
                  onChange={(e) => setReadingDraft({ ...readingDraft, url: e.target.value })}
                  placeholder="https://arxiv.org/abs/…" />
              </Field>
            </div>
            <Field label="Notes">
              <Textarea value={readingDraft.notes} onChange={(e) => setReadingDraft({ ...readingDraft, notes: e.target.value })}
                placeholder="What you took from it." className="min-h-[80px]" />
            </Field>
          </div>
        )}
      </Modal>

      {/* ---------------- study editor ---------------- */}
      <Modal
        open={!!studyDraft} onClose={() => setStudyDraft(null)}
        title="Log a study session"
        footer={
          <>
            <Button variant="ghost" onClick={() => setStudyDraft(null)}>Cancel</Button>
            <Button variant="primary" onClick={saveStudy}>Save session</Button>
          </>
        }
      >
        {studyDraft && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date" required>
                <Input type="date" max={today} value={studyDraft.date}
                  onChange={(e) => setStudyDraft({ ...studyDraft, date: e.target.value })} />
              </Field>
              <Field label="Minutes" required>
                <Input type="number" min={1} max={1440} value={studyDraft.minutes}
                  onChange={(e) => setStudyDraft({ ...studyDraft, minutes: Number(e.target.value) })} />
              </Field>
            </div>
            <Field label="Course">
              <Select value={studyDraft.course_id} onChange={(e) => setStudyDraft({ ...studyDraft, course_id: e.target.value })}>
                <option value="">No course</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </Select>
            </Field>
            <Field label="Topic">
              <Input value={studyDraft.topic} onChange={(e) => setStudyDraft({ ...studyDraft, topic: e.target.value })}
                placeholder="Numerical integration" />
            </Field>
            <Field label="Notes">
              <Textarea value={studyDraft.notes} onChange={(e) => setStudyDraft({ ...studyDraft, notes: e.target.value })}
                className="min-h-[60px]" />
            </Field>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirm} onClose={() => setConfirm(null)}
        onConfirm={async () => {
          if (!confirm) return;
          const path = confirm.kind === 'course' ? 'courses' : confirm.kind === 'reading' ? 'readings' : 'study';
          await api.del(`/api/${path}/${confirm.id}`);
          await res.reload();
          toast.push('Deleted');
        }}
        title="Delete this?"
        message={`“${confirm?.label}” will be removed permanently.`}
      />
    </div>
  );
}
