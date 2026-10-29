import { Loader2, X, type LucideIcon } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

// ── Buttons ────────────────────────────────────────────────────────────────
// Console's pair: an amber fill (the one action a person takes next) beside a
// 1px outline on the panel. App controls stand 32 to 40px.

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
  size?: 'sm' | 'md' | 'lg';
  icon?: LucideIcon;
  loading?: boolean;
};

export function Button({ variant = 'secondary', size = 'md', icon: Icon, loading, className, children, disabled, type = 'button', ...rest }: ButtonProps) {
  const styles = {
    primary: 'border border-accent bg-accent text-accent-ink hover:bg-accent/90',
    accent: 'border border-accent bg-accent text-accent-ink hover:bg-accent/90',
    secondary: 'border border-rule-2 bg-paper-2 text-ink hover:bg-paper-3 hover:border-field',
    ghost: 'border border-transparent text-ink-2 hover:bg-paper-3 hover:text-ink',
    danger: 'border border-bad/70 bg-paper-2 text-bad hover:bg-bad-soft',
  }[variant];
  const sizes = { sm: 'h-8 px-3 text-sm gap-1.5', md: 'h-9 px-3.5 text-sm gap-2', lg: 'h-10 px-4 text-sm gap-2' }[size];
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx('inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-pill font-medium transition-colors duration-150', styles, sizes, className)}
    >
      {loading ? <Loader2 size={14} className="keep-motion animate-spin" /> : Icon ? <Icon size={size === 'sm' ? 14 : 15} aria-hidden /> : null}
      {children}
    </button>
  );
}

// ── Layout ─────────────────────────────────────────────────────────────────

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <h2 className="max-w-none text-3xl leading-tight">{title}</h2>
        {subtitle && <p className="mt-2 max-w-[60ch] text-md leading-relaxed text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** A hairline panel: a 1px rule with the panel step inside. */
export function Card({ title, subtitle, action, children, className, bodyClassName, icon: Icon }: { title?: ReactNode; subtitle?: ReactNode; action?: ReactNode; children?: ReactNode; className?: string; bodyClassName?: string; icon?: LucideIcon }) {
  return (
    <section className={cx('min-w-0 rounded-card border border-rule bg-paper-2', className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 border-b border-rule px-5 py-4">
          <div className="flex min-w-0 items-start gap-2.5">
            {Icon && <Icon size={16} className="mt-1 shrink-0 text-muted" aria-hidden />}
            <div className="min-w-0">
              {title && <h3 className="text-lg leading-snug">{title}</h3>}
              {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
            </div>
          </div>
          {action}
        </header>
      )}
      <div className={cx(bodyClassName ?? 'p-5')}>{children}</div>
    </section>
  );
}

/** Sibling figures cut from one surface, parted by 1px seams. */
export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('grid gap-px overflow-hidden rounded-card border border-rule bg-rule', className)}>{children}</div>;
}

