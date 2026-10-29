// The work order lifecycle. Every action runs the same gate list the dashboard
// shows, so the UI can never offer something the server would refuse.
//
//   requested → planning → ready → in_progress → testing → closed
//   (screen)    (ready)    (release, SRO)  (work complete)  (close / return to service)
import { transaction } from '../db/database.ts';
import * as repo from '../db/repo.ts';
import { ACTIONS, OPEN_STATUSES, actionRoles, criteriaText, needsValue, readingResult, stepPhase, stepRoles, STEP_KIND_LABEL } from '../../shared/rules.ts';
import type {
  ActionOption,
  ClearancePoint,
  Discipline,
  Equipment,
  Gate,
  Person,
  PlanStep,
  PmDue,
  PmPlan,
  Priority,
  StepKind,
  WorkAction,
  WorkOrder,
  WorkOrigin,
  WorkStep,
  WorkType,
} from '../../shared/types.ts';
import { audit } from './audit.ts';
import { type AppContext, RuleError, nowIso, plantToday, requireRole } from './context.ts';
import { enterOos, protectedTrainConflicts, restoreEquipment } from './operability.ts';

function load(ctx: AppContext, woId: string): WorkOrder {
  const wo = repo.getWorkOrder(ctx.db, woId);
  if (!wo) throw new RuleError('Work order not found', 404);
  return wo;
}

function equipmentOf(ctx: AppContext, wo: WorkOrder): Equipment {
  return repo.getEquipment(ctx.db, wo.equipmentId)!;
}

function touch(ctx: AppContext, woId: string, patch: Partial<WorkOrder> = {}): void {
  repo.updateWorkOrder(ctx.db, woId, { ...patch, updatedAt: nowIso(ctx) });
}

function requireStatus(wo: WorkOrder, statuses: WorkOrder['status'][], what: string): void {
  if (!statuses.includes(wo.status)) throw new RuleError(`Can't ${what} while the work order is ${wo.status.replace('_', ' ')}.`, 409);
}

/** A plausible isolation boundary for a component, used when a PM is generated. */
export function defaultClearance(e: Equipment): ClearancePoint[] {
  const base = e.tag;
  switch (e.equipmentType) {
    case 'Pump':
    case 'Fan':
    case 'Compressor':
    case 'Chiller':
      return [
        { point: `${base} motor breaker`, position: 'Racked out, Danger tag' },
        { point: `${base} control power fuses`, position: 'Removed, Danger tag' },
        ...(e.equipmentType === 'Pump'
          ? [
              { point: `${base} suction isolation`, position: 'Closed, Danger tag' },
              { point: `${base} discharge isolation`, position: 'Closed, Danger tag' },
              { point: `${base} casing vent and drain`, position: 'Open, Caution tag' },
            ]
          : []),
      ];
    case 'Motor-operated valve':
      return [
        { point: `${base} MOV breaker`, position: 'Open, Danger tag' },
        { point: 'Upstream manual isolation', position: 'Closed, Danger tag' },
      ];
    case 'Diesel generator':
      return [
        { point: `${base} output breaker`, position: 'Racked out, Danger tag' },
        { point: `${base} air start valves`, position: 'Closed, Danger tag' },
        { point: `${base} fuel rack`, position: 'Locked at no-fuel, Danger tag' },
        { point: `${base} jacket water heater`, position: 'Off, Caution tag' },
      ];
    case 'Battery':
    case 'Battery charger':
      return [{ point: `${base} output breaker`, position: 'Open, Danger tag' }];
    case 'Breaker':
    case 'Switchgear':
    case 'Transformer':
      return [
        { point: `${base} upstream feeder`, position: 'Open and racked out, Danger tag' },
        { point: `${base} grounding device`, position: 'Installed, Danger tag' },
      ];
    default:
      return [{ point: `${base} power supply`, position: 'Open, Danger tag' }];
  }
}

// ── Creating work ──────────────────────────────────────────────────────────

export interface NewWork {
  equipmentId: string;
  title: string;
  description?: string;
  type?: WorkType;
  priority?: Priority;
  status?: WorkOrder['status'];
  origin?: WorkOrigin;
  discipline?: Discipline;
  requiresOos?: boolean;
  clearancePoints?: ClearancePoint[];
  estHours?: number;
  estDoseMrem?: number;
  radArea?: boolean;
  fme?: boolean;
  confinedSpace?: boolean;
  pmPlanId?: string | null;
  dueDate?: string | null;
  lateDate?: string | null;
  scheduledDate?: string | null;
  parentWoId?: string | null;
  sourceStepId?: string | null;
  steps?: PlanStep[];
  at?: string;
}

