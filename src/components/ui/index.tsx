import {
  createContext, useCallback, useContext, useEffect, useId, useMemo,
  useRef, useState, type ReactNode, type ButtonHTMLAttributes,
  type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { X, Check, AlertTriangle, Info, CircleCheck, Loader2 } from 'lucide-react';
import { domainColor, domainLabel } from '../../lib/domains';

export const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

/* ============================== Button ============================== */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  loading?: boolean;
};

const BUTTON_VARIANTS: Record<string, string> = {
  primary:
    'bg-[var(--accent)] text-[var(--ink-on-accent)] hover:bg-[var(--accent-hover)] ' +
    'shadow-[var(--shadow-sm)] disabled:hover:bg-[var(--accent)]',
  secondary:
    'bg-[var(--surface-raised)] text-[var(--ink)] border border-[var(--border-strong)] ' +
    'hover:bg-[var(--surface-hover)] hover:border-[var(--ink-muted)]',
  ghost: 'text-[var(--ink-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--ink)]',
  subtle: 'bg-[var(--surface-hover)] text-[var(--ink)] hover:bg-[var(--surface-active)]',
  danger:
    'bg-[var(--status-critical)] text-white hover:brightness-110 shadow-[var(--shadow-sm)]',
};

const BUTTON_SIZES: Record<string, string> = {
  // 44px minimum touch target on the default size.
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-[var(--radius-sm)]',
  md: 'h-10 px-4 gap-2 rounded-[var(--radius-md)]',
  lg: 'h-11 px-5 gap-2 rounded-[var(--radius-md)] text-[15px]',
  icon: 'h-9 w-9 rounded-[var(--radius-md)] justify-center',
};

export function Button({
  variant = 'secondary', size = 'md', loading, className, children, disabled, ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center font-medium cursor-pointer select-none whitespace-nowrap',
        'transition-[background-color,border-color,color,transform,box-shadow] duration-150',
        'active:scale-[0.98] disabled:opacity-45 disabled:cursor-not-allowed disabled:active:scale-100',
        BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className
      )}
    >
      {loading && <Loader2 size={15} className="animate-spin shrink-0" aria-hidden />}
      {children}
    </button>
  );
}

/* =============================== Card =============================== */

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={cx(
        'bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)]',
        'shadow-[var(--shadow-sm)]', className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title, subtitle, action, icon, className,
}: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex items-start justify-between gap-3 px-4 pt-4 pb-3', className)}>
      <div className="min-w-0 flex items-start gap-2.5">
        {icon && <span className="mt-0.5 text-[var(--ink-muted)] shrink-0">{icon}</span>}
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold tracking-[0.01em] text-[var(--ink)] truncate">{title}</h2>
          {subtitle && <p className="text-[12px] text-[var(--ink-muted)] mt-0.5 truncate">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0 flex items-center gap-1.5">{action}</div>}
    </div>
  );
}

/* ============================== Fields ============================== */

export function Field({
  label, hint, error, required, children, className,
}: { label?: string; hint?: string; error?: string; required?: boolean; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      {label && (
        <span className="block text-[12px] font-medium text-[var(--ink-secondary)] mb-1.5">
          {label}
          {required && <span className="text-[var(--status-critical-text)] ml-0.5" aria-hidden>*</span>}
        </span>
      )}
      {children}
      {/* Errors sit next to the field they belong to, never only at the top. */}
      {error ? (
        <span className="flex items-center gap-1 text-[12px] text-[var(--status-critical-text)] mt-1.5">
          <AlertTriangle size={12} aria-hidden /> {error}
        </span>
      ) : hint ? (
        <span className="block text-[12px] text-[var(--ink-muted)] mt-1.5">{hint}</span>
      ) : null}
    </label>
  );
}

const CONTROL =
  'w-full bg-[var(--surface-raised)] border border-[var(--border-strong)] rounded-[var(--radius-md)] ' +
  'px-3 text-[var(--ink)] placeholder:text-[var(--ink-muted)] ' +
  'transition-colors duration-150 hover:border-[var(--ink-muted)] ' +
  'focus:outline-none focus:border-[var(--accent-ring)] focus:ring-2 focus:ring-[var(--accent-ring)]/30 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed';

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cx(CONTROL, 'h-10', className)} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cx(CONTROL, 'py-2.5 min-h-[84px] resize-y leading-relaxed', className)} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={cx(CONTROL, 'h-10 cursor-pointer appearance-none pr-8', className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M2.5 4.5L6 8l3.5-3.5' stroke='%23808b9e' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 10px center',
      }}
    >
      {children}
    </select>
  );
}

export function Checkbox({
  checked, onChange, label, disabled,
}: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  return (
    <label className={cx('inline-flex items-center gap-2.5 select-none', disabled ? 'opacity-50' : 'cursor-pointer')}>
      <span className="relative flex items-center justify-center">
        <input
          type="checkbox" checked={checked} disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className={cx(
            'w-[18px] h-[18px] rounded-[5px] border-2 flex items-center justify-center transition-all duration-150',
            'peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--accent-ring)] peer-focus-visible:ring-offset-2',
            'peer-focus-visible:ring-offset-[var(--surface)]',
            checked
              ? 'bg-[var(--accent)] border-[var(--accent)]'
              : 'border-[var(--border-strong)] hover:border-[var(--ink-muted)]'
          )}
        >
          {checked && <Check size={12} strokeWidth={3.5} className="text-[var(--ink-on-accent)]" />}
        </span>
      </span>
      {label && <span className="text-[13px]">{label}</span>}
    </label>
  );
}

