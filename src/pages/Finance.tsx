import { useMemo, useState } from 'react';
import {
  Plus, Wallet, TrendingUp, TrendingDown, Trash2, Pencil, PiggyBank, Receipt,
} from 'lucide-react';
import { useResource } from '../lib/useResource';
import { api, qs } from '../lib/api';
import { useApp } from '../state/app';
import {
  Button, Card, CardHeader, ConfirmDialog, EmptyState, Field, Input, Modal,
  Progress, Segmented, Select, Skeleton, Textarea, useToast, cx,
} from '../components/ui';
import { StatTile, BarChart, DonutChart, type BarDatum } from '../components/charts';
import { domainColor } from '../lib/domains';
import { addDays, formatDate, monthKey, todayIso } from '../lib/date';
import { formatMoney, formatMoneyShort, compactNumber, type Currency } from '../lib/format';
import type { Budget, Project, Transaction } from '../lib/types';

const FINANCE = 'var(--domain-finance)';
const SPEND = 'var(--domain-sports)';

interface FinanceData {
  transactions: Transaction[];
  byCategory: Array<{ category: string; type: 'income' | 'expense'; currency: Currency; total: number; count: number }>;
  monthly: Array<{ month: string; type: 'income' | 'expense'; currency: Currency; total: number }>;
  budgets: Budget[];
  categories: { income: string[]; expense: string[] };
}

const emptyTx = (date: string, currency: Currency) => ({
  id: undefined as number | undefined,
  project_id: '' as string | number,
  date, type: 'expense' as 'income' | 'expense',
  category: 'food', amount: '' as string | number,
  currency, account: 'main', note: '',
});

