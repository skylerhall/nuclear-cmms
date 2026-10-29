// PM and surveillance due dates, the generator, and Maintenance Rule monitoring.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as repo from '../server/db/repo.ts';
import { generatePmWork, planRows } from '../server/engine/pm.ts';
import { systemReliability } from '../server/engine/reliability.ts';
import * as wf from '../server/engine/workflow.ts';
import { pmDue } from '../shared/rules.ts';
import { openWork, seeded, who } from './helpers.ts';

const quarterly = { intervalDays: 92, intervalHours: null, gracePct: 25, leadDays: 10, lastDoneDate: '2026-07-01', lastDoneHours: null };

test('SR 3.0.2: a quarterly surveillance is due at 92 days and missed after the 25% grace', () => {
  assert.deepEqual(pmDue(quarterly, '2026-09-01', null), { basis: 'calendar', dueDate: '2026-10-01', lateDate: '2026-10-24', dueHours: null, lateHours: null, remaining: 30, state: 'ok' });
  assert.equal(pmDue(quarterly, '2026-09-21', null).state, 'due_soon');
  assert.equal(pmDue(quarterly, '2026-10-10', null).state, 'in_grace');
  assert.equal(pmDue(quarterly, '2026-10-24', null).state, 'in_grace');
  assert.equal(pmDue(quarterly, '2026-10-25', null).state, 'overdue');
});

test('meter-based PMs come due on run hours', () => {
  const plan = { intervalDays: null, intervalHours: 4000, gracePct: 25, leadDays: 14, lastDoneDate: null, lastDoneHours: 10_000 };
  assert.equal(pmDue(plan, '2026-10-29', 13_000).state, 'ok');
  assert.equal(pmDue(plan, '2026-10-29', 13_700).state, 'due_soon');
  assert.equal(pmDue(plan, '2026-10-29', 14_500).state, 'in_grace');
  assert.equal(pmDue(plan, '2026-10-29', 15_100).state, 'overdue');
  assert.equal(pmDue(plan, '2026-10-29', 13_700).remaining, 300);
});

test('the PM generator is idempotent, and closing the work moves the next due date', () => {
  const ctx = seeded();
  assert.equal(generatePmWork(ctx).length, 0, 'seed already generated everything due');
  for (const row of planRows(ctx)) if (row.due.state !== 'ok') assert.ok(row.openWorkOrder, `${row.plan.title} has open work`);

  // A week later, the next round of weekly checks comes due once.
  ctx.advance(24 * 7);
  const created = generatePmWork(ctx);
  assert.ok(created.some((w) => /Battery 1B weekly/.test(w.title)));
  assert.equal(generatePmWork(ctx).length, 0);

  // Work the battery check through to closure; the plan's last-done date moves to today.
  const [dana, sam, elena] = ['dana', 'sam', 'elena'].map((id) => who(ctx, id));
  const wo = created.find((w) => /Battery 1B weekly/.test(w.title))!;
  wf.performAction(ctx, dana, wo.id, 'ready');
  wf.performAction(ctx, sam, wo.id, 'release');
  const values: Record<string, number> = { 'Battery terminal float voltage': 132.5, 'Pilot cell voltage': 2.2, 'Pilot cell specific gravity (corrected)': 1.21 };
  for (const s of repo.listSteps(ctx.db, wo.id)) wf.signStep(ctx, elena, wo.id, s.id, values[s.text] ?? null);
  wf.logLabor(ctx, elena, wo.id, 0.5, '');
  wf.performAction(ctx, elena, wo.id, 'work_complete');
  wf.performAction(ctx, sam, wo.id, 'close');
  const row = planRows(ctx).find((r) => r.plan.id === wo.pmPlanId)!;
  assert.equal(row.plan.lastDoneDate, '2026-11-05');
  assert.equal(row.due.dueDate, '2026-11-12');
  assert.equal(row.openWorkOrder, null);
});

test('Maintenance Rule: Service Water is over its criteria, CCW is at its limit until one more failure', () => {
  const ctx = seeded();
  const bySystem = () => new Map(systemReliability(ctx).map((r) => [r.system.code, r]));
  const before = bySystem();
  assert.equal(before.get('SW')!.status, 'a1');
  assert.equal(before.get('CCW')!.status, 'watch');
  assert.equal(before.get('CCW')!.functionalFailures, 2);
  assert.equal(before.get('AFW')!.status, 'a2');

  const cm = openWork(ctx, '1-CCW-P-1B', /Out of tolerance/);
  wf.evaluateMaintenanceRule(ctx, who(ctx, 'priya'), cm.id, true, 'Bearing degradation would have led to pump failure within the mission time.');
  const after = bySystem();
  assert.equal(after.get('CCW')!.functionalFailures, 3);
  assert.equal(after.get('CCW')!.status, 'a1');
});