/** Inserts a work order. Callers check roles; anyone can raise a request. */
export function insertWork(ctx: AppContext, actor: Person | null, input: NewWork): WorkOrder {
  const equipment = repo.getEquipment(ctx.db, input.equipmentId);
  if (!equipment) throw new RuleError('Equipment not found', 404);
  const title = input.title.trim();
  if (title.length < 4) throw new RuleError('Give the work order a short title describing the problem.');
  const at = input.at ?? nowIso(ctx);
  const wo: WorkOrder = {
    id: repo.newId('wo'),
    number: repo.nextWorkOrderNumber(ctx.db, new Date(at).getUTCFullYear()),
    title,
    description: input.description?.trim() ?? '',
    equipmentId: equipment.id,
    type: input.type ?? 'CM',
    priority: input.priority ?? 3,
    status: input.status ?? 'requested',
    discipline: input.discipline ?? equipment.discipline,
    pmPlanId: input.pmPlanId ?? null,
    dueDate: input.dueDate ?? null,
    lateDate: input.lateDate ?? null,
    scheduledDate: input.scheduledDate ?? null,
    requiresOos: input.requiresOos ?? false,
    clearancePoints: input.clearancePoints ?? [],
    clearanceStatus: 'none',
    estHours: input.estHours ?? 0,
    estDoseMrem: input.estDoseMrem ?? 0,
    radArea: input.radArea ?? false,
    fme: input.fme ?? false,
    confinedSpace: input.confinedSpace ?? false,
    functionalFailure: null,
    mrNote: null,
    parentWoId: input.parentWoId ?? null,
    sourceStepId: input.sourceStepId ?? null,
    origin: input.origin ?? 'request',
    requestedBy: actor?.name ?? 'PM generator',
    createdAt: at,
    updatedAt: at,
    releasedAt: null,
    releasedBy: null,
    workCompleteAt: null,
    closedAt: null,
    closedBy: null,
    cancelReason: null,
  };
  repo.insertWorkOrder(ctx.db, wo);
  (input.steps ?? []).forEach((s, i) => repo.insertStep(ctx.db, planStepToStep(wo.id, i + 1, s)));
  audit(ctx, actor, 'wo.create', 'work_order', wo.id, `${wo.number} created: ${wo.title} (${equipment.tag})`, at);
  return wo;
}

function planStepToStep(woId: string, seq: number, s: PlanStep): WorkStep {
  return { id: repo.newId('st'), woId, seq, kind: s.kind, text: s.text, unit: s.unit ?? null, minValue: s.min ?? null, maxValue: s.max ?? null, value: null, result: null, completedBy: null, completedAt: null };
}

/** A work request from anyone at the plant (an operator's deficiency tag, a tech's finding). */
export function requestWork(ctx: AppContext, actor: Person, input: { equipmentId: string; title: string; description?: string; priority?: Priority; type?: WorkType }): WorkOrder {
  return transaction(ctx.db, () => insertWork(ctx, actor, { ...input, origin: 'request' }));
}

/** Generates the work order for a PM or surveillance that's coming due. */
export function workFromPlan(ctx: AppContext, plan: PmPlan, due: PmDue, at?: string): WorkOrder {
  const equipment = repo.getEquipment(ctx.db, plan.equipmentId)!;
  const meter = due.basis === 'meter' ? ` at ${due.dueHours?.toLocaleString('en-US')} run hours` : '';
  return insertWork(ctx, null, {
    equipmentId: plan.equipmentId,
    title: plan.title,
    description: `${plan.srRef ? `${plan.srRef}. ` : ''}Generated from the ${plan.type === 'ST' ? 'surveillance' : 'PM'} schedule${meter}.`,
    type: plan.type,
    priority: plan.type === 'ST' ? 2 : 3,
    status: 'planning',
    origin: 'pm_generator',
    discipline: plan.discipline,
    requiresOos: plan.requiresOos,
    clearancePoints: plan.requiresOos ? defaultClearance(equipment) : [],
    estHours: plan.estHours,
    pmPlanId: plan.id,
    dueDate: due.dueDate,
    lateDate: due.lateDate,
    steps: plan.steps,
    at,
  });
}

// ── Planning ───────────────────────────────────────────────────────────────

