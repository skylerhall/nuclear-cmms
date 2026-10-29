// The work order lifecycle and the operability rules it enforces.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as repo from '../server/db/repo.ts';
import { RuleError } from '../server/engine/context.ts';
import { activeLcos, ts303Alerts } from '../server/engine/operability.ts';
import * as wf from '../server/engine/workflow.ts';
import { eq, openWork, seeded, who } from './helpers.ts';

function rejects(fn: () => unknown, status: number, pattern: RegExp) {
  assert.throws(fn, (err: unknown) => err instanceof RuleError && err.status === status && pattern.test(err.message));
}

test('releasing work on Tech Spec equipment enters the LCO and starts its clock; only the SRO can release', () => {
  const ctx = seeded();
  const wo = openWork(ctx, '1-RHR-MOV-8701B', /Limit switch/);
  assert.equal(wo.status, 'ready');

  rejects(() => wf.performAction(ctx, who(ctx, 'dana'), wo.id, 'release'), 403, /Shift Manager/);
  wf.performAction(ctx, who(ctx, 'sam'), wo.id, 'release');

  const after = repo.getWorkOrder(ctx.db, wo.id)!;
  assert.equal(after.status, 'in_progress');
  assert.equal(after.clearanceStatus, 'hung');
  assert.equal(eq(ctx, '1-RHR-MOV-8701B').status, 'inoperable');
  const lco = activeLcos(ctx).find((l) => l.equipment.tag === '1-RHR-MOV-8701B')!;
  assert.equal(lco.techSpec.code, '3.5.2');
  assert.equal(Math.round(lco.hoursRemaining), 72);
});

test('protected train: EDG 1A work that removes it from service is blocked while EDG 1B is inoperable', () => {
  const ctx = seeded();
  const wo = openWork(ctx, '1-EDG-DG-1A', /18-month/);
  const option = wf.actionOptions(ctx, wo, who(ctx, 'sam')).find((o) => o.action === 'release')!;
  const gate = option.gates.find((g) => /protected train/.test(g.label))!;
  assert.equal(gate.ok, false);
  assert.match(gate.detail!, /1-EDG-DG-1B/);
  rejects(() => wf.performAction(ctx, who(ctx, 'sam'), wo.id, 'release'), 409, /3\.0\.3/);
  assert.equal(eq(ctx, '1-EDG-DG-1A').status, 'operable');
});

test('a full corrective job: steps, QC hold, PMT, Maintenance Rule evaluation, and SRO return to service', () => {
  const ctx = seeded();
  const wo = openWork(ctx, '1-RHR-MOV-8701B', /Limit switch/);
  const [tom, rachel, sam, marcus, priya] = ['tom', 'rachel', 'sam', 'marcus', 'priya'].map((id) => who(ctx, id));
  wf.performAction(ctx, sam, wo.id, 'release');
  const steps = repo.listSteps(ctx.db, wo.id);
  const qc = steps.find((s) => s.kind === 'qc_hold')!;
  const pmt = steps.find((s) => s.kind === 'pmt')!;

  rejects(() => wf.signStep(ctx, tom, wo.id, qc.id, null), 403, /QC Inspector/);
  rejects(() => wf.signStep(ctx, tom, wo.id, pmt.id, 14), 409, /after the work is complete/);
  for (const s of steps.filter((s) => s.kind === 'step')) wf.signStep(ctx, tom, wo.id, s.id, null);

  // QC hasn't signed and no labor is charged yet.
  rejects(() => wf.performAction(ctx, tom, wo.id, 'work_complete'), 409, /QC hold points.*Labor charged/);
  wf.signStep(ctx, rachel, wo.id, qc.id, null);
  wf.logLabor(ctx, tom, wo.id, 5, 'Replaced rotor 4');
  wf.performAction(ctx, tom, wo.id, 'work_complete');
  assert.equal(repo.getWorkOrder(ctx.db, wo.id)!.clearanceStatus, 'released');

  wf.signStep(ctx, tom, wo.id, pmt.id, 14.8);
  // Corrective work on safety-related equipment needs the engineer's Maintenance Rule call before it closes.
  rejects(() => wf.performAction(ctx, sam, wo.id, 'close'), 409, /Maintenance Rule/);
  wf.evaluateMaintenanceRule(ctx, priya, wo.id, false, 'Indication fault only; valve stroked and seated normally. Not a functional failure.');
  rejects(() => wf.performAction(ctx, marcus, wo.id, 'close'), 403, /Shift Manager/);
  wf.performAction(ctx, sam, wo.id, 'close');

  assert.equal(repo.getWorkOrder(ctx.db, wo.id)!.status, 'closed');
  assert.equal(eq(ctx, '1-RHR-MOV-8701B').status, 'operable');
  assert.ok(!activeLcos(ctx).some((l) => l.equipment.tag === '1-RHR-MOV-8701B'));
  const trail = repo.listAudit(ctx.db, { entityId: eq(ctx, '1-RHR-MOV-8701B').id }).rows.map((a) => a.action);
  assert.deepEqual(trail.slice(0, 2), ['lco.exit', 'lco.enter']);
});