export function Stat({ label, value, note, tone }: { label: string; value: ReactNode; note?: ReactNode; tone?: 'bad' | 'accent' | 'ok' }) {
  return (
    <div className="min-w-0 bg-paper-2 px-5 py-4">
      <div className="truncate text-sm font-medium text-muted">{label}</div>
      <div className={cx('measured mt-2 text-3xl leading-none', tone === 'bad' ? 'text-bad' : tone === 'accent' ? 'text-accent' : tone === 'ok' ? 'text-ok' : 'text-ink')}>{value}</div>
      {note && <div className="mt-2 text-sm text-muted">{note}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-1 px-5 py-8">
      <div className="flex items-center gap-2 font-medium">
        <Icon size={16} className="text-muted" aria-hidden /> {title}
      </div>
      {text && <p className="max-w-[52ch] text-sm text-muted">{text}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** A loading region in the shape of what is coming. */
export function Spinner({ label, rows = 4 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3 py-6">
      <span className="visually-hidden">{label ?? 'Loading…'}</span>
      <div className="h-7 w-64 max-w-full rounded-pill bg-paper-2" />
      <div className="overflow-hidden rounded-card border border-rule">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-rule bg-paper-2 px-5 py-4 last:border-0">
            <div className="h-3 w-24 rounded-chip bg-rule" />
            <div className="h-3 flex-1 rounded-chip bg-rule" />
            <div className="h-3 w-16 rounded-chip bg-rule" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div role="alert" className="rounded-card border border-bad/60 bg-bad-soft px-4 py-3 text-sm text-ink">
      <span className="font-medium text-bad">Couldn’t load this.</span> {error} Reload the page to try again.
    </div>
  );
}

// ── Chips ──────────────────────────────────────────────────────────────────
// A chip carries state only. Amber is a person or a deviation, cool an
// instrument, ok and bad are status; everything else stays neutral.

export type Tone = 'green' | 'amber' | 'blue' | 'red' | 'gray' | 'brand' | 'purple';

export function Badge({ tone = 'gray', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  const tones: Record<Tone, string> = {
    green: 'border-ok/50 bg-ok-soft text-ok',
    amber: 'border-accent/50 bg-accent-soft text-accent',
    blue: 'border-cool/50 bg-cool-soft text-cool',
    red: 'border-bad/50 bg-bad-soft text-bad',
    gray: 'border-rule-2 bg-paper-3 text-ink-2',
    brand: 'border-accent/50 bg-accent-soft text-accent',
    purple: 'border-rule-2 bg-paper-2 text-ink-2',
  };
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-chip border px-1.5 py-px text-sm font-medium', tones[tone], className)}>{children}</span>;
}

// ── Form controls ──────────────────────────────────────────────────────────

export function Toggle({ checked, onChange, disabled, label, small }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string; small?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx('relative inline-flex shrink-0 items-center rounded-full border transition-colors duration-150', small ? 'h-5 w-9' : 'h-6 w-11', checked ? 'border-accent bg-accent' : 'border-field bg-paper-3')}
    >
      <span className={cx('inline-block rounded-full transition-transform duration-150', small ? 'h-3.5 w-3.5' : 'h-4 w-4', checked ? 'bg-accent-ink' : 'bg-muted', checked ? (small ? 'translate-x-4.5' : 'translate-x-6') : 'translate-x-0.5')} />
    </button>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 block text-sm font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block min-h-[1lh] text-sm text-muted">{hint}</span>}
    </label>
  );
}

// Inputs sit on the deepest step inside a field-edge rule; focus is an inset outline.
export const inputClass =
  'h-9 w-full rounded-pill border border-field bg-paper-3 px-3 text-sm text-ink transition-colors duration-150 placeholder:text-muted hover:border-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-55';

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label?: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex flex-wrap rounded-pill border border-rule-2 bg-paper-3 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx('h-8 rounded-[4px] px-3 text-sm font-medium transition-colors duration-150', value === o.value ? 'bg-cool-soft text-ink' : 'text-muted hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ value, tabs, onChange }: { value: T; tabs: { value: T; label: string; count?: number }[]; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="mb-5 flex gap-1 overflow-x-auto border-b border-rule">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cx('-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors duration-150', value === t.value ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink')}
        >
          {t.label}
          {t.count !== undefined && <span className="measured text-sm text-muted">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ── Overlays ───────────────────────────────────────────────────────────────

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
}

export function Drawer({ open, onClose, title, subtitle, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; wide?: boolean }) {
  useEscape(open, onClose);
  if (!open) return null;
  // Portalled to <body> so a drawer or modal opened from inside another always covers the whole page.
  return createPortal(
    <div className="fixed inset-0 z-[400] flex justify-end">
      <div className="absolute inset-0 bg-scrim" onClick={onClose} />
      <aside role="dialog" aria-modal="true" className={cx('animate-slide-in relative flex h-full w-full flex-col border-l border-rule-2 bg-paper-2', wide ? 'max-w-3xl' : 'max-w-xl')}>
        <header className="flex items-start justify-between gap-4 border-b border-rule px-6 py-5">
          <div className="min-w-0">
            <h3 className="truncate text-xl">{title}</h3>
            {subtitle && <div className="mt-0.5 text-sm text-muted">{subtitle}</div>}
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-pill text-muted hover:bg-paper-3 hover:text-ink" aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <div className="scrollbar-thin flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}

export function Modal({ open, onClose, title, subtitle, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEscape(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[400] flex items-start justify-center overflow-y-auto p-4 pb-72 md:items-center lg:pb-4">
      <div className="fixed inset-0 bg-scrim" onClick={onClose} />
      <div role="dialog" aria-modal="true" className={cx('animate-rise relative my-8 w-full rounded-card border border-rule-2 bg-paper-2', wide ? 'max-w-4xl' : 'max-w-lg')}>
        <header className="flex items-start justify-between gap-4 border-b border-rule px-6 py-5">
          <div className="min-w-0">
            <h3 className="text-xl">{title}</h3>
            {subtitle && <div className="mt-1 text-sm text-muted">{subtitle}</div>}
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-pill text-muted hover:bg-paper-3 hover:text-ink" aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <div className="px-6 py-5">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-rule px-6 py-4">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

// ── Toasts ─────────────────────────────────────────────────────────────────

interface Toast {
  id: number;
  text: string;
  tone: 'success' | 'error' | 'info';
}

const ToastContext = createContext<(text: string, tone?: Toast['tone']) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast['tone'] = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5200);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div role="status" aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[500] flex w-[min(92vw,400px)] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              'animate-rise pointer-events-auto rounded-card border bg-paper-2 px-4 py-3 text-sm text-ink',
              t.tone === 'success' && 'border-ok/60',
              t.tone === 'error' && 'border-bad/70',
              t.tone === 'info' && 'border-rule-2',
            )}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