export interface PlanningPatch {
  title?: string;
  description?: string;
  priority?: Priority;
  discipline?: Discipline;
  requiresOos?: boolean;
  clearancePoints?: ClearancePoint[];
  estHours?: number;
  estDoseMrem?: number;
  radArea?: boolean;
  fme?: boolean;
  confinedSpace?: boolean;
  scheduledDate?: string | null;
}

export function updatePlanning(ctx: AppContext, actor: Person, woId: string, patch: PlanningPatch): WorkOrder {
  return transaction(ctx.db, () => {
    const wo = load(ctx, woId);
    const onlySchedule = Object.keys(patch).every((k) => k === 'scheduledDate' || k === 'priority');
    if (onlySchedule) {
      requireRole(actor, ['planner', 'supervisor'], 'change the schedule');
      requireStatus(wo, ['requested', 'planning', 'ready'], 'reschedule');
    } else {
      requireRole(actor, ['planner'], 'edit the work package');
      requireStatus(wo, ['planning'], 'edit the work package');
    }
    if (patch.estHours !== undefined && !(patch.estHours >= 0 && patch.estHours <= 2000)) throw new RuleError('Estimated hours must be between 0 and 2,000.');
    if (patch.estDoseMrem !== undefined && !(patch.estDoseMrem >= 0 && patch.estDoseMrem <= 5000)) throw new RuleError('Dose estimate must be between 0 and 5,000 mrem.');
    if (patch.requiresOos === false && repo.openOosForEquipment(ctx.db, wo.equipmentId).some((e) => e.woId === wo.id)) {
      throw new RuleError('This work order holds the equipment out of service, so it has to return it to service.');
    }
    const clean: Partial<WorkOrder> = { ...patch };
    if (patch.clearancePoints) clean.clearancePoints = patch.clearancePoints.map((c) => ({ point: String(c.point ?? '').trim(), position: String(c.position ?? '').trim() })).filter((c) => c.point);
    touch(ctx, wo.id, clean);
    audit(ctx, actor, 'wo.edit', 'work_order', wo.id, `${wo.number} work package updated (${Object.keys(patch).join(', ')})`);
    return load(ctx, wo.id);
  });
}

export function addStep(ctx: AppContext, actor: Person, woId: string, input: { kind: StepKind; text: string; unit?: string | null; min?: number | null; max?: number | null }): WorkStep {
  return transaction(ctx.db, () => {
    const wo = load(ctx, woId);
    requireRole(actor, ['planner'], 'edit the work package');
    requireStatus(wo, ['planning'], 'add steps');
    if (!['step', 'reading', 'qc_hold', 'pmt'].includes(input.kind)) throw new RuleError('Unknown step type.');
    const text = input.text.trim();
    if (text.length < 4) throw new RuleError('Describe the step.');
    const min = input.min ?? null;
    const max = input.max ?? null;
    if (input.kind === 'reading' && min === null && max === null) throw new RuleError('A reading needs an acceptance criterion (a minimum, a maximum, or both).');
    if (min !== null && max !== null && min > max) throw new RuleError('The minimum is above the maximum.');
    const step: WorkStep = { ...planStepToStep(wo.id, repo.nextStepSeq(ctx.db, wo.id), { kind: input.kind, text }), unit: input.unit?.trim() || null, minValue: min, maxValue: max };
    repo.insertStep(ctx.db, step);
    touch(ctx, wo.id);
    audit(ctx, actor, 'wo.step_add', 'work_order', wo.id, `${wo.number}: added ${STEP_KIND_LABEL[step.kind].toLowerCase()} "${text}"`);
    return step;
  });
}

export function removeStep(ctx: AppContext, actor: Person, woId: string, stepId: string): void {
  transaction(ctx.db, () => {
    const wo = load(ctx, woId);
    requireRole(actor, ['planner'], 'edit the work package');
    requireStatus(wo, ['planning'], 'remove steps');
    const step = repo.getStep(ctx.db, stepId);
    if (!step || step.woId !== wo.id) throw new RuleError('Step not found', 404);
    repo.deleteStep(ctx.db, stepId);
    touch(ctx, wo.id);
    audit(ctx, actor, 'wo.step_remove', 'work_order', wo.id, `${wo.number}: removed step "${step.text}"`);
  });
}

// ── Parts & labor ──────────────────────────────────────────────────────────

