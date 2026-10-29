// Data access: row mappers and small, explicit queries. Business rules live in
// server/engine; nothing here decides whether an action is allowed.
import { randomBytes } from 'node:crypto';
import type { DB } from './database.ts';
import type {
  AuditEntry,
  ClearancePoint,
  Equipment,
  EquipmentStatus,
  LaborEntry,
  OosEvent,
  Part,
  Person,
  Plant,
  PlantSystem,
  PmPlan,
  TechSpec,
  WorkOrder,
  WorkPart,
  WorkStep,
} from '../../shared/types.ts';

type Row = Record<string, any>;
type SqlValue = string | number | null;

const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newId(prefix: string): string {
  const bytes = randomBytes(12);
  let out = '';
  for (let i = 0; i < 12; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return `${prefix}_${out}`;
}

const b = (v: boolean) => (v ? 1 : 0);
const nb = (v: boolean | null) => (v === null ? null : b(v));

function all(db: DB, sql: string, ...params: SqlValue[]): Row[] {
  return db.prepare(sql).all(...params) as Row[];
}

function one(db: DB, sql: string, ...params: SqlValue[]): Row | undefined {
  return db.prepare(sql).get(...params) as Row | undefined;
}

function run(db: DB, sql: string, ...params: SqlValue[]): void {
  db.prepare(sql).run(...params);
}

/** UPDATE with only the given columns. */
function updateColumns(db: DB, table: string, id: string, columns: Record<string, SqlValue>): void {
  const keys = Object.keys(columns);
  if (!keys.length) return;
  run(db, `UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map((k) => columns[k]), id);
}

// ── Plant, people, systems, tech specs ─────────────────────────────────────

export function getPlant(db: DB): Plant | null {
  const r = one(db, 'SELECT * FROM plant WHERE id = 1');
  return r ? { name: r.name, shortName: r.short_name, operator: r.operator, timezone: r.timezone, reactorType: r.reactor_type } : null;
}

export function insertPlant(db: DB, p: Plant): void {
  run(db, 'INSERT INTO plant (id, name, short_name, operator, timezone, reactor_type) VALUES (1, ?, ?, ?, ?, ?)', p.name, p.shortName, p.operator, p.timezone, p.reactorType);
}

function toPerson(r: Row): Person {
  return { id: r.id, name: r.name, initials: r.initials, role: r.role, title: r.title, discipline: r.discipline ?? null };
}

export function listPeople(db: DB): Person[] {
  return all(db, 'SELECT * FROM people ORDER BY rowid').map(toPerson);
}

export function getPerson(db: DB, id: string): Person | null {
  const r = one(db, 'SELECT * FROM people WHERE id = ?', id);
  return r ? toPerson(r) : null;
}

export function insertPerson(db: DB, p: Person): void {
  run(db, 'INSERT INTO people (id, name, initials, role, title, discipline) VALUES (?, ?, ?, ?, ?, ?)', p.id, p.name, p.initials, p.role, p.title, p.discipline);
}

function toSystem(r: Row): PlantSystem {
  return { code: r.code, name: r.name, riskSignificant: Boolean(r.risk_significant), mrFunctionalFailureLimit: r.mr_ff_limit, mrUnavailabilityLimitHours: r.mr_unavail_limit_hours };
}

export function listSystems(db: DB): PlantSystem[] {
  return all(db, 'SELECT * FROM systems ORDER BY code').map(toSystem);
}

export function insertSystem(db: DB, s: PlantSystem): void {
  run(db, 'INSERT INTO systems (code, name, risk_significant, mr_ff_limit, mr_unavail_limit_hours) VALUES (?, ?, ?, ?, ?)', s.code, s.name, b(s.riskSignificant), s.mrFunctionalFailureLimit, s.mrUnavailabilityLimitHours);
}

function toTechSpec(r: Row): TechSpec {
  return { id: r.id, code: r.code, title: r.title, condition: r.condition, requiredAction: r.required_action, completionHours: r.completion_hours };
}

export function listTechSpecs(db: DB): TechSpec[] {
  return all(db, 'SELECT * FROM tech_specs ORDER BY code').map(toTechSpec);
}

export function getTechSpec(db: DB, id: string): TechSpec | null {
  const r = one(db, 'SELECT * FROM tech_specs WHERE id = ?', id);
  return r ? toTechSpec(r) : null;
}

export function insertTechSpec(db: DB, t: TechSpec): void {
  run(db, 'INSERT INTO tech_specs (id, code, title, condition, required_action, completion_hours) VALUES (?, ?, ?, ?, ?, ?)', t.id, t.code, t.title, t.condition, t.requiredAction, t.completionHours);
}

// ── Equipment ──────────────────────────────────────────────────────────────

function toEquipment(r: Row): Equipment {
  return {
    id: r.id,
    tag: r.tag,
    name: r.name,
    systemCode: r.system_code,
    equipmentType: r.equipment_type,
    discipline: r.discipline,
    safetyClass: r.safety_class,
    criticality: r.criticality,
    train: r.train ?? null,
    location: r.location,
    manufacturer: r.manufacturer,
    model: r.model,
    techSpecId: r.tech_spec_id ?? null,
    status: r.status,
    statusNote: r.status_note ?? null,
    runHours: r.run_hours ?? null,
  };
}

export function listEquipment(db: DB): Equipment[] {
  return all(db, 'SELECT * FROM equipment ORDER BY system_code, tag').map(toEquipment);
}

export function getEquipment(db: DB, id: string): Equipment | null {
  const r = one(db, 'SELECT * FROM equipment WHERE id = ?', id);
  return r ? toEquipment(r) : null;
}

export function insertEquipment(db: DB, e: Equipment): void {
  run(
    db,
    `INSERT INTO equipment (id, tag, name, system_code, equipment_type, discipline, safety_class, criticality, train, location, manufacturer, model, tech_spec_id, status, status_note, run_hours)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    e.id, e.tag, e.name, e.systemCode, e.equipmentType, e.discipline, e.safetyClass, e.criticality, e.train, e.location, e.manufacturer, e.model, e.techSpecId, e.status, e.statusNote, e.runHours,
  );
}

export function setEquipmentStatus(db: DB, id: string, status: EquipmentStatus, note: string | null): void {
  updateColumns(db, 'equipment', id, { status, status_note: note });
}

export function setRunHours(db: DB, id: string, hours: number): void {
  updateColumns(db, 'equipment', id, { run_hours: hours });
}

export function insertMeterReading(db: DB, r: { equipmentId: string; value: number; readAt: string; readBy: string }): void {
  run(db, 'INSERT INTO meter_readings (id, equipment_id, value, read_at, read_by) VALUES (?, ?, ?, ?, ?)', newId('mr'), r.equipmentId, r.value, r.readAt, r.readBy);
}

export function listMeterReadings(db: DB, equipmentId: string, limit = 12): { value: number; readAt: string; readBy: string }[] {
  return all(db, 'SELECT * FROM meter_readings WHERE equipment_id = ? ORDER BY read_at DESC LIMIT ?', equipmentId, limit).map((r) => ({ value: r.value, readAt: r.read_at, readBy: r.read_by }));
}

// ── PM plans ───────────────────────────────────────────────────────────────

function toPmPlan(r: Row): PmPlan {
  return {
    id: r.id,
    equipmentId: r.equipment_id,
    title: r.title,
    type: r.type,
    srRef: r.sr_ref ?? null,
    intervalDays: r.interval_days ?? null,
    intervalHours: r.interval_hours ?? null,
    gracePct: r.grace_pct,
    leadDays: r.lead_days,
    lastDoneDate: r.last_done_date ?? null,
    lastDoneHours: r.last_done_hours ?? null,
    estHours: r.est_hours,
    discipline: r.discipline,
    requiresOos: Boolean(r.requires_oos),
    steps: JSON.parse(r.steps_json),
    active: Boolean(r.active),
  };
}

export function listPmPlans(db: DB): PmPlan[] {
  return all(db, 'SELECT * FROM pm_plans ORDER BY rowid').map(toPmPlan);
}

export function getPmPlan(db: DB, id: string): PmPlan | null {
  const r = one(db, 'SELECT * FROM pm_plans WHERE id = ?', id);
  return r ? toPmPlan(r) : null;
}

export function insertPmPlan(db: DB, p: PmPlan): void {
  run(
    db,
    `INSERT INTO pm_plans (id, equipment_id, title, type, sr_ref, interval_days, interval_hours, grace_pct, lead_days, last_done_date, last_done_hours, est_hours, discipline, requires_oos, steps_json, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    p.id, p.equipmentId, p.title, p.type, p.srRef, p.intervalDays, p.intervalHours, p.gracePct, p.leadDays, p.lastDoneDate, p.lastDoneHours, p.estHours, p.discipline, b(p.requiresOos), JSON.stringify(p.steps), b(p.active),
  );
}

export function markPmPlanDone(db: DB, id: string, date: string, hours: number | null): void {
  updateColumns(db, 'pm_plans', id, { last_done_date: date, last_done_hours: hours });
}

// ── Work orders ────────────────────────────────────────────────────────────

function toWorkOrder(r: Row): WorkOrder {
  return {
    id: r.id,
    number: r.number,
    title: r.title,
    description: r.description,
    equipmentId: r.equipment_id,
    type: r.type,
    priority: r.priority,
    status: r.status,
    discipline: r.discipline,
    pmPlanId: r.pm_plan_id ?? null,
    dueDate: r.due_date ?? null,
    lateDate: r.late_date ?? null,
    scheduledDate: r.scheduled_date ?? null,
    requiresOos: Boolean(r.requires_oos),
    clearancePoints: JSON.parse(r.clearance_json) as ClearancePoint[],
    clearanceStatus: r.clearance_status,
    estHours: r.est_hours,
    estDoseMrem: r.est_dose_mrem,
    radArea: Boolean(r.rad_area),
    fme: Boolean(r.fme),
    confinedSpace: Boolean(r.confined_space),
    functionalFailure: r.functional_failure === null ? null : Boolean(r.functional_failure),
    mrNote: r.mr_note ?? null,
    parentWoId: r.parent_wo_id ?? null,
    sourceStepId: r.source_step_id ?? null,
    origin: r.origin,
    requestedBy: r.requested_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    releasedAt: r.released_at ?? null,
    releasedBy: r.released_by ?? null,
    workCompleteAt: r.work_complete_at ?? null,
    closedAt: r.closed_at ?? null,
    closedBy: r.closed_by ?? null,
    cancelReason: r.cancel_reason ?? null,
  };
}

const WO_COLUMNS: Record<keyof WorkOrder, string> = {
  id: 'id',
  number: 'number',
  title: 'title',
  description: 'description',
  equipmentId: 'equipment_id',
  type: 'type',
  priority: 'priority',
  status: 'status',
  discipline: 'discipline',
  pmPlanId: 'pm_plan_id',
  dueDate: 'due_date',
  lateDate: 'late_date',
  scheduledDate: 'scheduled_date',
  requiresOos: 'requires_oos',
  clearancePoints: 'clearance_json',
  clearanceStatus: 'clearance_status',
  estHours: 'est_hours',
  estDoseMrem: 'est_dose_mrem',
  radArea: 'rad_area',
  fme: 'fme',
  confinedSpace: 'confined_space',
  functionalFailure: 'functional_failure',
  mrNote: 'mr_note',
  parentWoId: 'parent_wo_id',
  sourceStepId: 'source_step_id',
  origin: 'origin',
  requestedBy: 'requested_by',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  releasedAt: 'released_at',
  releasedBy: 'released_by',
  workCompleteAt: 'work_complete_at',
  closedAt: 'closed_at',
  closedBy: 'closed_by',
  cancelReason: 'cancel_reason',
};

function woValue(key: keyof WorkOrder, value: unknown): SqlValue {
  if (key === 'clearancePoints') return JSON.stringify(value);
  if (key === 'functionalFailure') return nb(value as boolean | null);
  if (typeof value === 'boolean') return b(value);
  return (value ?? null) as SqlValue;
}

export function insertWorkOrder(db: DB, wo: WorkOrder): void {
  const keys = Object.keys(WO_COLUMNS) as (keyof WorkOrder)[];
  run(db, `INSERT INTO work_orders (${keys.map((k) => WO_COLUMNS[k]).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`, ...keys.map((k) => woValue(k, wo[k])));
}

export function updateWorkOrder(db: DB, id: string, patch: Partial<WorkOrder>): void {
  const columns: Record<string, SqlValue> = {};
  for (const [k, v] of Object.entries(patch) as [keyof WorkOrder, unknown][]) {
    if (k === 'id') continue;
    columns[WO_COLUMNS[k]] = woValue(k, v);
  }
  updateColumns(db, 'work_orders', id, columns);
}

export function getWorkOrder(db: DB, id: string): WorkOrder | null {
  const r = one(db, 'SELECT * FROM work_orders WHERE id = ?', id);
  return r ? toWorkOrder(r) : null;
}

export function getWorkOrderByNumber(db: DB, number: string): WorkOrder | null {
  const r = one(db, 'SELECT * FROM work_orders WHERE number = ?', number);
  return r ? toWorkOrder(r) : null;
}

export interface WorkOrderFilter {
  statuses?: string[];
  equipmentId?: string;
  pmPlanId?: string;
  parentWoId?: string;
  closedSince?: string;
  createdSince?: string;
}

export function listWorkOrders(db: DB, f: WorkOrderFilter = {}): WorkOrder[] {
  const where: string[] = [];
  const params: SqlValue[] = [];
  if (f.statuses?.length) {
    where.push(`status IN (${f.statuses.map(() => '?').join(', ')})`);
    params.push(...f.statuses);
  }
  if (f.equipmentId) where.push('equipment_id = ?'), params.push(f.equipmentId);
  if (f.pmPlanId) where.push('pm_plan_id = ?'), params.push(f.pmPlanId);
  if (f.parentWoId) where.push('parent_wo_id = ?'), params.push(f.parentWoId);
  if (f.closedSince) where.push('closed_at >= ?'), params.push(f.closedSince);
  if (f.createdSince) where.push('created_at >= ?'), params.push(f.createdSince);
  return all(db, `SELECT * FROM work_orders ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC`, ...params).map(toWorkOrder);
}

/** Work order numbers look like 26-04512: two-digit year, then a plant-wide sequence. */
export function nextWorkOrderNumber(db: DB, year: number): string {
  const row = one(db, "SELECT value FROM counters WHERE name = 'wo'");
  const next = (row?.value ?? 4100) + 1;
  run(db, "INSERT INTO counters (name, value) VALUES ('wo', ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value", next);
  return `${String(year).slice(-2)}-${String(next).padStart(5, '0')}`;
}

// ── Steps ──────────────────────────────────────────────────────────────────

function toStep(r: Row): WorkStep {
  return {
    id: r.id,
    woId: r.wo_id,
    seq: r.seq,
    kind: r.kind,
    text: r.text,
    unit: r.unit ?? null,
    minValue: r.min_value ?? null,
    maxValue: r.max_value ?? null,
    value: r.value ?? null,
    result: r.result ?? null,
    completedBy: r.completed_by ?? null,
    completedAt: r.completed_at ?? null,
  };
}

export function listSteps(db: DB, woId: string): WorkStep[] {
  return all(db, 'SELECT * FROM wo_steps WHERE wo_id = ? ORDER BY seq', woId).map(toStep);
}

export function getStep(db: DB, id: string): WorkStep | null {
  const r = one(db, 'SELECT * FROM wo_steps WHERE id = ?', id);
  return r ? toStep(r) : null;
}

export function insertStep(db: DB, s: WorkStep): void {
  run(
    db,
    'INSERT INTO wo_steps (id, wo_id, seq, kind, text, unit, min_value, max_value, value, result, completed_by, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    s.id, s.woId, s.seq, s.kind, s.text, s.unit, s.minValue, s.maxValue, s.value, s.result, s.completedBy, s.completedAt,
  );
}

export function signStep(db: DB, id: string, s: { value: number | null; result: 'pass' | 'fail' | null; completedBy: string; completedAt: string }): void {
  updateColumns(db, 'wo_steps', id, { value: s.value, result: s.result, completed_by: s.completedBy, completed_at: s.completedAt });
}

export function deleteStep(db: DB, id: string): void {
  run(db, 'DELETE FROM wo_steps WHERE id = ?', id);
}

export function nextStepSeq(db: DB, woId: string): number {
  return ((one(db, 'SELECT MAX(seq) AS m FROM wo_steps WHERE wo_id = ?', woId)?.m as number | null) ?? 0) + 1;
}

/** Readings recorded on one equipment's past work, for condition trending. */
export function readingHistory(db: DB, equipmentId: string): { text: string; unit: string | null; minValue: number | null; maxValue: number | null; value: number; at: string; number: string }[] {
  return all(
    db,
    `SELECT s.text, s.unit, s.min_value, s.max_value, s.value, s.completed_at, w.number
       FROM wo_steps s JOIN work_orders w ON w.id = s.wo_id
      WHERE w.equipment_id = ? AND s.value IS NOT NULL AND s.completed_at IS NOT NULL
      ORDER BY s.completed_at`,
    equipmentId,
  ).map((r) => ({ text: r.text, unit: r.unit ?? null, minValue: r.min_value ?? null, maxValue: r.max_value ?? null, value: r.value, at: r.completed_at, number: r.number }));
}

// ── Parts ──────────────────────────────────────────────────────────────────

// Reserved = held for open work orders but not yet issued.
const PART_SELECT = `
  SELECT p.*, COALESCE((
    SELECT SUM(wp.qty_reserved - wp.qty_issued) FROM wo_parts wp JOIN work_orders w ON w.id = wp.wo_id
     WHERE wp.part_id = p.id AND w.status NOT IN ('closed', 'cancelled')
  ), 0) AS reserved
  FROM parts p`;

function toPart(r: Row): Part {
  return {
    id: r.id,
    stockCode: r.stock_code,
    description: r.description,
    mfrPart: r.mfr_part,
    quality: r.quality,
    bin: r.bin,
    onHand: r.on_hand,
    reserved: r.reserved ?? 0,
    reorderPoint: r.reorder_point,
    maxQty: r.max_qty,
    unitCostCents: r.unit_cost_cents,
    leadDays: r.lead_days,
    criticalSpare: Boolean(r.critical_spare),
  };
}

export function listParts(db: DB): Part[] {
  return all(db, `${PART_SELECT} ORDER BY p.stock_code`).map(toPart);
}

export function getPart(db: DB, id: string): Part | null {
  const r = one(db, `${PART_SELECT} WHERE p.id = ?`, id);
  return r ? toPart(r) : null;
}

export function insertPart(db: DB, p: Part): void {
  run(
    db,
    'INSERT INTO parts (id, stock_code, description, mfr_part, quality, bin, on_hand, reorder_point, max_qty, unit_cost_cents, lead_days, critical_spare) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    p.id, p.stockCode, p.description, p.mfrPart, p.quality, p.bin, p.onHand, p.reorderPoint, p.maxQty, p.unitCostCents, p.leadDays, b(p.criticalSpare),
  );
}

export function adjustOnHand(db: DB, id: string, delta: number): void {
  run(db, 'UPDATE parts SET on_hand = on_hand + ? WHERE id = ?', delta, id);
}

export function listWorkParts(db: DB, woId: string): WorkPart[] {
  return all(db, 'SELECT * FROM wo_parts WHERE wo_id = ? ORDER BY rowid', woId).map((r) => ({
    id: r.id,
    woId: r.wo_id,
    partId: r.part_id,
    qtyReserved: r.qty_reserved,
    qtyIssued: r.qty_issued,
    part: getPart(db, r.part_id)!,
  }));
}

export function getWorkPart(db: DB, id: string): { id: string; woId: string; partId: string; qtyReserved: number; qtyIssued: number } | null {
  const r = one(db, 'SELECT * FROM wo_parts WHERE id = ?', id);
  return r ? { id: r.id, woId: r.wo_id, partId: r.part_id, qtyReserved: r.qty_reserved, qtyIssued: r.qty_issued } : null;
}

export function insertWorkPart(db: DB, p: { id: string; woId: string; partId: string; qtyReserved: number; qtyIssued: number }): void {
  run(db, 'INSERT INTO wo_parts (id, wo_id, part_id, qty_reserved, qty_issued) VALUES (?, ?, ?, ?, ?)', p.id, p.woId, p.partId, p.qtyReserved, p.qtyIssued);
}

export function updateWorkPart(db: DB, id: string, qtyReserved: number, qtyIssued: number): void {
  updateColumns(db, 'wo_parts', id, { qty_reserved: qtyReserved, qty_issued: qtyIssued });
}

export function deleteWorkPart(db: DB, id: string): void {
  run(db, 'DELETE FROM wo_parts WHERE id = ?', id);
}

// ── Labor ──────────────────────────────────────────────────────────────────

export function listLabor(db: DB, woId: string): LaborEntry[] {
  return all(db, 'SELECT * FROM wo_labor WHERE wo_id = ? ORDER BY worked_on, rowid', woId).map((r) => ({ id: r.id, woId: r.wo_id, personId: r.person_id, hours: r.hours, workedOn: r.worked_on, note: r.note }));
}

export function insertLabor(db: DB, l: LaborEntry): void {
  run(db, 'INSERT INTO wo_labor (id, wo_id, person_id, hours, worked_on, note) VALUES (?, ?, ?, ?, ?, ?)', l.id, l.woId, l.personId, l.hours, l.workedOn, l.note);
}

export function laborHoursByWo(db: DB): Map<string, number> {
  return new Map(all(db, 'SELECT wo_id, SUM(hours) AS h FROM wo_labor GROUP BY wo_id').map((r) => [r.wo_id as string, r.h as number]));
}

// ── Out-of-service events / LCOs ───────────────────────────────────────────

function toOos(r: Row): OosEvent {
  return {
    id: r.id,
    equipmentId: r.equipment_id,
    woId: r.wo_id ?? null,
    reason: r.reason,
    startedAt: r.started_at,
    endedAt: r.ended_at ?? null,
    techSpecId: r.tech_spec_id ?? null,
    lcoDueAt: r.lco_due_at ?? null,
    enteredBy: r.entered_by,
    exitedBy: r.exited_by ?? null,
  };
}

export function insertOos(db: DB, e: OosEvent): void {
  run(
    db,
    'INSERT INTO oos_events (id, equipment_id, wo_id, reason, started_at, ended_at, tech_spec_id, lco_due_at, entered_by, exited_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    e.id, e.equipmentId, e.woId, e.reason, e.startedAt, e.endedAt, e.techSpecId, e.lcoDueAt, e.enteredBy, e.exitedBy,
  );
}

export function openOosEvents(db: DB): OosEvent[] {
  return all(db, 'SELECT * FROM oos_events WHERE ended_at IS NULL ORDER BY started_at').map(toOos);
}

export function openOosForEquipment(db: DB, equipmentId: string): OosEvent[] {
  return all(db, 'SELECT * FROM oos_events WHERE equipment_id = ? AND ended_at IS NULL ORDER BY started_at', equipmentId).map(toOos);
}

export function listOosForEquipment(db: DB, equipmentId: string): OosEvent[] {
  return all(db, 'SELECT * FROM oos_events WHERE equipment_id = ? ORDER BY started_at DESC', equipmentId).map(toOos);
}

/** Events that overlap [since, now]. */
export function listOosSince(db: DB, since: string): OosEvent[] {
  return all(db, 'SELECT * FROM oos_events WHERE ended_at IS NULL OR ended_at >= ? ORDER BY started_at DESC', since).map(toOos);
}

export function linkOosToWorkOrder(db: DB, id: string, woId: string): void {
  updateColumns(db, 'oos_events', id, { wo_id: woId });
}

export function endOos(db: DB, id: string, endedAt: string, exitedBy: string): void {
  updateColumns(db, 'oos_events', id, { ended_at: endedAt, exited_by: exitedBy });
}

// ── Audit ──────────────────────────────────────────────────────────────────

export function insertAudit(db: DB, e: Omit<AuditEntry, 'id'>): void {
  run(db, 'INSERT INTO audit (id, at, actor_id, actor_name, action, entity_type, entity_id, summary) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', newId('au'), e.at, e.actorId, e.actorName, e.action, e.entityType, e.entityId, e.summary);
}

function toAudit(r: Row): AuditEntry {
  return { id: r.id, at: r.at, actorId: r.actor_id ?? null, actorName: r.actor_name, action: r.action, entityType: r.entity_type, entityId: r.entity_id ?? null, summary: r.summary };
}

export function listAudit(db: DB, f: { entityType?: string; entityId?: string; limit?: number; offset?: number } = {}): { rows: AuditEntry[]; total: number } {
  const where: string[] = [];
  const params: SqlValue[] = [];
  if (f.entityType) where.push('entity_type = ?'), params.push(f.entityType);
  if (f.entityId) where.push('entity_id = ?'), params.push(f.entityId);
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (one(db, `SELECT COUNT(*) AS n FROM audit ${clause}`, ...params)?.n as number) ?? 0;
  const rows = all(db, `SELECT * FROM audit ${clause} ORDER BY at DESC, rowid DESC LIMIT ? OFFSET ?`, ...params, f.limit ?? 50, f.offset ?? 0).map(toAudit);
  return { rows, total };
}
