import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Plus, Circle, CheckCircle2, Trash2, Pencil, FolderKanban, CircleDot,
  AlertOctagon, Search, Inbox, CalendarDays,
} from 'lucide-react';
import { useResource } from '../lib/useResource';
import { api, qs } from '../lib/api';
import {
  Button, Card, CardHeader, ConfirmDialog, DomainChip, EmptyState, Field, Input,
  Modal, Segmented, Select, Skeleton, Textarea, useToast, cx, Progress,
} from '../components/ui';
import { StatTile } from '../components/charts';
import { DOMAINS, domainColor } from '../lib/domains';
import { relativeDay, todayIso, formatMinutes } from '../lib/date';
import { PRIORITY_LABELS, progressPercent } from '../lib/format';
import type { Project, Task } from '../lib/types';

type View = 'today' | 'all' | 'done' | 'projects';

const PRIORITIES = [1, 2, 3, 4];

const emptyTask = {
  title: '', notes: '', project_id: '' as string | number,
  domain: 'work', priority: 3, status: 'todo' as Task['status'],
  due_date: '', estimate_min: '' as string | number,
};

export default function Tasks() {
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<View>('today');
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('');

  const query = useMemo(() => {
    if (view === 'projects') return '/api/tasks?status=all';
    return `/api/tasks${qs({
      status: view === 'done' ? 'done' : view === 'all' ? 'all' : undefined,
      due: view === 'today' ? 'today' : undefined,
      project: projectFilter || undefined,
      search: search.trim() || undefined,
    })}`;
  }, [view, projectFilter, search]);

  const tasksRes = useResource<{ tasks: Task[] }>(query);
  const projectsRes = useResource<{ projects: Project[] }>('/api/projects');
  const toast = useToast();

  const [editing, setEditing] = useState<Task | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyTask);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Task | null>(null);

  const [projectOpen, setProjectOpen] = useState(false);
  const [projectForm, setProjectForm] = useState({ name: '', domain: 'work', description: '', deadline: '' });
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  const today = todayIso();
  const projects = projectsRes.data?.projects ?? [];
  const tasks = tasksRes.data?.tasks ?? [];

  useEffect(() => {
    if (params.get('new') === '1') { openCreate(); setParams({}, { replace: true }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  function openCreate() {
    setForm({ ...emptyTask, due_date: today });
    setEditing(null);
    setFormError('');
    setOpen(true);
  }

  function openEdit(task: Task) {
    setForm({
      title: task.title, notes: task.notes, project_id: task.project_id ?? '',
      domain: task.domain, priority: task.priority, status: task.status,
      due_date: task.due_date ?? '', estimate_min: task.estimate_min ?? '',
    });
    setEditing(task);
    setFormError('');
    setOpen(true);
  }

  const setStatus = useCallback(async (task: Task, status: Task['status']) => {
    // Optimistic: the row updates instantly, then the server confirms.
    tasksRes.set((prev) => ({ tasks: prev.tasks.map((t) => (t.id === task.id ? { ...t, status } : t)) }));
    try {
      await api.patch(`/api/tasks/${task.id}`, { status });
      await tasksRes.reload();
    } catch (err) {
      await tasksRes.reload();
      toast.push(err instanceof Error ? err.message : 'Could not update the task', 'error');
    }
  }, [tasksRes, toast]);

  async function save() {
    const title = form.title.trim();
    if (!title) { setFormError('The task needs a title'); return; }
    setSaving(true);
    try {
      const payload = {
        title, notes: form.notes.trim(),
        project_id: form.project_id === '' ? null : Number(form.project_id),
        domain: form.domain, priority: Number(form.priority), status: form.status,
        due_date: form.due_date || null,
        estimate_min: form.estimate_min === '' ? null : Number(form.estimate_min),
      };
      if (editing) await api.patch(`/api/tasks/${editing.id}`, payload);
      else await api.post('/api/tasks', payload);
      setOpen(false);
      await tasksRes.reload();
      toast.push(editing ? 'Task updated' : 'Task added');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save the task');
    } finally {
      setSaving(false);
    }
  }

  async function saveProject() {
    const name = projectForm.name.trim();
    if (!name) return;
    try {
      const payload = {
        name, domain: projectForm.domain,
        description: projectForm.description.trim(),
        deadline: projectForm.deadline || null,
      };
      if (editingProject) await api.patch(`/api/projects/${editingProject.id}`, payload);
      else await api.post('/api/projects', payload);
      setProjectOpen(false);
      setEditingProject(null);
      setProjectForm({ name: '', domain: 'work', description: '', deadline: '' });
      await projectsRes.reload();
      toast.push(editingProject ? 'Project updated' : 'Project created');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not save the project', 'error');
    }
  }

  const overdue = tasks.filter((t) => t.status !== 'done' && t.due_date && t.due_date < today).length;
  const dueToday = tasks.filter((t) => t.status !== 'done' && t.due_date === today).length;
  const doing = tasks.filter((t) => t.status === 'doing').length;

  if (tasksRes.loading && !tasksRes.data) {
    return <div className="space-y-4"><Skeleton className="h-11 w-full max-w-md" /><Skeleton className="h-[480px]" /></div>;
  }

  return (
    <div className="space-y-4 max-w-[1500px]">
      {/* controls */}
      <div className="flex flex-wrap items-center gap-2.5">
        <Segmented
          value={view} onChange={setView}
          options={[
            { value: 'today', label: 'Due now' },
            { value: 'all', label: 'All open' },
            { value: 'done', label: 'Done' },
            { value: 'projects', label: 'Projects' },
          ]}
        />
        {view !== 'projects' && (
          <>
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)] pointer-events-none" aria-hidden />
              <Input
                value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tasks…" aria-label="Search tasks" className="pl-8 h-9"
              />
            </div>
            {/* Width lives on the wrapper: the control itself is w-full, and
                relying on a utility to override that is order-dependent. */}
            <div className="w-[190px] shrink-0">
              <Select
                value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}
                aria-label="Filter by project" className="h-9"
              >
                <option value="">All projects</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </div>
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          {view === 'projects' ? (
            <Button variant="primary" size="sm" onClick={() => { setEditingProject(null); setProjectForm({ name: '', domain: 'work', description: '', deadline: '' }); setProjectOpen(true); }}>
              <Plus size={15} /> New project
            </Button>
          ) : (
            <Button variant="primary" size="sm" onClick={openCreate}><Plus size={15} /> New task</Button>
          )}
        </div>
      </div>

      {view !== 'projects' && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 stagger">
          <StatTile label="Overdue" value={overdue} icon={<AlertOctagon size={15} />}
            accent={overdue ? 'var(--status-critical)' : domainColor('work')}
            deltaTone={overdue ? 'bad' : 'good'} delta={overdue ? 'Needs attention' : 'All clear'} />
          <StatTile label="Due today" value={dueToday} icon={<CalendarDays size={15} />} accent={domainColor('work')} />
          <StatTile label="In progress" value={doing} icon={<CircleDot size={15} />} accent={domainColor('research')} />
          <StatTile label="Active projects" value={projects.filter((p) => p.status === 'active').length}
            icon={<FolderKanban size={15} />} accent={domainColor('learning')} />
        </div>
      )}

      {/* ------------------------- projects view ------------------------- */}
      {view === 'projects' ? (
        projects.length === 0 ? (
          <Card>
            <EmptyState icon={<FolderKanban size={19} />} title="No projects yet"
              message="Group related tasks and time under a project to see where your effort really goes." />
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 stagger">
            {projects.map((p) => {
              const pct = progressPercent(p.task_done ?? 0, p.task_count ?? 0);
              return (
                <Card key={p.id} className="p-4 group">
                  <div className="flex items-start justify-between gap-2 mb-2.5">
                    <div className="min-w-0">
                      <h3 className="text-[14px] font-semibold text-[var(--ink)] truncate">{p.name}</h3>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <DomainChip domain={p.domain} size="sm" />
                        {p.status !== 'active' && (
                          <span className="text-[10.5px] px-1.5 h-[20px] inline-flex items-center rounded-[var(--radius-full)] border border-[var(--border)] text-[var(--ink-muted)] capitalize">
                            {p.status}
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => { setEditingProject(p); setProjectForm({ name: p.name, domain: p.domain, description: p.description, deadline: p.deadline ?? '' }); setProjectOpen(true); }}
                      aria-label={`Edit ${p.name}`}
                    >
                      <Pencil size={13} />
                    </Button>
                  </div>

                  {p.description && (
                    <p className="text-[12px] text-[var(--ink-muted)] leading-relaxed line-clamp-2 mb-3">{p.description}</p>
                  )}

                  <div className="flex items-baseline justify-between text-[11.5px] mb-1.5">
                    <span className="text-[var(--ink-muted)]">{p.task_done ?? 0} of {p.task_count ?? 0} tasks</span>
                    <span className="tabular text-[var(--ink)] font-medium">{pct}%</span>
                  </div>
                  <Progress value={pct} color={domainColor(p.domain)} label={`${p.name} progress`} />

                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border)] text-[11.5px] text-[var(--ink-muted)]">
                    <span>{formatMinutes(p.minutes_total ?? 0)} logged</span>
                    {p.deadline && (
                      <span className={cx(p.deadline < today && 'text-[var(--status-critical-text)] font-medium')}>
                        Due {relativeDay(p.deadline, today)}
                      </span>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )
      ) : tasks.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Inbox size={19} />}
            title={view === 'done' ? 'Nothing completed yet' : search ? 'No matches' : 'Nothing due'}
            message={
              view === 'done' ? 'Completed tasks will collect here.'
                : search ? `No task matches “${search}”.`
                : 'No tasks are due today or overdue.'
            }
            action={view !== 'done' ? <Button variant="primary" onClick={openCreate}><Plus size={15} /> Add a task</Button> : undefined}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <CardHeader title={`${tasks.length} task${tasks.length === 1 ? '' : 's'}`} icon={<CheckCircle2 size={15} />} />
          <ul className="pb-1">
            {tasks.map((t) => {
              const isOverdue = t.status !== 'done' && !!t.due_date && t.due_date < today;
              const done = t.status === 'done';
              return (
                <li
                  key={t.id}
                  className="group flex items-center gap-3 px-4 py-2.5 border-t border-[var(--border)] hover:bg-[var(--surface-hover)] transition-colors"
                >
                  <button
                    onClick={() => setStatus(t, done ? 'todo' : 'done')}
                    aria-label={done ? `Reopen “${t.title}”` : `Complete “${t.title}”`}
                    className="shrink-0 cursor-pointer transition-colors"
                    style={{ color: done ? domainColor(t.domain) : undefined }}
                  >
                    {done
                      ? <CheckCircle2 size={19} />
                      : <Circle size={19} className="text-[var(--border-strong)] hover:text-[var(--ink-secondary)]" />}
                  </button>

                  <button
                    onClick={() => openEdit(t)}
                    aria-label={`Edit “${t.title}”`}
                    className="min-w-0 flex-1 text-left cursor-pointer"
                  >
                    <span className={cx(
                      'block text-[13.5px] truncate',
                      done ? 'text-[var(--ink-muted)] line-through decoration-[1.5px]' : 'text-[var(--ink)]'
                    )}>
                      {t.title}
                    </span>
                    <span className="flex items-center gap-2 mt-0.5 text-[11.5px] text-[var(--ink-muted)]">
                      {t.project_name && <span className="truncate max-w-[180px]">{t.project_name}</span>}
                      {t.estimate_min ? <span className="tabular">· {formatMinutes(t.estimate_min)}</span> : null}
                    </span>
                  </button>

                  <div className="flex items-center gap-2 shrink-0">
                    {t.status === 'doing' && (
                      <span className="hidden sm:inline-flex items-center gap-1 text-[10.5px] font-medium px-1.5 h-[20px] rounded-[var(--radius-full)] bg-[var(--accent-ring)]/12 text-[var(--accent-ring)]">
                        <CircleDot size={9} /> Doing
                      </span>
                    )}
                    {t.priority <= 2 && !done && (
                      <span className={cx(
                        'hidden sm:inline-flex items-center text-[10.5px] font-semibold px-1.5 h-[20px] rounded-[4px]',
                        t.priority === 1
                          ? 'bg-[var(--status-critical)]/15 text-[var(--status-critical-text)]'
                          : 'bg-[var(--status-warning)]/15 text-[var(--status-warning-text)]'
                      )}>
                        {PRIORITY_LABELS[t.priority]}
                      </span>
                    )}
                    {t.due_date && (
                      <span className={cx(
                        'text-[11.5px] tabular w-[74px] text-right',
                        isOverdue ? 'text-[var(--status-critical-text)] font-medium' : 'text-[var(--ink-muted)]'
                      )}>
                        {relativeDay(t.due_date, today)}
                      </span>
                    )}
                    <DomainChip domain={t.domain} showLabel={false} size="sm" />
                    <span className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex gap-0.5">
                      {!done && (
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => setStatus(t, t.status === 'doing' ? 'todo' : 'doing')}
                          aria-label={t.status === 'doing' ? 'Move back to to-do' : 'Mark as in progress'}
                          title={t.status === 'doing' ? 'Move back to to-do' : 'Mark as in progress'}
                        >
                          <CircleDot size={13} />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setConfirmDelete(t)} aria-label={`Delete “${t.title}”`}>
                        <Trash2 size={13} />
                      </Button>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* ---------- task editor ---------- */}
      <Modal
        open={open} onClose={() => setOpen(false)}
        title={editing ? 'Edit task' : 'New task'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={save} loading={saving}>{editing ? 'Save changes' : 'Add task'}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Title" required error={formError && !form.title.trim() ? formError : undefined}>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Run the virial-identity training" autoFocus />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Project">
              <Select value={form.project_id} onChange={(e) => {
                const id = e.target.value;
                const project = projects.find((p) => String(p.id) === id);
                setForm({ ...form, project_id: id, domain: project?.domain ?? form.domain });
              }}>
                <option value="">No project</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="Area of life">
              <Select value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })}>
                {DOMAINS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Priority">
              <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
              </Select>
            </Field>
            <Field label="Due date">
              <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            </Field>
            <Field label="Estimate" hint="minutes">
              <Input type="number" min={0} value={form.estimate_min}
                onChange={(e) => setForm({ ...form, estimate_min: e.target.value })} placeholder="60" />
            </Field>
          </div>

          <Field label="Status">
            <Segmented
              value={form.status}
              onChange={(v) => setForm({ ...form, status: v })}
              options={[
                { value: 'todo', label: 'To do' },
                { value: 'doing', label: 'In progress' },
                { value: 'done', label: 'Done' },
              ]}
            />
          </Field>

          <Field label="Notes">
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Anything worth remembering when you pick this up." />
          </Field>

          {formError && form.title.trim() && (
            <p className="text-[12.5px] text-[var(--status-critical-text)]" role="alert">{formError}</p>
          )}
        </div>
      </Modal>

      {/* ---------- project editor ---------- */}
      <Modal
        open={projectOpen} onClose={() => setProjectOpen(false)}
        title={editingProject ? 'Edit project' : 'New project'}
        footer={
          <>
            {editingProject && (
              <Button
                variant="ghost" className="mr-auto text-[var(--status-critical-text)]"
                onClick={async () => {
                  await api.patch(`/api/projects/${editingProject.id}`, { status: 'archived' });
                  setProjectOpen(false);
                  await projectsRes.reload();
                  toast.push('Project archived');
                }}
              >
                Archive
              </Button>
            )}
            <Button variant="ghost" onClick={() => setProjectOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={saveProject}>{editingProject ? 'Save changes' : 'Create project'}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name" required>
            <Input value={projectForm.name} onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
              placeholder="PI-ConvRNN — droplet collision" autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Area of life">
              <Select value={projectForm.domain} onChange={(e) => setProjectForm({ ...projectForm, domain: e.target.value })}>
                {DOMAINS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
              </Select>
            </Field>
            <Field label="Deadline">
              <Input type="date" value={projectForm.deadline}
                onChange={(e) => setProjectForm({ ...projectForm, deadline: e.target.value })} />
            </Field>
          </div>
          <Field label="Description">
            <Textarea value={projectForm.description}
              onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })}
              placeholder="What is this project for, and what does done look like?" />
          </Field>
          {editingProject && (
            <Field label="Status">
              <Segmented
                value={editingProject.status}
                onChange={async (v) => {
                  await api.patch(`/api/projects/${editingProject.id}`, { status: v });
                  await projectsRes.reload();
                  setEditingProject({ ...editingProject, status: v });
                }}
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'paused', label: 'Paused' },
                  { value: 'done', label: 'Done' },
                ]}
              />
            </Field>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete} onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return;
          await api.del(`/api/tasks/${confirmDelete.id}`);
          await tasksRes.reload();
          toast.push('Task deleted');
        }}
        title="Delete this task?"
        message={`“${confirmDelete?.title}” will be removed permanently.`}
      />
    </div>
  );
}