export function reservePart(ctx: AppContext, actor: Person, woId: string, partId: string, qty: number): void {
  transaction(ctx.db, () => {
    const wo = load(ctx, woId);
    requireRole(actor, ['planner'], 'reserve parts');
    requireStatus(wo, ['planning', 'ready'], 'reserve parts');
    const part = repo.getPart(ctx.db, partId);
    if (!part) throw new RuleError('Part not found', 404);
    if (!Number.isInteger(qty) || qty < 1 || qty > 500) throw new RuleError('Quantity must be a whole number from 1 to 500.');
    const equipment = equipmentOf(ctx, wo);
    if (equipment.safetyClass === 'SR' && part.quality !== 'Q') {
      throw new RuleError(`${equipment.tag} is safety-related, so it needs Q-level parts. ${part.stockCode} is commercial grade and would need a commercial-grade dedication first.`, 409);
    }
    const existing = repo.listWorkParts(ctx.db, wo.id).find((p) => p.partId === partId);
    if (existing) repo.updateWorkPart(ctx.db, existing.id, existing.qtyReserved + qty, existing.qtyIssued);
    else repo.insertWorkPart(ctx.db, { id: repo.newId('wp'), woId: wo.id, partId, qtyReserved: qty, qtyIssued: 0 });
    touch(ctx, wo.id);
    audit(ctx, actor, 'wo.part_reserve', 'work_order', wo.id, `${wo.number}: reserved ${qty} × ${part.stockCode} ${part.description}`);
  });
}

export function unreservePart(ctx: AppContext, actor: Person, woId: string, lineId: string): void {
  transaction(ctx.db, () => {
    const wo = load(ctx, woId);
    requireRole(actor, ['planner'], 'change part reservations');
    requireStatus(wo, ['planning', 'ready'], 'change part reservations');
    const line = repo.getWorkPart(ctx.db, lineId);
    if (!line || line.woId !== wo.id) throw new RuleError('Part line not found', 404);
    if (line.qtyIssued > 0) throw new RuleError('Parts already issued to the field have to be returned to the storeroom first.', 409);
    repo.deleteWorkPart(ctx.db, lineId);
    touch(ctx, wo.id);
    audit(ctx, actor, 'wo.part_unreserve', 'work_order', wo.id, `${wo.number}: released a part reservation`);
  });
}

export function issuePart(ctx: AppContext, actor: Person, woId: string, lineId: string): void {
  transaction(ctx.db, () => {
    const wo = load(ctx, woId);
    requireRole(actor, ['technician', 'supervisor'], 'draw parts from the storeroom');
    requireStatus(wo, ['in_progress', 'testing'], 'issue parts');
    const line = repo.getWorkPart(ctx.db, lineId);
    if (!line || line.woId !== wo.id) throw new RuleError('Part line not found', 404);
    const qty = line.qtyReserved - line.qtyIssued;
    if (qty <= 0) throw new RuleError('Everything reserved on this line has already been issued.', 409);
    const part = repo.getPart(ctx.db, line.partId)!;
    if (part.onHand < qty) throw new RuleError(`Only ${part.onHand} of ${part.stockCode} on hand; ${qty} needed.`, 409);
    repo.adjustOnHand(ctx.db, part.id, -qty);
    repo.updateWorkPart(ctx.db, line.id, line.qtyReserved, line.qtyReserved);
    touch(ctx, wo.id);
    audit(ctx, actor, 'wo.part_issue', 'work_order', wo.id, `${wo.number}: issued ${qty} × ${part.stockCode} from ${part.bin}`);
  });
}

export function logLabor(ctx: AppContext, actor: Person, woId: string, hours: number, note: string): void {
  transaction(ctx.db, () => {
    const wo = load(ctx, woId);
    requireRole(actor, ['technician', 'supervisor'], 'charge labor');
    requireStatus(wo, ['in_progress', 'testing'], 'charge labor');
    if (!(hours >= 0.25 && hours <= 16)) throw new RuleError('Hours must be between 0.25 and 16 per entry.');
    repo.insertLabor(ctx.db, { id: repo.newId('lb'), woId: wo.id, personId: actor.id, hours, workedOn: plantToday(ctx), note: note.trim() });
    touch(ctx, wo.id);
    audit(ctx, actor, 'wo.labor', 'work_order', wo.id, `${wo.number}: ${hours} h charged${note.trim() ? ` (${note.trim()})` : ''}`);
  });
}

// ── Field execution ────────────────────────────────────────────────────────

export interface SignResult {
  step: WorkStep;
  followUp: WorkOrder | null;
  enteredLco: boolean;
}