/* ============================== Badges ============================== */

export function Badge({
  children, tone = 'neutral', className,
}: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'critical' | 'info'; className?: string }) {
  const tones: Record<string, string> = {
    neutral: 'bg-[var(--surface-hover)] text-[var(--ink-secondary)] border-[var(--border)]',
    good: 'bg-[var(--status-good)]/12 text-[var(--status-good-text)] border-[var(--status-good)]/30',
    warn: 'bg-[var(--status-warning)]/12 text-[var(--status-warning-text)] border-[var(--status-warning)]/30',
    critical: 'bg-[var(--status-critical)]/12 text-[var(--status-critical-text)] border-[var(--status-critical)]/30',
    info: 'bg-[var(--accent-ring)]/12 text-[var(--accent-ring)] border-[var(--accent-ring)]/30',
  };
  return (
    <span className={cx(
      'inline-flex items-center gap-1 h-[22px] px-2 rounded-[var(--radius-full)] border',
      'text-[11px] font-medium whitespace-nowrap', tones[tone], className
    )}>
      {children}
    </span>
  );
}

/**
 * A domain is always shown as colour *plus* its name — colour never carries the
 * meaning alone, which is what keeps the palette legible for CVD readers.
 */
export function DomainChip({ domain, showLabel = true, size = 'md' }: { domain: string; showLabel?: boolean; size?: 'sm' | 'md' }) {
  const color = domainColor(domain);
  const label = domainLabel(domain);

  // Without a visible label the pill is just visual weight — show the bare dot,
  // and keep the name available to assistive tech and on hover.
  if (!showLabel) {
    return (
      <span className="inline-flex items-center shrink-0" title={label}>
        <span className="w-2 h-2 rounded-full" style={{ background: color }} aria-hidden />
        <span className="sr-only">{label}</span>
      </span>
    );
  }

  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-[var(--radius-full)] border whitespace-nowrap font-medium',
        size === 'sm' ? 'h-[20px] px-1.5 text-[10.5px]' : 'h-[22px] px-2 text-[11px]'
      )}
      style={{ borderColor: `color-mix(in oklab, ${color} 35%, transparent)`, background: `color-mix(in oklab, ${color} 12%, transparent)`, color: 'var(--ink-secondary)' }}
      title={label}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} aria-hidden />
      {label}
    </span>
  );
}

export function DomainDot({ domain, size = 8 }: { domain: string; size?: number }) {
  return (
    <span
      className="rounded-full shrink-0 inline-block"
      style={{ width: size, height: size, background: domainColor(domain) }}
      aria-hidden
    />
  );
}

/* ============================= Progress ============================= */

export function Progress({
  value, max = 100, color, height = 6, className, label,
}: { value: number; max?: number; color?: string; height?: number; className?: string; label?: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      className={cx('w-full rounded-[var(--radius-full)] overflow-hidden bg-[var(--surface-sunken)]', className)}
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className="h-full rounded-[var(--radius-full)] transition-[width] duration-500 ease-[var(--ease-out)]"
        style={{ width: `${pct}%`, background: color ?? 'var(--accent)' }}
      />
    </div>
  );
}

/* ============================== Modal =============================== */

export function Modal({
  open, onClose, title, description, children, footer, width = 'md',
}: {
  open: boolean; onClose: () => void; title: string; description?: string;
  children: ReactNode; footer?: ReactNode; width?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Every caller passes `onClose` as an inline arrow, so its identity changes on
  // each render of the parent. Holding it in a ref lets the effect below depend
  // on `open` alone. With `onClose` in the dependency array, typing a single
  // character re-ran the effect, and its cleanup called `previous.focus()` —
  // pulling focus out of the very field being typed in, one keystroke at a time.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onCloseRef.current(); return; }
      if (e.key !== 'Tab' || !panelRef.current) return;
      // Keep focus inside the dialog.
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };

    document.addEventListener('keydown', onKey, true);
    const raf = requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLElement>(
        'input:not([type="hidden"]),textarea,select,button'
      )?.focus();
    });

    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = '';
      cancelAnimationFrame(raf);
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px] animate-fade"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx(
          'relative w-full bg-[var(--surface)] border border-[var(--border)] shadow-[var(--shadow-pop)]',
          'rounded-t-[var(--radius-xl)] sm:rounded-[var(--radius-xl)] animate-scale-in',
          'max-h-[92dvh] flex flex-col', widths[width]
        )}
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3 shrink-0">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[16px] font-semibold text-[var(--ink)]">{title}</h2>
            {description && <p className="text-[12.5px] text-[var(--ink-muted)] mt-1">{description}</p>}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close dialog">
            <X size={17} />
          </Button>
        </div>
        <div className="px-5 pb-5 overflow-y-auto grow">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-[var(--border)] bg-[var(--surface-sunken)]/50 rounded-b-[var(--radius-xl)] shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

