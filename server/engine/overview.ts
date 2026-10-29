// The numbers on the dashboard home page.
import * as repo from '../db/repo.ts';
import { addDays, dateIn, daysBetween, weekStart } from '../../shared/dates.ts';
import { OPEN_STATUSES, belowReorder } from '../../shared/rules.ts';
import type { Discipline, WorkStatus } from '../../shared/types.ts';
import { type AppContext, plantToday } from './context.ts';
import { activeLcos, ts303Alerts } from './operability.ts';
import { pmCompliance, planRows } from './pm.ts';

export function overview(ctx: AppContext) {
  const today = plantToday(ctx);
  const tz = repo.getPlant(ctx.db)!.timezone;
  const open = repo.listWorkOrders(ctx.db, { statuses: OPEN_STATUSES });
  const equipment = repo.listEquipment(ctx.db);
  const tagOf = new Map(equipment.map((e) => [e.id, e.tag]));

  const byStatus = Object.fromEntries(OPEN_STATUSES.map((s) => [s, open.filter((w) => w.status === s).length])) as Record<WorkStatus, number>;
  const disciplines: Discipline[] = ['mechanical', 'electrical', 'ic'];
  const backlog = disciplines.map((d) => {
    const mine = open.filter((w) => w.discipline === d);
    return { discipline: d, total: mine.length, corrective: mine.filter((w) => w.type === 'CM').length, hours: Math.round(mine.reduce((s, w) => s + w.estHours, 0)) };
  });

  const ageBuckets = [
    { label: '0–30 days', min: 0, max: 30 },
    { label: '31–90 days', min: 31, max: 90 },
    { label: '91–180 days', min: 91, max: 180 },
    { label: 'Over 180 days', min: 181, max: Infinity },
  ].map((b) => ({
    label: b.label,
    count: open.filter((w) => w.type === 'CM').filter((w) => {
      const age = daysBetween(dateIn(tz, new Date(w.createdAt)), today);
      return age >= b.min && age <= b.max;
    }).length,
  }));

  const plans = planRows(ctx);
  const attention = plans
    .filter((r) => r.due.state !== 'ok')
    .slice(0, 8)
    .map((r) => ({ planId: r.plan.id, title: r.plan.title, type: r.plan.type, srRef: r.plan.srRef, tag: r.equipment.tag, due: r.due, openWorkOrder: r.openWorkOrder }));

  // Closed work per week for the last 12 weeks.
  const firstWeek = addDays(weekStart(today), -77);
  const closed = repo.listWorkOrders(ctx.db, { statuses: ['closed'], closedSince: new Date(Date.parse(`${firstWeek}T00:00:00Z`) - 86_400_000).toISOString() });
  const weeks = Array.from({ length: 12 }, (_, i) => addDays(firstWeek, i * 7));
  const throughput = weeks.map((week) => {
    const inWeek = closed.filter((w) => weekStart(dateIn(tz, new Date(w.closedAt!))) === week);
    return { week, closed: inWeek.length, corrective: inWeek.filter((w) => w.type === 'CM').length };
  });

  const parts = repo.listParts(ctx.db);
  const lowParts = parts.filter(belowReorder);

  return {
    today,
    openTotal: open.length,
    byStatus,
    emergent: open
      .filter((w) => w.priority <= 2)
      .sort((a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt))
      .map((w) => ({ id: w.id, number: w.number, title: w.title, priority: w.priority, status: w.status, type: w.type, tag: tagOf.get(w.equipmentId)!, createdAt: w.createdAt })),
    lcos: activeLcos(ctx),
    ts303: ts303Alerts(ctx),
    attention,
    overdueCount: plans.filter((r) => r.due.state === 'overdue').length,
    inGraceCount: plans.filter((r) => r.due.state === 'in_grace').length,
    compliance: pmCompliance(ctx, new Date(ctx.now().getTime() - 90 * 86_400_000).toISOString()),
    backlog,
    ageBuckets,
    throughput,
    equipmentDown: equipment.filter((e) => e.status !== 'operable'),
    lowParts: lowParts.length,
    criticalSparesLow: lowParts.filter((p) => p.criticalSpare).length,
  };
}