export default function Finance() {
  const [range, setRange] = useState<'month' | '90' | '365'>('month');
  const { settings } = useApp();
  const currency = settings.currency;
  const today = todayIso();

  const from = useMemo(() => {
    if (range === 'month') return `${monthKey(today)}-01`;
    return addDays(today, -(Number(range) - 1));
  }, [range, today]);

  const res = useResource<FinanceData>(`/api/finance${qs({ from, to: today })}`);
  const projectsRes = useResource<{ projects: Project[] }>('/api/projects');
  const toast = useToast();

  const [draft, setDraft] = useState<ReturnType<typeof emptyTx> | null>(null);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState({ category: 'food', monthly_limit: 0 });
  const [confirmDelete, setConfirmDelete] = useState<Transaction | null>(null);

  const data = res.data;
  const transactions = data?.transactions ?? [];
  const projects = projectsRes.data?.projects ?? [];
  const categories = data?.categories ?? { income: [], expense: [] };

  async function save() {
    if (!draft || draft.amount === '' || Number(draft.amount) <= 0) {
      toast.push('Enter an amount above zero', 'error');
      return;
    }
    try {
      const payload = {
        project_id: draft.project_id === '' ? null : Number(draft.project_id),
        date: draft.date, type: draft.type, category: draft.category,
        amount: Number(draft.amount), currency: draft.currency,
        account: draft.account, note: draft.note.trim(),
      };
      if (draft.id) await api.patch(`/api/transactions/${draft.id}`, payload);
      else await api.post('/api/transactions', payload);
      setDraft(null);
      await res.reload();
      toast.push(draft.id ? 'Transaction updated' : 'Transaction added');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not save', 'error');
    }
  }

  /* ---------------- derived ---------------- */
  const income = transactions.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = transactions.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const net = income - expense;
  const savingsRate = income > 0 ? Math.round((net / income) * 100) : 0;

  const expenseByCategory = useMemo(() => {
    const rows = (data?.byCategory ?? []).filter((r) => r.type === 'expense');
    return rows
      .sort((a, b) => b.total - a.total)
      .slice(0, 8)
      .map((r, i) => ({
        key: r.category,
        label: r.category[0].toUpperCase() + r.category.slice(1),
        value: r.total,
        // Magnitude ramp on one hue — spending categories are ranked, not identities.
        color: `color-mix(in oklab, ${SPEND} ${Math.max(32, 100 - i * 11)}%, var(--surface))`,
      }));
  }, [data]);

  const monthlyChart = useMemo<BarDatum[]>(() => {
    const months = new Map<string, { income: number; expense: number }>();
    for (const row of data?.monthly ?? []) {
      const cur = months.get(row.month) ?? { income: 0, expense: 0 };
      cur[row.type] += row.total;
      months.set(row.month, cur);
    }
    return [...months.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([month, v]) => ({
        label: month.slice(5),
        values: { income: v.income, expense: v.expense },
        meta: `Net ${formatMoneyShort(v.income - v.expense, currency)}`,
      }));
  }, [data, currency]);

  const budgetRows = useMemo(() => {
    const thisMonth = `${monthKey(today)}-01`;
    const spent = new Map<string, number>();
    for (const t of transactions) {
      if (t.type !== 'expense' || t.date < thisMonth) continue;
      spent.set(t.category, (spent.get(t.category) ?? 0) + t.amount);
    }
    return (data?.budgets ?? []).map((b) => ({
      ...b,
      spent: spent.get(b.category) ?? 0,
      pct: b.monthly_limit ? Math.min(999, Math.round(((spent.get(b.category) ?? 0) / b.monthly_limit) * 100)) : 0,
    })).sort((a, b) => b.pct - a.pct);
  }, [data, transactions, today]);

  if (res.loading && !res.data) {
    return <div className="space-y-4"><Skeleton className="h-[104px]" /><Skeleton className="h-[420px]" /></div>;
  }

  return (
    <div className="space-y-4 max-w-[1500px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={range} onChange={setRange}
          options={[
            { value: 'month', label: 'This month' },
            { value: '90', label: '90 days' },
            { value: '365', label: 'Year' },
          ]}
        />
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setBudgetOpen(true)}><PiggyBank size={15} /> Budgets</Button>
          <Button variant="primary" size="sm" onClick={() => setDraft(emptyTx(today, currency))}>
            <Plus size={15} /> Add transaction
          </Button>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 stagger">
        <StatTile label="Income" value={compactNumber(income)} unit={currency === 'IRT' ? 'T' : currency}
          icon={<TrendingUp size={15} />} accent={FINANCE} />
        <StatTile label="Spending" value={compactNumber(expense)} unit={currency === 'IRT' ? 'T' : currency}
          icon={<TrendingDown size={15} />} accent={SPEND} />
        <StatTile label="Net" value={compactNumber(net)} unit={currency === 'IRT' ? 'T' : currency}
          icon={<Wallet size={15} />} accent={net >= 0 ? FINANCE : SPEND}
          delta={net >= 0 ? 'Surplus' : 'Deficit'} deltaTone={net >= 0 ? 'good' : 'bad'} />
        <StatTile label="Savings rate" value={`${savingsRate}%`} icon={<PiggyBank size={15} />}
          accent={domainColor('work')}
          deltaTone={savingsRate >= 25 ? 'good' : savingsRate >= 10 ? 'flat' : 'bad'}
          delta={savingsRate >= 25 ? 'Strong' : savingsRate >= 10 ? 'Modest' : 'Thin'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 p-4">
          <h3 className="text-[13px] font-semibold mb-1">Income against spending</h3>
          <p className="text-[11.5px] text-[var(--ink-muted)] mb-3">Last 12 months.</p>
          {monthlyChart.length === 0 ? (
            <EmptyState title="No transactions yet" message="Add one and the picture starts here." />
          ) : (
            <>
              <div className="flex items-center gap-3.5 mb-2.5">
                <span className="inline-flex items-center gap-1.5 text-[11.5px] text-[var(--ink-secondary)]">
                  <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: FINANCE }} aria-hidden /> Income
                </span>
                <span className="inline-flex items-center gap-1.5 text-[11.5px] text-[var(--ink-secondary)]">
                  <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: SPEND }} aria-hidden /> Spending
                </span>
              </div>
              <BarChart
                data={monthlyChart}
                series={[
                  { key: 'income', label: 'Income', color: FINANCE },
                  { key: 'expense', label: 'Spending', color: SPEND },
                ]}
                height={230} stacked={false}
                formatValue={(v) => compactNumber(v)}
              />
            </>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="text-[13px] font-semibold mb-1">Where money goes</h3>
          <p className="text-[11.5px] text-[var(--ink-muted)] mb-4">Top spending categories.</p>
          {expenseByCategory.length === 0 ? (
            <EmptyState title="No spending logged" message="Add an expense to see the split." />
          ) : (
            <DonutChart
              data={expenseByCategory} size={148} thickness={20}
              centerLabel="spent" centerValue={compactNumber(expense)}
              formatValue={(v) => compactNumber(v)}
            />
          )}
        </Card>
      </div>

      {budgetRows.length > 0 && (
        <Card>
          <CardHeader title="Budgets this month" icon={<PiggyBank size={15} />}
            action={<Button size="sm" variant="ghost" onClick={() => setBudgetOpen(true)}>Manage</Button>} />
          <ul className="px-4 pb-4 space-y-3">
            {budgetRows.map((b) => {
              const over = b.pct > 100;
              return (
                <li key={b.category}>
                  <div className="flex items-baseline justify-between gap-2 mb-1.5">
                    <span className="text-[12.5px] capitalize">{b.category}</span>
                    <span className="text-[11.5px] tabular">
                      <span className={cx(over ? 'text-[var(--status-critical-text)] font-medium' : 'text-[var(--ink)]')}>
                        {formatMoneyShort(b.spent, b.currency)}
                      </span>
                      <span className="text-[var(--ink-muted)]"> / {formatMoneyShort(b.monthly_limit, b.currency)}</span>
                      {over && <span className="text-[var(--status-critical-text)] ml-2">over by {b.pct - 100}%</span>}
                    </span>
                  </div>
                  <Progress
                    value={Math.min(100, b.pct)}
                    color={over ? 'var(--status-critical)' : b.pct > 80 ? 'var(--status-warning)' : FINANCE}
                    label={`${b.category} budget`}
                  />
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader title="Transactions" subtitle={`${transactions.length} entries`} icon={<Receipt size={15} />} />
        {transactions.length === 0 ? (
          <EmptyState icon={<Wallet size={19} />} title="No transactions"
            message="Track income and spending to see where the money actually goes."
            action={<Button variant="primary" onClick={() => setDraft(emptyTx(today, currency))}>Add a transaction</Button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)]">
                  <th className="text-left font-semibold px-4 py-2">Date</th>
                  <th className="text-left font-semibold px-3 py-2">Category</th>
                  <th className="text-left font-semibold px-3 py-2 hidden md:table-cell">Note</th>
                  <th className="text-left font-semibold px-3 py-2 hidden lg:table-cell">Project</th>
                  <th className="text-right font-semibold px-3 py-2">Amount</th>
                  <th className="w-16" />
                </tr>
              </thead>
              <tbody>
                {transactions.slice(0, 150).map((t) => (
                  <tr key={t.id} className="border-t border-[var(--border)] hover:bg-[var(--surface-hover)] transition-colors group">
                    <td className="px-4 py-2.5 tabular text-[var(--ink-muted)] whitespace-nowrap">{formatDate(t.date)}</td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-2 capitalize">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: t.type === 'income' ? FINANCE : SPEND }} aria-hidden />
                        {t.category}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-[var(--ink-muted)] hidden md:table-cell truncate max-w-[220px]">
                      {t.note || '—'}
                    </td>
                    <td className="px-3 py-2.5 text-[var(--ink-muted)] hidden lg:table-cell truncate max-w-[160px]">
                      {t.project_name ?? '—'}
                    </td>
                    <td className={cx(
                      'px-3 py-2.5 text-right tabular font-medium whitespace-nowrap',
                      t.type === 'income' ? 'text-[var(--status-good-text)]' : 'text-[var(--ink)]'
                    )}>
                      {t.type === 'income' ? '+' : '−'}{formatMoney(t.amount, t.currency)}
                    </td>
                    <td className="pr-3">
                      <span className="flex justify-end gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7" aria-label="Edit transaction"
                          onClick={() => setDraft({
                            id: t.id, project_id: t.project_id ?? '', date: t.date, type: t.type,
                            category: t.category, amount: t.amount, currency: t.currency,
                            account: t.account, note: t.note,
                          })}
                        >
                          <Pencil size={13} />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => setConfirmDelete(t)} aria-label="Delete transaction">
                          <Trash2 size={13} />
                        </Button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ---------------- transaction editor ---------------- */}
      <Modal
        open={!!draft} onClose={() => setDraft(null)}
        title={draft?.id ? 'Edit transaction' : 'Add transaction'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
            <Button variant="primary" onClick={save}>{draft?.id ? 'Save changes' : 'Add'}</Button>
          </>
        }
      >
        {draft && (
          <div className="space-y-4">
            <Field label="Type">
              <Segmented
                value={draft.type}
                onChange={(v) => setDraft({
                  ...draft, type: v,
                  category: v === 'income' ? (categories.income[0] ?? 'other') : (categories.expense[0] ?? 'other'),
                })}
                options={[{ value: 'expense', label: 'Spending' }, { value: 'income', label: 'Income' }]}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount" required>
                <Input type="number" min={0} step="any" value={draft.amount}
                  onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                  placeholder="2500000" autoFocus />
              </Field>
              <Field label="Currency">
                <Select value={draft.currency}
                  onChange={(e) => setDraft({ ...draft, currency: e.target.value as Currency })}>
                  <option value="IRT">Toman (IRT)</option>
                  <option value="IRR">Rial (IRR)</option>
                  <option value="USD">US Dollar</option>
                  <option value="EUR">Euro</option>
                </Select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Date" required>
                <Input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
              </Field>
              <Field label="Category" required>
                <Select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                  {(draft.type === 'income' ? categories.income : categories.expense).map((c) => (
                    <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field label="Project" hint="Optional — ties client income to its project">
              <Select value={draft.project_id} onChange={(e) => setDraft({ ...draft, project_id: e.target.value })}>
                <option value="">No project</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>

            <Field label="Note">
              <Textarea value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                placeholder="Client milestone 3" className="min-h-[60px]" />
            </Field>
          </div>
        )}
      </Modal>

      {/* ---------------- budgets ---------------- */}
      <Modal
        open={budgetOpen} onClose={() => setBudgetOpen(false)}
        title="Monthly budgets" description="Set a ceiling per category and the bars will warn you."
        footer={<Button variant="ghost" onClick={() => setBudgetOpen(false)}>Done</Button>}
      >
        <div className="space-y-4">
          <div className="flex items-end gap-2">
            <Field label="Category" className="flex-1">
              <Select value={budgetDraft.category}
                onChange={(e) => setBudgetDraft({ ...budgetDraft, category: e.target.value })}>
                {categories.expense.map((c) => (
                  <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>
                ))}
              </Select>
            </Field>
            <Field label="Monthly limit" className="flex-1">
              <Input type="number" min={0} value={budgetDraft.monthly_limit || ''}
                onChange={(e) => setBudgetDraft({ ...budgetDraft, monthly_limit: Number(e.target.value) })}
                placeholder="90000000" />
            </Field>
            <Button
              variant="primary" className="mb-[1px]"
              onClick={async () => {
                if (!budgetDraft.monthly_limit) return;
                await api.put('/api/budgets', { ...budgetDraft, currency });
                await res.reload();
                setBudgetDraft({ category: 'food', monthly_limit: 0 });
                toast.push('Budget saved');
              }}
            >
              Set
            </Button>
          </div>

          {(data?.budgets ?? []).length > 0 && (
            <ul className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-[var(--radius-md)]">
              {(data?.budgets ?? []).map((b) => (
                <li key={b.category} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="text-[12.5px] capitalize flex-1">{b.category}</span>
                  <span className="text-[12.5px] tabular text-[var(--ink-secondary)]">
                    {formatMoney(b.monthly_limit, b.currency)}
                  </span>
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7" aria-label={`Remove ${b.category} budget`}
                    onClick={async () => {
                      await api.del(`/api/budgets/${b.category}`);
                      await res.reload();
                    }}
                  >
                    <Trash2 size={13} />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete} onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return;
          await api.del(`/api/transactions/${confirmDelete.id}`);
          await res.reload();
          toast.push('Transaction deleted');
        }}
        title="Delete this transaction?"
        message={`${confirmDelete ? formatMoney(confirmDelete.amount, confirmDelete.currency) : ''} on ${confirmDelete ? formatDate(confirmDelete.date) : ''} will be removed.`}
      />
    </div>
  );
}
