// Small, reusable pieces of plant vocabulary: tags, statuses, due dates, LCO clocks.
import { AlertTriangle, CheckCircle2, Clock, OctagonX, ShieldCheck, ShieldHalf } from 'lucide-react';
import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { PRIORITY_LABEL, SAFETY_CLASS_LABEL, STATUS_LABEL, TYPE_LABEL } from '../../../shared/rules.ts';
import type { EquipmentStatus, PmDue, Priority, SafetyClass, WorkStatus, WorkType } from '../../../shared/types.ts';
import { duration, num, shortDate } from '../lib/format.ts';
import { navigate } from '../lib/router.ts';
import { Badge, cx, type Tone } from './ui.tsx';

/** What the plant's systems wrote: a tag, a number, a reading. */
export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('measured whitespace-nowrap text-sm text-ink', className)}>{children}</span>;
}

/** An in-app link that still opens in a new tab on a modified click. */
export function AppLink({ to, children, className, title }: { to: string; children: ReactNode; className?: string; title?: string }) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(to);
  };
  return (
    <a href={to} onClick={onClick} title={title} className={cx('underline decoration-rule-2 underline-offset-[0.2em] transition-colors duration-150 hover:text-accent hover:decoration-accent', className)}>
      {children}
    </a>
  );
}

export function WoLink({ id, number, className }: { id: string; number: string; className?: string }) {
  return (
    <AppLink to={`/work-orders/${id}`} className={cx('measured shrink-0 whitespace-nowrap text-sm text-ink', className)}>
      {number}
    </AppLink>
  );
}

export function EquipmentLink({ id, tag }: { id: string; tag: string }) {
  return (
    <AppLink to={`/equipment/${id}`} className="measured whitespace-nowrap text-sm text-ink">
      {tag}
    </AppLink>
  );
}

// The current step is a person at work (amber); a test is an instrument (cool).
const STATUS_TONE: Record<WorkStatus, Tone> = {
  requested: 'gray',
  planning: 'purple',
  ready: 'purple',
  in_progress: 'amber',
  testing: 'blue',
  closed: 'green',
  cancelled: 'gray',
};

export function WoStatus({ status }: { status: WorkStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}

export function PriorityBadge({ priority, short }: { priority: Priority; short?: boolean }) {
  const tone: Tone = priority === 1 ? 'red' : priority === 2 ? 'amber' : 'gray';
  return <Badge tone={tone}>{short ? `P${priority}` : PRIORITY_LABEL[priority]}</Badge>;
}

export function TypeBadge({ type }: { type: WorkType }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm text-muted" title={TYPE_LABEL[type]}>
      <span className="rounded-chip border border-rule-2 px-1 text-sm font-medium text-ink-2">{type}</span>
      <span className="hidden 2xl:inline">{TYPE_LABEL[type]}</span>
    </span>
  );
}

export function SafetyBadge({ cls }: { cls: SafetyClass }) {
  if (cls === 'SR')
    return (
      <Badge tone="purple">
        <ShieldCheck size={13} aria-hidden /> {SAFETY_CLASS_LABEL.SR}
      </Badge>
    );
  if (cls === 'AQ')
    return (
      <Badge tone="purple">
        <ShieldHalf size={13} aria-hidden /> {SAFETY_CLASS_LABEL.AQ}
      </Badge>
    );
  return <span className="whitespace-nowrap text-sm text-muted">{SAFETY_CLASS_LABEL.NSR}</span>;
}

/** Operability, always an icon and a label, never colour alone. */
export function EquipmentState({ status, techSpec }: { status: EquipmentStatus; techSpec?: boolean }) {
  if (status === 'operable')
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-ok">
        <CheckCircle2 size={15} aria-hidden /> {techSpec ? 'Operable' : 'In service'}
      </span>
    );
  if (status === 'degraded')
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-accent">
        <AlertTriangle size={15} aria-hidden /> Degraded
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-bad">
      <OctagonX size={15} aria-hidden /> {techSpec ? 'Inoperable' : 'Out of service'}
    </span>
  );
}