/** Signs off a step. Readings are checked against their acceptance criteria; a failure raises follow-up work. */
export function signStep(ctx: AppContext, actor: Person, woId: string, stepId: string, value: number | null): SignResult {
  return transaction(ctx.db, () => {
    const wo = load(ctx, woId);
    const step = repo.getStep(ctx.db, stepId);
    if (!step || step.woId !== wo.id) throw new RuleError('Step not found', 404);
    requireRole(actor, stepRoles(step.kind), `sign ${step.kind === 'qc_hold' ? 'a QC hold point' : 'work steps'}`);
    const phase = stepPhase(step.kind);
    if (wo.status !== phase) {
      throw new RuleError(phase === 'testing' ? 'Post-maintenance tests are signed after the work is complete and the clearance is released.' : 'Steps are signed while the work is in progress.', 409);
    }
    if (step.completedAt && step.result !== 'fail') throw new RuleError('This step is already signed.', 409);

    let result: 'pass' | 'fail' | null = null;
    if (needsValue(step)) {
      if (value === null || !Number.isFinite(value)) throw new RuleError(`Record the measured value (${criteriaText(step)}).`);
      result = readingResult(step, value);
    } else {
      value = null;
    }
    const at = nowIso(ctx);
    repo.signStep(ctx.db, step.id, { value, result, completedBy: actor.name, completedAt: at });
    touch(ctx, wo.id);
    const shown = value !== null ? ` ${value}${step.unit ? ` ${step.unit}` : ''}` : '';
    audit(ctx, actor, result === 'fail' ? 'wo.step_fail' : 'wo.step_sign', 'work_order', wo.id, `${wo.number} step ${step.seq}${result === 'fail' ? ' OUT OF TOLERANCE' : ' signed'}:${shown} ${step.text}`);

    const signed = repo.getStep(ctx.db, step.id)!;
    if (result !== 'fail') return { step: signed, followUp: null, enteredLco: false };
    return { step: signed, ...handleFailedReading(ctx, actor, wo, signed) };
  });
}

/**
 * A reading outside its acceptance criteria raises a corrective work request. A failed
 * surveillance on Tech Spec equipment also means the equipment no longer meets its
 * LCO, so it's declared inoperable and the clock starts now.
 */
function handleFailedReading(ctx: AppContext, actor: Person, wo: WorkOrder, step: WorkStep): { followUp: WorkOrder | null; enteredLco: boolean } {
  const equipment = equipmentOf(ctx, wo);
  const already = repo.listWorkOrders(ctx.db, { parentWoId: wo.id, statuses: OPEN_STATUSES }).find((w) => w.sourceStepId === step.id);
  const surveillanceFail = wo.type === 'ST' && Boolean(equipment.techSpecId) && equipment.status !== 'inoperable';
  const followUp =
    already ??
    insertWork(ctx, actor, {
      equipmentId: equipment.id,
      title: `Out of tolerance: ${step.text}`.slice(0, 120),
      description: `Recorded ${step.value}${step.unit ? ` ${step.unit}` : ''} during ${wo.number} step ${step.seq}. Acceptance criterion: ${criteriaText(step)}. Evaluate, repair and re-test.`,
      type: 'CM',
      priority: equipment.safetyClass === 'SR' ? 2 : 3,
      origin: 'failed_reading',
      parentWoId: wo.id,
      sourceStepId: step.id,
      requiresOos: surveillanceFail,
    });
  if (surveillanceFail) {
    enterOos(ctx, equipment, { woId: followUp.id, reason: `Surveillance ${wo.number} failed: ${step.text}`, actor });
    return { followUp: already ? null : followUp, enteredLco: true };
  }
  if (equipment.status === 'operable') repo.setEquipmentStatus(ctx.db, equipment.id, 'degraded', `Out-of-tolerance reading on ${wo.number}`);
  return { followUp: already ? null : followUp, enteredLco: false };
}

