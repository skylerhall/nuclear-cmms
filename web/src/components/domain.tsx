// Small, reusable pieces of plant vocabulary: tags, statuses, due dates, LCO clocks.
import { AlertTriangle, CheckCircle2, Clock, OctagonX, ShieldCheck, ShieldHalf, Timer } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { PRIORITY_LABEL, SAFETY_CLASS_LABEL, STATUS_LABEL, TYPE_LABEL } from '../../../shared/rules.ts';
import type { EquipmentStatus, PmDue, Priority, SafetyClass, WorkStatus, WorkType } from '../../../shared/types.ts';
import { duration, num, shortDate } from '../lib/format.ts';
import { navigate } from '../lib/router.ts';
import { Badge, cx, type Tone } from './ui.tsx';

export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('whitespace-nowrap font-mono text-[12.5px] font-semibold tracking-tight text-ink', className)}>{children}</span>;
}

export function WoLink({ id, number, className }: { id: string; number: string; className?: string }) {
  return (
    <button onClick={() => navigate(`/work-orders/${id}`)} className={cx('shrink-0 whitespace-nowrap font-mono text-[12.5px] font-semibold text-brand hover:underline', className)}>
      {number}
    </button>
  );
}

export function EquipmentLink({ id, tag }: { id: string; tag: string }) {
  return (
    <button onClick={() => navigate(`/equipment/${id}`)} className="whitespace-nowrap font-mono text-[12.5px] font-semibold text-brand hover:underline">
      {tag}
    </button>
  );
}

const STATUS_TONE: Record<WorkStatus, Tone> = {
  requested: 'gray',
  planning: 'purple',
  ready: 'blue',
  in_progress: 'brand',
  testing: 'amber',
  closed: 'green',
  cancelled: 'gray',
};

export function WoStatus({ status }: { status: WorkStatus }) {
  return (
    <Badge tone={STATUS_TONE[status]}>
      <span className={cx('h-1.5 w-1.5 rounded-full bg-current', status === 'in_progress' && 'animate-pulse')} />
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export function PriorityBadge({ priority, short }: { priority: Priority; short?: boolean }) {
  const tone: Tone = priority === 1 ? 'red' : priority === 2 ? 'amber' : 'gray';
  return <Badge tone={tone}>{short ? `P${priority}` : PRIORITY_LABEL[priority]}</Badge>;
}

export function TypeBadge({ type }: { type: WorkType }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted" title={TYPE_LABEL[type]}>
      <span className="rounded bg-soft px-1.5 py-0.5 font-mono text-[11px] font-semibold text-ink">{type}</span>
      <span className="hidden 2xl:inline">{TYPE_LABEL[type]}</span>
    </span>
  );
}

export function SafetyBadge({ cls }: { cls: SafetyClass }) {
  if (cls === 'SR')
    return (
      <Badge tone="purple">
        <ShieldCheck size={11} /> {SAFETY_CLASS_LABEL.SR}
      </Badge>
    );
  if (cls === 'AQ')
    return (
      <Badge tone="blue">
        <ShieldHalf size={11} /> {SAFETY_CLASS_LABEL.AQ}
      </Badge>
    );
  return <Badge tone="gray">{SAFETY_CLASS_LABEL.NSR}</Badge>;
}

/** Operability, always icon + label (never color alone). */
export function EquipmentState({ status, techSpec }: { status: EquipmentStatus; techSpec?: boolean }) {
  if (status === 'operable')
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-emerald-700">
        <CheckCircle2 size={14} className="text-good" /> {techSpec ? 'Operable' : 'In service'}
      </span>
    );
  if (status === 'degraded')
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-amber-800">
        <AlertTriangle size={14} className="text-warning" /> Degraded
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-red-700">
      <OctagonX size={14} className="text-critical" /> {techSpec ? 'Inoperable' : 'Out of service'}
    </span>
  );
}

export function DueChip({ due, st }: { due: PmDue; st?: boolean }) {
  const meter = due.basis === 'meter';
  const when = meter ? `${num(Math.abs(due.remaining))} run h` : `${Math.abs(due.remaining)} d`;
  if (due.state === 'overdue') {
    return (
      <Badge tone="red">
        <OctagonX size={11} /> {st ? 'Missed (SR 3.0.3)' : 'Overdue'} · late date {meter ? `${num(due.lateHours ?? 0)} h` : shortDate(due.lateDate!)}
      </Badge>
    );
  }
  if (due.state === 'in_grace') {
    return (
      <Badge tone="amber">
        <AlertTriangle size={11} /> In grace · late {meter ? `at ${num(due.lateHours ?? 0)} h` : shortDate(due.lateDate!)}
      </Badge>
    );
  }
  if (due.state === 'due_soon') {
    return (
      <Badge tone="blue">
        <Clock size={11} /> Due in {when}
      </Badge>
    );
  }
  return <span className="text-xs text-muted tabular">{meter ? `Due at ${num(due.dueHours ?? 0)} h` : `Due ${shortDate(due.dueDate!)}`}</span>;
}

/** Live countdown to an LCO completion time. `hoursRemaining` is as of `asOf`. */
export function LcoClock({ hoursRemaining, completionHours, asOf, compact }: { hoursRemaining: number; completionHours: number; asOf: number; compact?: boolean }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);
  const left = hoursRemaining - (now - asOf) / 3_600_000;
  const fraction = Math.max(0, Math.min(1, left / completionHours));
  const expired = left <= 0;
  // Fill shows time remaining; severity steps from accent to warning to critical.
  const fill = expired ? 'bg-critical' : fraction < 0.25 ? 'bg-critical' : fraction < 0.5 ? 'bg-warning' : 'bg-series';
  const track = expired || fraction < 0.25 ? 'bg-red-100' : fraction < 0.5 ? 'bg-amber-100' : 'bg-series-soft';
  return (
    <div className={compact ? 'min-w-36' : 'min-w-48'}>
      <div className="flex items-baseline justify-between gap-3">
        <span className={cx('inline-flex items-center gap-1.5 font-semibold tabular', compact ? 'text-sm' : 'text-lg', expired ? 'text-red-700' : 'text-ink')}>
          {expired ? <OctagonX size={compact ? 14 : 16} className="text-critical" /> : <Timer size={compact ? 14 : 16} className="text-muted" />}
          {expired ? `Exceeded by ${duration(-left)}` : `${duration(left)} left`}
        </span>
        {!compact && <span className="text-xs text-faint">of {completionHours} h</span>}
      </div>
      <div className={cx('mt-1.5 h-1.5 overflow-hidden rounded-full', track)}>
        <div className={cx('h-full rounded-full transition-[width]', fill)} style={{ width: `${(expired ? 1 : fraction) * 100}%` }} />
      </div>
    </div>
  );
}

export function Avatar({ initials, className }: { initials: string; className?: string }) {
  return <span className={cx('grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand/10 text-[11px] font-bold text-brand', className)}>{initials}</span>;
}