export function ConfirmDialog({
  open, onClose, onConfirm, title, message, confirmLabel = 'Delete', danger = true,
}: {
  open: boolean; onClose: () => void; onConfirm: () => void;
  title: string; message: string; confirmLabel?: string; danger?: boolean;
}) {
  return (
    <Modal
      open={open} onClose={onClose} title={title} width="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={() => { onConfirm(); onClose(); }}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-[13.5px] text-[var(--ink-secondary)] leading-relaxed">{message}</p>
    </Modal>
  );
}

/* ============================== Toasts ============================== */

type Toast = { id: number; message: string; tone: 'success' | 'error' | 'info' };
const ToastContext = createContext<{ push: (message: string, tone?: Toast['tone']) => void }>({ push: () => {} });

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const push = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const value = useMemo(() => ({ push }), [push]);
  const icons = { success: CircleCheck, error: AlertTriangle, info: Info };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none" role="status" aria-live="polite">
        {toasts.map((t) => {
          const Icon = icons[t.tone];
          const tint = t.tone === 'error' ? 'var(--status-critical-text)'
            : t.tone === 'info' ? 'var(--accent-ring)' : 'var(--status-good-text)';
          return (
            <div
              key={t.id}
              className="pointer-events-auto flex items-center gap-2.5 px-3.5 py-2.5 rounded-[var(--radius-md)] bg-[var(--surface-raised)] border border-[var(--border-strong)] shadow-[var(--shadow-lg)] animate-fade-up max-w-[min(92vw,26rem)]"
            >
              <Icon size={15} style={{ color: tint }} className="shrink-0" aria-hidden />
              <span className="text-[13px] text-[var(--ink)]">{t.message}</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

/* =========================== Empty / Skeleton =========================== */

export function EmptyState({
  icon, title, message, action,
}: { icon?: ReactNode; title: string; message?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      {icon && (
        <div className="w-11 h-11 rounded-[var(--radius-lg)] bg-[var(--surface-hover)] border border-[var(--border)] flex items-center justify-center text-[var(--ink-muted)] mb-3.5">
          {icon}
        </div>
      )}
      <p className="text-[14px] font-medium text-[var(--ink)]">{title}</p>
      {message && <p className="text-[12.5px] text-[var(--ink-muted)] mt-1.5 max-w-sm leading-relaxed">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cx('relative overflow-hidden bg-[var(--surface-hover)] rounded-[var(--radius-md)]', className)}>
      <div
        className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-[var(--surface-active)] to-transparent"
        style={{ animation: 'rt-sweep 1.4s ease-in-out infinite' }}
      />
    </div>
  );
}

/* ============================= Segmented ============================= */

export function Segmented<T extends string>({
  value, onChange, options, size = 'md', className,
}: {
  value: T; onChange: (v: T) => void;
  options: Array<{ value: T; label: ReactNode; title?: string }>;
  size?: 'sm' | 'md'; className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cx('inline-flex items-center gap-0.5 p-0.5 rounded-[var(--radius-md)] bg-[var(--surface-sunken)] border border-[var(--border)]', className)}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            title={opt.title}
            onClick={() => onChange(opt.value)}
            className={cx(
              'cursor-pointer font-medium rounded-[var(--radius-sm)] transition-all duration-150 whitespace-nowrap',
              size === 'sm' ? 'h-[26px] px-2.5 text-[12px]' : 'h-8 px-3 text-[12.5px]',
              active
                ? 'bg-[var(--surface-raised)] text-[var(--ink)] shadow-[var(--shadow-sm)]'
                : 'text-[var(--ink-muted)] hover:text-[var(--ink-secondary)]'
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/* ============================== Rating ============================== */

export function ScalePicker({
  value, onChange, labels, max = 5, name,
}: { value: number | null; onChange: (v: number | null) => void; labels?: string[]; max?: number; name: string }) {
  return (
    <div className="flex items-center gap-1.5" role="radiogroup" aria-label={name}>
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => {
        const active = value != null && n <= value;
        const isCurrent = value === n;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={isCurrent}
            aria-label={labels?.[n] ?? `${n}`}
            title={labels?.[n] ?? `${n}`}
            onClick={() => onChange(isCurrent ? null : n)}
            className={cx(
              'h-9 flex-1 min-w-[38px] rounded-[var(--radius-sm)] border text-[12px] font-medium cursor-pointer',
              'transition-all duration-150',
              active
                ? 'bg-[var(--accent)] border-[var(--accent)] text-[var(--ink-on-accent)]'
                : 'bg-[var(--surface-raised)] border-[var(--border-strong)] text-[var(--ink-muted)] hover:border-[var(--ink-muted)]'
            )}
          >
            {n}
          </button>
        );
      })}
      {value != null && labels?.[value] && (
        <span className="text-[12px] text-[var(--ink-secondary)] ml-1.5 w-[62px] shrink-0">{labels[value]}</span>
      )}
    </div>
  );
}
