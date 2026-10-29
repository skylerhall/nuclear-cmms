// Preventive maintenance and surveillance scheduling.
import { transaction } from '../db/database.ts';
import * as repo from '../db/repo.ts';
import { OPEN_STATUSES, pmDue } from '../../shared/rules.ts';
import type { Equipment, PmDue, PmPlan, WorkOrder } from '../../shared/types.ts';
import { audit } from './audit.ts';
import { type AppContext, plantToday } from './context.ts';
import { workFromPlan } from './workflow.ts';

export interface PlanRow {
  plan: PmPlan;
  equipment: Equipment;
  due: PmDue;
  openWorkOrder: { id: string; number: string; status: WorkOrder['status'] } | null;
}

export function planRows(ctx: AppContext): PlanRow[] {
  const today = plantToday(ctx);
  const open = repo.listWorkOrders(ctx.db, { statuses: OPEN_STATUSES });
  return repo
    .listPmPlans(ctx.db)
    .filter((p) => p.active)
    .map((plan) => {
      const equipment = repo.getEquipment(ctx.db, plan.equipmentId)!;
      const wo = open.find((w) => w.pmPlanId === plan.id);
      return { plan, equipment, due: pmDue(plan, today, equipment.runHours), openWorkOrder: wo ? { id: wo.id, number: wo.number, status: wo.status } : null };
    })
    .sort((a, b) => sortKey(a) - sortKey(b));
}

// Overdue first, then by how soon each is due (meter plans compared at ~20 run hours a day).
function sortKey(r: PlanRow): number {
  const days = r.due.basis === 'meter' ? r.due.remaining / 20 : r.due.remaining;
  return (r.due.state === 'overdue' ? -1e6 : 0) + days;
}

/**
 * Creates work orders for every plan that's inside its lead window (or past due)
 * and doesn't already have open work. Safe to run any number of times.
 */
export function generatePmWork(ctx: AppContext, at?: string): WorkOrder[] {
  return transaction(ctx.db, () => {
    const created: WorkOrder[] = [];
    for (const row of planRows(ctx)) {
      if (row.openWorkOrder || row.due.state === 'ok') continue;
      created.push(workFromPlan(ctx, row.plan, row.due, at));
    }
    if (created.length) audit(ctx, null, 'pm.generate', 'system', null, `PM generator created ${created.length} work order${created.length === 1 ? '' : 's'}: ${created.map((w) => w.number).join(', ')}`, at);
    return created;
  });
}

/** Share of PM and surveillance work closed in the window that was done by its late date. */
export function pmCompliance(ctx: AppContext, sinceIso: string): { done: number; onTime: number; pct: number | null } {
  const closed = repo.listWorkOrders(ctx.db, { statuses: ['closed'], closedSince: sinceIso }).filter((w) => w.type !== 'CM' && w.lateDate);
  const tz = repo.getPlant(ctx.db)?.timezone ?? 'America/Chicago';
  const onTime = closed.filter((w) => new Date(w.closedAt!).toLocaleDateString('en-CA', { timeZone: tz }) <= w.lateDate!).length;
  return { done: closed.length, onTime, pct: closed.length ? Math.round((onTime / closed.length) * 1000) / 10 : null };
}