test('a package is not ready without a PMT, and safety-related work only takes Q-level parts', () => {
  const ctx = seeded();
  const dana = who(ctx, 'dana');
  const wo = openWork(ctx, '1-CCW-P-1B', /Out of tolerance/);
  assert.equal(wo.parentWoId !== null, true);
  rejects(() => wf.performAction(ctx, dana, wo.id, 'ready'), 409, /Post-maintenance test/);

  const grease = repo.listParts(ctx.db).find((p) => p.quality === 'NQ' && /Grease/.test(p.description))!;
  rejects(() => wf.reservePart(ctx, dana, wo.id, grease.id, 1), 409, /Q-level/);

  wf.addStep(ctx, dana, wo.id, { kind: 'pmt', text: 'Run pump 1 h; motor outboard bearing vibration', unit: 'in/s', max: 0.3 });
  wf.performAction(ctx, dana, wo.id, 'ready');
  assert.equal(repo.getWorkOrder(ctx.db, wo.id)!.status, 'ready');
});

test('a failed surveillance reading declares the equipment inoperable, enters the LCO and raises corrective work', () => {
  const ctx = seeded();
  const tom = who(ctx, 'tom');
  const ist = openWork(ctx, '1-RHR-P-1A', /inservice test/);
  const vib = repo.listSteps(ctx.db, ist.id).find((s) => /outboard bearing vibration/.test(s.text))!;

  const result = wf.signStep(ctx, tom, ist.id, vib.id, 0.41);
  assert.equal(result.step.result, 'fail');
  assert.equal(result.enteredLco, true);
  assert.ok(result.followUp);
  const follow = repo.getWorkOrder(ctx.db, result.followUp!.id)!;
  assert.equal(follow.parentWoId, ist.id);
  assert.equal(follow.priority, 2);
  assert.equal(follow.requiresOos, true);
  assert.equal(eq(ctx, '1-RHR-P-1A').status, 'inoperable');
  const lco = activeLcos(ctx).find((l) => l.equipment.tag === '1-RHR-P-1A')!;
  assert.equal(lco.techSpec.code, '3.5.2');
  assert.equal(lco.workOrder?.id, follow.id);

  // The surveillance can't be completed on a failed reading, but it can be re-performed after rework.
  rejects(() => wf.performAction(ctx, tom, ist.id, 'work_complete'), 409, /Re-perform step/);
  const again = wf.signStep(ctx, tom, ist.id, vib.id, 0.19);
  assert.equal(again.step.result, 'pass');
  assert.equal(again.followUp, null);
});

test('LCO clocks run down, and an emergent failure on the other train raises LCO 3.0.3', () => {
  const ctx = seeded();
  const edg = activeLcos(ctx).find((l) => l.equipment.tag === '1-EDG-DG-1B')!;
  assert.ok(edg.hoursRemaining > 40 && edg.hoursRemaining < 42);
  ctx.advance(42);
  assert.equal(activeLcos(ctx).find((l) => l.equipment.tag === '1-EDG-DG-1B')!.expired, true);

  assert.equal(ts303Alerts(ctx).length, 0);
  rejects(() => wf.declareInoperable(ctx, who(ctx, 'tom'), eq(ctx, '1-EDG-DG-1A').id, 'Jacket water leak'), 403, /Shift Manager/);
  const wo = wf.declareInoperable(ctx, who(ctx, 'sam'), eq(ctx, '1-EDG-DG-1A').id, 'Fuel oil leak at injection pump 3L; engine secured');
  assert.equal(wo.priority, 1);
  assert.equal(wo.origin, 'emergent');
  const alerts = ts303Alerts(ctx);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].techSpec.code, '3.8.1');
});

test('issuing parts draws down stock, and cancelling releases reservations', () => {
  const ctx = seeded();
  const wo = openWork(ctx, '1-EDG-DG-1B', /injector/);
  const gasketLine = repo.listWorkParts(ctx.db, wo.id).find((l) => l.qtyIssued === 0)!;
  const before = repo.getPart(ctx.db, gasketLine.partId)!;
  wf.issuePart(ctx, who(ctx, 'tom'), wo.id, gasketLine.id);
  const after = repo.getPart(ctx.db, gasketLine.partId)!;
  assert.equal(after.onHand, before.onHand - 1);
  rejects(() => wf.issuePart(ctx, who(ctx, 'tom'), wo.id, gasketLine.id), 409, /already been issued/);

  const chiller = openWork(ctx, '1-HVAC-CH-1', /refrigerant/);
  const r134 = repo.listWorkParts(ctx.db, chiller.id)[0];
  const reservedBefore = repo.getPart(ctx.db, r134.partId)!.reserved;
  rejects(() => wf.performAction(ctx, who(ctx, 'marcus'), chiller.id, 'cancel', { reason: 'no' }), 400, /reason/);
  wf.performAction(ctx, who(ctx, 'marcus'), chiller.id, 'cancel', { reason: 'Duplicate of chiller PM scope' });
  assert.equal(repo.getPart(ctx.db, r134.partId)!.reserved, reservedBefore - 1);
});