/** The system engineer's Maintenance Rule call: was this a functional failure? */
export function evaluateMaintenanceRule(ctx: AppContext, actor: Person, woId: string, functionalFailure: boolean, note: string): WorkOrder {
  return transaction(ctx.db, () => {
    const wo = load(ctx, woId);
    requireRole(actor, ['engineer'], 'make a Maintenance Rule evaluation');
    if (wo.type !== 'CM') throw new RuleError('Maintenance Rule evaluations apply to corrective work.');
    if (wo.status === 'cancelled') throw new RuleError('This work order is cancelled.', 409);
    if (note.trim().length < 10) throw new RuleError('Give the basis for the evaluation (at least a sentence).');
    touch(ctx, wo.id, { functionalFailure, mrNote: note.trim() });
    audit(ctx, actor, 'wo.mr_eval', 'work_order', wo.id, `${wo.number}: Maintenance Rule evaluation: ${functionalFailure ? 'FUNCTIONAL FAILURE' : 'not a functional failure'}. ${note.trim()}`);
    return load(ctx, wo.id);
  });
}

// ── Gates & transitions ────────────────────────────────────────────────────

function partsGate(ctx: AppContext, wo: WorkOrder): Gate {
  const short = repo
    .listWorkParts(ctx.db, wo.id)
    .map((line) => {
      const outstanding = line.qtyReserved - line.qtyIssued;
      // What's left for this line once every other open reservation is honored.
      const available = line.part.onHand - (line.part.reserved - outstanding);
      return { line, outstanding, available };
    })
    .filter((x) => x.outstanding > x.available);
  return {
    label: 'Reserved parts are in stock',
    ok: short.length === 0,
    detail: short.length ? short.map((x) => `${x.line.part.stockCode}: need ${x.outstanding}, ${Math.max(0, x.available)} available`).join('; ') : undefined,
  };
}

function stepsDone(steps: WorkStep[]): boolean {
  return steps.every((s) => s.completedAt && s.result !== 'fail');
}

/** The checks for one action, evaluated against the work order as it stands. */
export function gatesFor(ctx: AppContext, wo: WorkOrder, action: WorkAction): Gate[] {
  const equipment = equipmentOf(ctx, wo);
  const steps = repo.listSteps(ctx.db, wo.id);
  const ts = equipment.techSpecId ? repo.getTechSpec(ctx.db, equipment.techSpecId) : null;
  const sr = equipment.safetyClass === 'SR';
  const gates: Gate[] = [];

  switch (action) {
    case 'screen':
      gates.push({ label: 'Problem is described', ok: wo.title.length >= 4 });
      break;

    case 'ready': {
      const work = steps.filter((s) => s.kind === 'step' || s.kind === 'reading');
      gates.push({ label: 'Work instructions written', ok: work.length > 0, detail: work.length ? `${work.length} steps` : 'Add at least one work step' });
      gates.push({ label: 'Labor estimate entered', ok: wo.estHours > 0 });
      // Surveillances and predictive routes are tests themselves; maintenance needs QC and a PMT.
      const maintenance = wo.type === 'CM' || wo.type === 'PM';
      if (sr && maintenance) gates.push({ label: 'QC hold point included (safety-related)', ok: steps.some((s) => s.kind === 'qc_hold') });
      if (maintenance && (sr || wo.requiresOos)) gates.push({ label: 'Post-maintenance test defined', ok: steps.some((s) => s.kind === 'pmt'), detail: 'Proves the component works before it is declared operable' });
      if (wo.requiresOos) gates.push({ label: 'Clearance boundary defined', ok: wo.clearancePoints.length > 0, detail: wo.clearancePoints.length ? `${wo.clearancePoints.length} isolation points` : 'List the tagout points' });
      if (wo.radArea) gates.push({ label: 'ALARA dose estimate entered', ok: wo.estDoseMrem > 0 });
      gates.push(partsGate(ctx, wo));
      break;
    }

    case 'release': {
      if (wo.requiresOos && ts) {
        const conflicts = protectedTrainConflicts(ctx, equipment);
        gates.push({
          label: `Opposite train operable (protected train, ${ts.code})`,
          ok: conflicts.length === 0,
          detail: conflicts.length
            ? `${conflicts.map((c) => `${c.tag} (Train ${c.train})`).join(', ')} is inoperable. Removing Train ${equipment.train} too would leave no operable train (LCO 3.0.3).`
            : `Train ${equipment.train} can come out of service`,
        });
        gates.push({
          label: equipment.status === 'inoperable' ? `Already in LCO ${ts.code}` : `Enters LCO ${ts.code}: ${ts.completionHours} h to restore`,
          ok: true,
          detail: ts.condition,
        });
      } else if (wo.requiresOos) {
        gates.push({ label: 'Equipment comes out of service', ok: true, detail: 'No Tech Spec LCO applies' });
      }
      gates.push(partsGate(ctx, wo));
      break;
    }

    case 'work_complete': {
      const work = steps.filter((s) => s.kind === 'step' || s.kind === 'reading');
      const failed = steps.filter((s) => s.result === 'fail' && s.kind !== 'pmt');
      gates.push({ label: 'All work steps signed', ok: work.every((s) => s.completedAt), detail: `${work.filter((s) => s.completedAt).length} of ${work.length}` });
      if (wo.type === 'PDM') {
        // Predictive data is the deliverable: an out-of-limit value is handed to corrective work, not re-taken.
        const followUps = new Set(repo.listWorkOrders(ctx.db, { parentWoId: wo.id }).map((w) => w.sourceStepId));
        const unhanded = failed.filter((s) => !followUps.has(s.id));
        gates.push({ label: 'Out-of-limit findings handed to corrective work', ok: unhanded.length === 0, detail: failed.length ? `${failed.length} finding${failed.length === 1 ? '' : 's'}` : undefined });
      } else {
        gates.push({ label: 'Readings within acceptance criteria', ok: failed.length === 0, detail: failed.length ? `Re-perform step ${failed.map((s) => s.seq).join(', ')} after rework` : undefined });
      }
      const qc = steps.filter((s) => s.kind === 'qc_hold');
      if (qc.length) gates.push({ label: 'QC hold points signed by QC', ok: qc.every((s) => s.completedAt), detail: `${qc.filter((s) => s.completedAt).length} of ${qc.length}` });
      gates.push({ label: 'Labor charged', ok: repo.listLabor(ctx.db, wo.id).length > 0 });
      break;
    }

    case 'close': {
      const pmt = steps.filter((s) => s.kind === 'pmt');
      if (pmt.length) gates.push({ label: 'Post-maintenance test satisfactory', ok: stepsDone(pmt), detail: `${pmt.filter((s) => s.completedAt && s.result !== 'fail').length} of ${pmt.length}` });
      if (wo.type === 'CM' && equipment.safetyClass !== 'NSR') {
        gates.push({ label: 'Maintenance Rule evaluation done (System Engineer)', ok: wo.functionalFailure !== null, detail: wo.functionalFailure === null ? 'Engineer decides whether this was a functional failure' : wo.functionalFailure ? 'Functional failure' : 'Not a functional failure' });
      }
      if (wo.requiresOos) {
        gates.push({ label: ts ? `Declares ${equipment.tag} operable and exits LCO ${ts.code}` : `Returns ${equipment.tag} to service`, ok: true });
      }
      break;
    }

    case 'cancel': {
      const holding = repo.openOosForEquipment(ctx.db, wo.equipmentId).some((e) => e.woId === wo.id);
      gates.push({ label: 'Not holding equipment out of service', ok: !holding, detail: holding ? 'Finish the work and return the equipment to service instead' : undefined });
      break;
    }

    case 'return_to_planning':
      break;
  }
  return gates;
}

