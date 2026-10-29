// Workflow rules, labels and due-date math shared by the server and the dashboard,
// so what the UI shows is exactly what the server enforces.
import { addDays, daysBetween } from './dates.ts';
import type { Discipline, Part, PmDue, PmPlan, Priority, Role, SafetyClass, StepKind, WorkAction, WorkOrder, WorkStatus, WorkStep, WorkType } from './types.ts';

export const ROLE_LABEL: Record<Role, string> = {
  planner: 'Work Control Planner',
  supervisor: 'Maintenance Supervisor',
  technician: 'Technician',
  qc: 'QC Inspector',
  sro: 'Shift Manager (SRO)',
  engineer: 'System Engineer',
};

export const DISCIPLINE_LABEL: Record<Discipline, string> = { mechanical: 'Mechanical', electrical: 'Electrical', ic: 'I&C' };

export const SAFETY_CLASS_LABEL: Record<SafetyClass, string> = { SR: 'Safety-related', AQ: 'Augmented quality', NSR: 'Non-safety' };

export const TYPE_LABEL: Record<WorkType, string> = { CM: 'Corrective', PM: 'Preventive', PDM: 'Predictive', ST: 'Surveillance test' };

export const PRIORITY_LABEL: Record<Priority, string> = { 1: 'P1 · Emergent', 2: 'P2 · Urgent', 3: 'P3 · Routine', 4: 'P4 · Outage / backlog' };

export const STATUS_LABEL: Record<WorkStatus, string> = {
  requested: 'Requested',
  planning: 'In planning',
  ready: 'Ready to work',
  in_progress: 'In progress',
  testing: 'Post-maint. testing',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

export const STEP_KIND_LABEL: Record<StepKind, string> = { step: 'Work step', reading: 'Reading', qc_hold: 'QC hold point', pmt: 'Post-maint. test' };

/** The forward path a work order travels. */
export const STATUS_FLOW: WorkStatus[] = ['requested', 'planning', 'ready', 'in_progress', 'testing', 'closed'];

export const OPEN_STATUSES: WorkStatus[] = ['requested', 'planning', 'ready', 'in_progress', 'testing'];

export function isOpen(status: WorkStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

interface ActionRule {
  label: string;
  from: WorkStatus[];
  to: WorkStatus;
}

export const ACTIONS: Record<WorkAction, ActionRule> = {
  screen: { label: 'Screen and send to planning', from: ['requested'], to: 'planning' },
  ready: { label: 'Mark work package ready', from: ['planning'], to: 'ready' },
  return_to_planning: { label: 'Return to planning', from: ['ready'], to: 'planning' },
  release: { label: 'Authorize and release work', from: ['ready'], to: 'in_progress' },
  work_complete: { label: 'Work complete, start PMT', from: ['in_progress'], to: 'testing' },
  close: { label: 'Close work order', from: ['testing'], to: 'closed' },
  cancel: { label: 'Cancel work order', from: ['requested', 'planning', 'ready'], to: 'cancelled' },
};

/** Who may take an action. Closing work that took equipment out of service is an operability call, so only the SRO can. */
export function actionRoles(action: WorkAction, wo: Pick<WorkOrder, 'requiresOos'>): Role[] {
  switch (action) {
    case 'screen':
      return ['supervisor', 'planner', 'sro'];
    case 'ready':
      return ['planner'];
    case 'return_to_planning':
      return ['planner', 'supervisor'];
    case 'release':
      return ['sro'];
    case 'work_complete':
      return ['technician', 'supervisor'];
    case 'close':
      return wo.requiresOos ? ['sro'] : ['supervisor', 'sro'];
    case 'cancel':
      return ['supervisor', 'planner'];
  }
}

export function stepRoles(kind: StepKind): Role[] {
  return kind === 'qc_hold' ? ['qc'] : ['technician', 'supervisor'];
}

/** PMT is performed after the clearance is released; everything else during the work. */
export function stepPhase(kind: StepKind): WorkStatus {
  return kind === 'pmt' ? 'testing' : 'in_progress';
}

export function needsValue(step: Pick<WorkStep, 'minValue' | 'maxValue'>): boolean {
  return step.minValue !== null || step.maxValue !== null;
}

export function readingResult(step: Pick<WorkStep, 'minValue' | 'maxValue'>, value: number): 'pass' | 'fail' {
  if (step.minValue !== null && value < step.minValue) return 'fail';
  if (step.maxValue !== null && value > step.maxValue) return 'fail';
  return 'pass';
}

export function criteriaText(step: Pick<WorkStep, 'minValue' | 'maxValue' | 'unit'>): string {
  const u = step.unit ? ` ${step.unit}` : '';
  if (step.minValue !== null && step.maxValue !== null) return `${step.minValue} to ${step.maxValue}${u}`;
  if (step.minValue !== null) return `≥ ${step.minValue}${u}`;
  if (step.maxValue !== null) return `≤ ${step.maxValue}${u}`;
  return '';
}

/**
 * When a PM or surveillance is due. Surveillances follow Tech Spec SR 3.0.2: the
 * frequency is met if performed within 1.25× the interval, measured from the last
 * performance. Past that late date the surveillance is missed (SR 3.0.3).
 */
export function pmDue(plan: Pick<PmPlan, 'intervalDays' | 'intervalHours' | 'gracePct' | 'leadDays' | 'lastDoneDate' | 'lastDoneHours'>, today: string, currentHours: number | null): PmDue {
  if (plan.intervalHours !== null) {
    const hours = currentHours ?? 0;
    const dueHours = (plan.lastDoneHours ?? 0) + plan.intervalHours;
    const lateHours = dueHours + Math.round((plan.intervalHours * plan.gracePct) / 100);
    const remaining = Math.round(dueHours - hours);
    const state = hours > lateHours ? 'overdue' : hours > dueHours ? 'in_grace' : remaining <= plan.intervalHours * 0.1 ? 'due_soon' : 'ok';
    return { basis: 'meter', dueDate: null, lateDate: null, dueHours, lateHours, remaining, state };
  }
  const interval = plan.intervalDays ?? 0;
  const dueDate = plan.lastDoneDate ? addDays(plan.lastDoneDate, interval) : today;
  const lateDate = addDays(dueDate, Math.floor((interval * plan.gracePct) / 100));
  const remaining = daysBetween(today, dueDate);
  const state = today > lateDate ? 'overdue' : today > dueDate ? 'in_grace' : remaining <= plan.leadDays ? 'due_soon' : 'ok';
  return { basis: 'calendar', dueDate, lateDate, dueHours: null, lateHours: null, remaining, state };
}

export function intervalText(plan: Pick<PmPlan, 'intervalDays' | 'intervalHours'>): string {
  if (plan.intervalHours !== null) return `${plan.intervalHours.toLocaleString('en-US')} run hours`;
  const d = plan.intervalDays ?? 0;
  if (d === 7) return 'Weekly';
  if (d === 31) return 'Monthly (31 d)';
  if (d === 92) return 'Quarterly (92 d)';
  if (d === 184) return 'Semiannual (184 d)';
  if (d === 366) return 'Annual (366 d)';
  if (d === 549) return '18 months';
  if (d === 731) return '24 months';
  return `Every ${d} days`;
}

/** Stock available for new work (on hand minus open reservations) has dropped below the reorder point. */
export function belowReorder(part: Pick<Part, 'onHand' | 'reserved' | 'reorderPoint'>): boolean {
  return part.onHand - part.reserved < part.reorderPoint;
}