export function DueChip({ due, st }: { due: PmDue; st?: boolean }) {
  const meter = due.basis === 'meter';
  const when = meter ? `${num(Math.abs(due.remaining))} run h` : `${Math.abs(due.remaining)} d`;
  if (due.state === 'overdue') {
    return (
      <Badge tone="red">
        <OctagonX size={13} aria-hidden /> {st ? 'Missed (SR 3.0.3)' : 'Overdue'}, late {meter ? `at ${num(due.lateHours ?? 0)} h` : shortDate(due.lateDate!)}
      </Badge>
    );
  }
  if (due.state === 'in_grace') {
    return (
      <Badge tone="amber">
        <AlertTriangle size={13} aria-hidden /> In grace, late {meter ? `at ${num(due.lateHours ?? 0)} h` : shortDate(due.lateDate!)}
      </Badge>
    );
  }
  if (due.state === 'due_soon') {
    return (
      <Badge tone="blue">
        <Clock size={13} aria-hidden /> Due in {when}
      </Badge>
    );
  }
  return <span className="whitespace-nowrap text-sm text-muted tabular">{meter ? `Due at ${num(due.dueHours ?? 0)} h` : `Due ${shortDate(due.dueDate!)}`}</span>;
}

/**
 * Live countdown to an LCO completion time, read like an instrument. `hoursRemaining`
 * is as of `asOf`. The bar shows time left: cool while comfortable, amber past half
 * gone, bad in the last quarter.
 */
export function LcoClock({ hoursRemaining, completionHours, asOf, compact }: { hoursRemaining: number; completionHours: number; asOf: number; compact?: boolean }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);
  const left = hoursRemaining - (now - asOf) / 3_600_000;
  const fraction = Math.max(0, Math.min(1, left / completionHours));
  const expired = left <= 0;
  const fill = expired || fraction < 0.25 ? 'bg-bad' : fraction < 0.5 ? 'bg-accent' : 'bg-cool';
  const label = expired ? `Exceeded by ${duration(-left)}` : `${duration(left)} left`;
  return (
    <div className={compact ? 'min-w-40' : 'min-w-56'}>
      <div className="flex items-baseline justify-between gap-3">
        <span className={cx('measured whitespace-nowrap leading-none', compact ? 'text-lg' : 'text-reading tracking-[-0.04em]', expired ? 'text-bad' : 'text-ink')} aria-label={label}>
          {expired && '+'}
          {readingParts(Math.abs(left)).map(([n, unit], i) => (
            <span key={unit} className={i ? 'ml-[0.3em]' : undefined}>
              {n}
              <span className="ml-[0.08em] text-[0.45em] tracking-normal text-muted">{unit}</span>
            </span>
          ))}
        </span>
        <span className="whitespace-nowrap text-sm text-muted">{expired ? 'past the limit' : `left of ${completionHours} h`}</span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-rule" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={completionHours} aria-valuenow={Math.max(0, Math.round(left * 10) / 10)}>
        <div className={cx('h-full w-full origin-left rounded-full transition-transform duration-200', fill)} style={{ transform: `scaleX(${expired ? 1 : fraction})` }} />
      </div>
    </div>
  );
}

/** 41 h 12 m, or 3 d 4 h past two days: the numbers set large, the units small. */
function readingParts(hours: number): [string, string][] {
  if (hours >= 48) return [[String(Math.floor(hours / 24)), 'd'], [String(Math.floor(hours % 24)), 'h']];
  return [[String(Math.floor(hours)), 'h'], [String(Math.floor((hours * 60) % 60)).padStart(2, '0'), 'm']];
}

/** A person, in the theme's person colour. */
export function Avatar({ initials, className }: { initials: string; className?: string }) {
  return <span className={cx('grid h-7 w-7 shrink-0 place-items-center rounded-full border border-accent/50 bg-accent-soft text-sm font-medium text-accent', className)}>{initials}</span>;
}