/** Actions available from the work order's current status, with their gates. */
export function actionOptions(ctx: AppContext, wo: WorkOrder, actor: Person): ActionOption[] {
  return (Object.keys(ACTIONS) as WorkAction[])
    .filter((a) => ACTIONS[a].from.includes(wo.status))
    .map((action) => {
      const roles = actionRoles(action, wo);
      return { action, label: ACTIONS[action].label, roles, allowedForActor: roles.includes(actor.role), gates: gatesFor(ctx, wo, action) };
    });
}

export function performAction(ctx: AppContext, actor: Person, woId: string, action: WorkAction, opts: { note?: string; reason?: string } = {}): WorkOrder {
  return transaction(ctx.db, () => {
    const wo = load(ctx, woId);
    const rule = ACTIONS[action];
    if (!rule) throw new RuleError('Unknown action');
    requireStatus(wo, rule.from, rule.label.toLowerCase());
    requireRole(actor, actionRoles(action, wo), rule.label.toLowerCase());
    const failing = gatesFor(ctx, wo, action).filter((g) => !g.ok);
    if (failing.length) throw new RuleError(`Not yet: ${failing.map((g) => (g.detail ? `${g.label} (${g.detail})` : g.label)).join('; ')}.`, 409);

    const at = nowIso(ctx);
    const equipment = equipmentOf(ctx, wo);
    const patch: Partial<WorkOrder> = { status: rule.to };
    const note = opts.note?.trim();

    switch (action) {
      case 'release':
        if (wo.requiresOos) {
          enterOos(ctx, equipment, { woId: wo.id, reason: `${wo.number}: ${wo.title}`, actor, at });
          if (wo.clearancePoints.length) patch.clearanceStatus = 'hung';
        }
        patch.releasedAt = at;
        patch.releasedBy = actor.name;
        break;
      case 'work_complete':
        if (wo.clearanceStatus === 'hung') patch.clearanceStatus = 'released';
        patch.workCompleteAt = at;
        break;
      case 'close': {
        // Unissued reservations go back to the storeroom.
        for (const line of repo.listWorkParts(ctx.db, wo.id)) if (line.qtyReserved > line.qtyIssued) repo.updateWorkPart(ctx.db, line.id, line.qtyIssued, line.qtyIssued);
        if (wo.requiresOos) {
          restoreEquipment(ctx, equipment, { woId: wo.id, actor, at });
        } else if (equipment.status === 'degraded' && wo.type === 'CM') {
          const others = repo.listWorkOrders(ctx.db, { equipmentId: equipment.id, statuses: OPEN_STATUSES }).filter((w) => w.id !== wo.id && w.type === 'CM');
          if (!others.length) repo.setEquipmentStatus(ctx.db, equipment.id, 'operable', null);
        }
        if (wo.pmPlanId) repo.markPmPlanDone(ctx.db, wo.pmPlanId, plantToday(ctx), repo.getEquipment(ctx.db, equipment.id)!.runHours);
        patch.closedAt = at;
        patch.closedBy = actor.name;
        break;
      }
      case 'cancel': {
        const reason = opts.reason?.trim() ?? note ?? '';
        if (reason.length < 5) throw new RuleError('Give a reason for cancelling.');
        for (const line of repo.listWorkParts(ctx.db, wo.id)) if (line.qtyIssued === 0) repo.deleteWorkPart(ctx.db, line.id);
        patch.cancelReason = reason;
        break;
      }
    }
    touch(ctx, wo.id, patch);
    const reason = action === 'cancel' ? patch.cancelReason : note;
    audit(ctx, actor, `wo.${action}`, 'work_order', wo.id, `${wo.number}: ${rule.label}${reason ? `. ${reason}` : ''}`, at);
    return load(ctx, wo.id);
  });
}

/** An SRO declares a component inoperable on the spot (an emergent failure found on rounds). */
export function declareInoperable(ctx: AppContext, actor: Person, equipmentId: string, reason: string): WorkOrder {
  return transaction(ctx.db, () => {
    requireRole(actor, ['sro'], 'declare equipment inoperable');
    const equipment = repo.getEquipment(ctx.db, equipmentId);
    if (!equipment) throw new RuleError('Equipment not found', 404);
    if (equipment.status === 'inoperable') throw new RuleError(`${equipment.tag} is already out of service.`, 409);
    if (reason.trim().length < 5) throw new RuleError('Describe what was found.');
    const wo = insertWork(ctx, actor, {
      equipmentId,
      title: reason.trim().slice(0, 120),
      description: `Emergent: declared inoperable by ${actor.name}. ${reason.trim()}`,
      type: 'CM',
      priority: equipment.safetyClass === 'SR' ? 1 : 2,
      origin: 'emergent',
      requiresOos: true,
    });
    enterOos(ctx, equipment, { woId: wo.id, reason: reason.trim(), actor });
    return wo;
  });
}

export function recordRunHours(ctx: AppContext, actor: Person, equipmentId: string, hours: number): void {
  transaction(ctx.db, () => {
    const equipment = repo.getEquipment(ctx.db, equipmentId);
    if (!equipment) throw new RuleError('Equipment not found', 404);
    if (equipment.runHours === null) throw new RuleError(`${equipment.tag} doesn't have a run-hour meter.`);
    if (!Number.isFinite(hours) || hours < equipment.runHours) throw new RuleError(`The meter reads ${equipment.runHours.toLocaleString('en-US')} h. A new reading can't be lower.`);
    if (hours - equipment.runHours > 2000) throw new RuleError('That is more than 2,000 hours since the last reading. Check the meter.');
    repo.setRunHours(ctx.db, equipment.id, hours);
    repo.insertMeterReading(ctx.db, { equipmentId: equipment.id, value: hours, readAt: nowIso(ctx), readBy: actor.name });
    audit(ctx, actor, 'equipment.meter', 'equipment', equipment.id, `${equipment.tag} run hours ${equipment.runHours.toLocaleString('en-US')} → ${hours.toLocaleString('en-US')}`);
  });
}

