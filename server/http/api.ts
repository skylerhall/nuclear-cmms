// Dashboard API. The acting person comes from res.locals.actor (see app.ts);
// every rule about who may do what lives in server/engine.
import { Router, type NextFunction, type Request, type Response } from 'express';
import * as repo from '../db/repo.ts';
import { resetDemo } from '../db/seed.ts';
import { audit } from '../engine/audit.ts';
import { type AppContext, RuleError, nowIso, plantToday, requireRole } from '../engine/context.ts';
import { activeLcos, protectedTrainConflicts, ts303Alerts } from '../engine/operability.ts';
import { overview } from '../engine/overview.ts';
import { generatePmWork, planRows } from '../engine/pm.ts';
import { WINDOW_DAYS, systemReliability } from '../engine/reliability.ts';
import * as wf from '../engine/workflow.ts';
import { transaction } from '../db/database.ts';
import { hoursBetween } from '../../shared/dates.ts';
import { OPEN_STATUSES, belowReorder, pmDue } from '../../shared/rules.ts';
import type { ClearancePoint, Discipline, Person, Priority, StepKind, WorkAction, WorkOrder, WorkType } from '../../shared/types.ts';

function actorOf(res: Response): Person {
  return res.locals.actor as Person;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function optNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) throw new RuleError('Enter a number.');
  return n;
}

const PRIORITIES = [1, 2, 3, 4];
const TYPES: WorkType[] = ['CM', 'PM', 'PDM', 'ST'];
const DISCIPLINES: Discipline[] = ['mechanical', 'electrical', 'ic'];

export function apiRouter(ctx: AppContext): Router {
  const { db } = ctx;
  const r = Router();

  r.get('/bootstrap', (_req, res) => {
    res.json({
      plant: repo.getPlant(db),
      people: repo.listPeople(db),
      systems: repo.listSystems(db),
      techSpecs: repo.listTechSpecs(db),
      today: plantToday(ctx),
      now: nowIso(ctx),
      authRequired: Boolean(ctx.config.demoPassword),
    });
  });

  r.get('/overview', (_req, res) => {
    res.json(overview(ctx));
  });

  // ── Work orders ─────────────────────────────────────────────────────────

  r.get('/work-orders', (req, res) => {
    const q = req.query;
    const status = str(q.status) || 'open';
    const statuses = status === 'open' ? OPEN_STATUSES : status === 'all' ? undefined : [status];
    const equipment = new Map(repo.listEquipment(db).map((e) => [e.id, e]));
    const search = str(q.q).toLowerCase();
    let rows = repo.listWorkOrders(db, { statuses, equipmentId: str(q.equipmentId) || undefined });
    if (str(q.type)) rows = rows.filter((w) => w.type === q.type);
    if (str(q.discipline)) rows = rows.filter((w) => w.discipline === q.discipline);
    if (str(q.priority)) rows = rows.filter((w) => String(w.priority) === q.priority);
    if (str(q.system)) rows = rows.filter((w) => equipment.get(w.equipmentId)?.systemCode === q.system);
    if (search) {
      rows = rows.filter((w) => {
        const e = equipment.get(w.equipmentId)!;
        return [w.number, w.title, e.tag, e.name].some((v) => v.toLowerCase().includes(search));
      });
    }
    const total = rows.length;
    const limit = Math.min(Number(q.limit) || 200, 500);
    rows.sort((a, b) => (statuses === OPEN_STATUSES ? a.priority - b.priority : 0) || b.createdAt.localeCompare(a.createdAt));
    res.json({
      total,
      rows: rows.slice(0, limit).map((w) => {
        const e = equipment.get(w.equipmentId)!;
        return { ...w, tag: e.tag, equipmentName: e.name, safetyClass: e.safetyClass, systemCode: e.systemCode, equipmentStatus: e.status };
      }),
    });
  });

  r.post('/work-orders', (req, res) => {
    const b = req.body ?? {};
    const priority = Number(b.priority ?? 3);
    if (!PRIORITIES.includes(priority)) throw new RuleError('Pick a priority from 1 to 4.');
    const type = (str(b.type) || 'CM') as WorkType;
    if (!TYPES.includes(type)) throw new RuleError('Unknown work type.');
    const wo = wf.requestWork(ctx, actorOf(res), { equipmentId: str(b.equipmentId), title: str(b.title), description: str(b.description), priority: priority as Priority, type });
    res.status(201).json(wo);
  });

  const detail = (wo: WorkOrder, actor: Person) => {
    const equipment = repo.getEquipment(db, wo.equipmentId)!;
    const people = new Map(repo.listPeople(db).map((p) => [p.id, p]));
    const plan = wo.pmPlanId ? repo.getPmPlan(db, wo.pmPlanId) : null;
    const parent = wo.parentWoId ? repo.getWorkOrder(db, wo.parentWoId) : null;
    return {
      workOrder: wo,
      equipment,
      system: repo.listSystems(db).find((s) => s.code === equipment.systemCode)!,
      techSpec: equipment.techSpecId ? repo.getTechSpec(db, equipment.techSpecId) : null,
      steps: repo.listSteps(db, wo.id),
      parts: repo.listWorkParts(db, wo.id),
      labor: repo.listLabor(db, wo.id).map((l) => ({ ...l, personName: people.get(l.personId)?.name ?? l.personId })),
      history: repo.listAudit(db, { entityType: 'work_order', entityId: wo.id, limit: 100 }).rows,
      actions: wf.actionOptions(ctx, wo, actor),
      plan: plan ? { ...plan, due: pmDue(plan, plantToday(ctx), equipment.runHours) } : null,
      parent: parent ? { id: parent.id, number: parent.number, title: parent.title, status: parent.status } : null,
      children: repo.listWorkOrders(db, { parentWoId: wo.id }).map((c) => ({ id: c.id, number: c.number, title: c.title, status: c.status })),
      // Every open out-of-service event on the equipment, including ones another work order holds.
      equipmentOos: repo.openOosForEquipment(db, equipment.id).map((e) => {
        const holder = e.woId && e.woId !== wo.id ? repo.getWorkOrder(db, e.woId) : null;
        return { ...e, heldByThis: e.woId === wo.id, holder: holder ? { id: holder.id, number: holder.number } : null };
      }),
    };
  };

  const loadWo = (id: string): WorkOrder => {
    const wo = repo.getWorkOrder(db, id) ?? repo.getWorkOrderByNumber(db, id);
    if (!wo) throw new RuleError('Work order not found', 404);
    return wo;
  };

  r.get('/work-orders/:id', (req, res) => {
    res.json(detail(loadWo(req.params.id), actorOf(res)));
  });

  const respond = (res: Response, woId: string, extra: Record<string, unknown> = {}) => res.json({ ...detail(loadWo(woId), actorOf(res)), ...extra });

  r.patch('/work-orders/:id', (req, res) => {
    const b = req.body ?? {};
    const patch: wf.PlanningPatch = {};
    if (b.title !== undefined) patch.title = str(b.title);
    if (b.description !== undefined) patch.description = str(b.description);
    if (b.priority !== undefined) {
      if (!PRIORITIES.includes(Number(b.priority))) throw new RuleError('Pick a priority from 1 to 4.');
      patch.priority = Number(b.priority) as Priority;
    }
    if (b.discipline !== undefined) {
      if (!DISCIPLINES.includes(b.discipline)) throw new RuleError('Unknown discipline.');
      patch.discipline = b.discipline;
    }
    for (const k of ['requiresOos', 'radArea', 'fme', 'confinedSpace'] as const) if (b[k] !== undefined) patch[k] = Boolean(b[k]);
    if (b.estHours !== undefined) patch.estHours = optNum(b.estHours) ?? 0;
    if (b.estDoseMrem !== undefined) patch.estDoseMrem = optNum(b.estDoseMrem) ?? 0;
    if (b.scheduledDate !== undefined) patch.scheduledDate = str(b.scheduledDate) || null;
    if (b.clearancePoints !== undefined) {
      if (!Array.isArray(b.clearancePoints) || b.clearancePoints.length > 40) throw new RuleError('Clearance points must be a list.');
      patch.clearancePoints = b.clearancePoints as ClearancePoint[];
    }
    if (!Object.keys(patch).length) throw new RuleError('Nothing to change.');
    const wo = loadWo(req.params.id);
    wf.updatePlanning(ctx, actorOf(res), wo.id, patch);
    respond(res, wo.id);
  });

  r.post('/work-orders/:id/actions', (req, res) => {
    const wo = loadWo(req.params.id);
    const action = str(req.body?.action) as WorkAction;
    wf.performAction(ctx, actorOf(res), wo.id, action, { note: str(req.body?.note), reason: str(req.body?.reason) });
    respond(res, wo.id);
  });

  r.post('/work-orders/:id/steps', (req, res) => {
    const wo = loadWo(req.params.id);
    const b = req.body ?? {};
    wf.addStep(ctx, actorOf(res), wo.id, { kind: str(b.kind) as StepKind, text: str(b.text), unit: str(b.unit) || null, min: optNum(b.min), max: optNum(b.max) });
    respond(res, wo.id);
  });

  r.delete('/work-orders/:id/steps/:stepId', (req, res) => {
    const wo = loadWo(req.params.id);
    wf.removeStep(ctx, actorOf(res), wo.id, req.params.stepId);
    respond(res, wo.id);
  });

  r.post('/work-orders/:id/steps/:stepId/sign', (req, res) => {
    const wo = loadWo(req.params.id);
    const result = wf.signStep(ctx, actorOf(res), wo.id, req.params.stepId, optNum(req.body?.value));
    respond(res, wo.id, { signResult: { result: result.step.result, followUp: result.followUp ? { id: result.followUp.id, number: result.followUp.number } : null, enteredLco: result.enteredLco } });
  });

  r.post('/work-orders/:id/parts', (req, res) => {
    const wo = loadWo(req.params.id);
    wf.reservePart(ctx, actorOf(res), wo.id, str(req.body?.partId), Number(req.body?.qty));
    respond(res, wo.id);
  });

  r.delete('/work-orders/:id/parts/:lineId', (req, res) => {
    const wo = loadWo(req.params.id);
    wf.unreservePart(ctx, actorOf(res), wo.id, req.params.lineId);
    respond(res, wo.id);
  });

  r.post('/work-orders/:id/parts/:lineId/issue', (req, res) => {
    const wo = loadWo(req.params.id);
    wf.issuePart(ctx, actorOf(res), wo.id, req.params.lineId);
    respond(res, wo.id);
  });

  r.post('/work-orders/:id/labor', (req, res) => {
    const wo = loadWo(req.params.id);
    wf.logLabor(ctx, actorOf(res), wo.id, optNum(req.body?.hours) ?? 0, str(req.body?.note));
    respond(res, wo.id);
  });

  r.post('/work-orders/:id/mr', (req, res) => {
    const wo = loadWo(req.params.id);
    if (typeof req.body?.functionalFailure !== 'boolean') throw new RuleError('Choose functional failure or not.');
    wf.evaluateMaintenanceRule(ctx, actorOf(res), wo.id, req.body.functionalFailure, str(req.body?.note));
    respond(res, wo.id);
  });

  // ── Equipment ───────────────────────────────────────────────────────────

  r.get('/equipment', (_req, res) => {
    const open = repo.listWorkOrders(db, { statuses: OPEN_STATUSES });
    const lcos = activeLcos(ctx);
    const rows = planRows(ctx);
    res.json(
      repo.listEquipment(db).map((e) => {
        const next = rows.filter((p) => p.equipment.id === e.id).sort((a, b) => (a.due.dueDate ?? '9999').localeCompare(b.due.dueDate ?? '9999'))[0];
        const lco = lcos.find((l) => l.equipment.id === e.id);
        return {
          ...e,
          openWork: open.filter((w) => w.equipmentId === e.id).length,
          openCorrective: open.filter((w) => w.equipmentId === e.id && w.type === 'CM').length,
          lco: lco ? { code: lco.techSpec.code, hoursRemaining: lco.hoursRemaining } : null,
          nextDue: next ? { title: next.plan.title, due: next.due } : null,
        };
      }),
    );
  });

  r.get('/equipment/:id', (req, res) => {
    const e = repo.getEquipment(db, req.params.id) ?? repo.listEquipment(db).find((x) => x.tag === req.params.id);
    if (!e) throw new RuleError('Equipment not found', 404);
    const today = plantToday(ctx);
    const readings = repo.readingHistory(db, e.id);
    const trends = new Map<string, { text: string; unit: string | null; minValue: number | null; maxValue: number | null; points: { value: number; at: string; number: string }[] }>();
    for (const row of readings) {
      const t = trends.get(row.text) ?? { text: row.text, unit: row.unit, minValue: row.minValue, maxValue: row.maxValue, points: [] };
      t.points.push({ value: row.value, at: row.at, number: row.number });
      trends.set(row.text, t);
    }
    const oos = repo.listOosForEquipment(db, e.id);
    const now = nowIso(ctx);
    res.json({
      equipment: e,
      system: repo.listSystems(db).find((s) => s.code === e.systemCode)!,
      techSpec: e.techSpecId ? repo.getTechSpec(db, e.techSpecId) : null,
      sameSpec: e.techSpecId ? repo.listEquipment(db).filter((x) => x.techSpecId === e.techSpecId && x.id !== e.id) : [],
      protectedConflicts: protectedTrainConflicts(ctx, e),
      plans: repo
        .listPmPlans(db)
        .filter((p) => p.equipmentId === e.id && p.active)
        .map((p) => ({ ...p, due: pmDue(p, today, e.runHours) })),
      workOrders: repo.listWorkOrders(db, { equipmentId: e.id }).slice(0, 60),
      oos: oos.slice(0, 20).map((o) => ({ ...o, hours: Math.round(hoursBetween(o.startedAt, o.endedAt ?? now) * 10) / 10 })),
      meter: repo.listMeterReadings(db, e.id),
      trends: [...trends.values()].filter((t) => t.points.length >= 3),
    });
  });

  r.post('/equipment/:id/inoperable', (req, res) => {
    const wo = wf.declareInoperable(ctx, actorOf(res), req.params.id, str(req.body?.reason));
    res.status(201).json(wo);
  });

  r.post('/equipment/:id/meter', (req, res) => {
    wf.recordRunHours(ctx, actorOf(res), req.params.id, optNum(req.body?.hours) ?? NaN);
    res.json(repo.getEquipment(db, req.params.id));
  });

  // ── Schedule, LCOs, parts, reliability ──────────────────────────────────

  r.get('/schedule', (_req, res) => {
    res.json(planRows(ctx));
  });

  r.post('/schedule/generate', (_req, res) => {
    requireRole(actorOf(res), ['planner', 'supervisor'], 'run the PM generator');
    const created = generatePmWork(ctx);
    res.json({ created: created.map((w) => ({ id: w.id, number: w.number, title: w.title })) });
  });

  r.get('/lcos', (_req, res) => {
    const equipment = repo.listEquipment(db);
    const since = new Date(ctx.now().getTime() - 90 * 86_400_000).toISOString();
    const history = repo
      .listOosSince(db, since)
      .filter((e) => e.techSpecId && e.endedAt)
      .map((e) => {
        const eq = equipment.find((x) => x.id === e.equipmentId)!;
        const ts = repo.getTechSpec(db, e.techSpecId!)!;
        const wo = e.woId ? repo.getWorkOrder(db, e.woId) : null;
        const hours = hoursBetween(e.startedAt, e.endedAt!);
        return { ...e, tag: eq.tag, equipmentName: eq.name, code: ts.code, completionHours: ts.completionHours, hours: Math.round(hours * 10) / 10, woNumber: wo?.number ?? null };
      });
    const trains = repo.listTechSpecs(db).map((ts) => ({
      techSpec: ts,
      equipment: equipment.filter((e) => e.techSpecId === ts.id).map((e) => ({ id: e.id, tag: e.tag, name: e.name, train: e.train, status: e.status })),
    }));
    res.json({ active: activeLcos(ctx), ts303: ts303Alerts(ctx), history, trains });
  });

  r.get('/parts', (_req, res) => {
    const open = repo.listWorkOrders(db, { statuses: OPEN_STATUSES });
    const usage = new Map<string, { number: string; id: string; qty: number }[]>();
    for (const wo of open) {
      for (const line of repo.listWorkParts(db, wo.id)) {
        const outstanding = line.qtyReserved - line.qtyIssued;
        if (outstanding <= 0) continue;
        usage.set(line.partId, [...(usage.get(line.partId) ?? []), { number: wo.number, id: wo.id, qty: outstanding }]);
      }
    }
    res.json(repo.listParts(db).map((p) => ({ ...p, belowReorder: belowReorder(p), reservations: usage.get(p.id) ?? [] })));
  });

  r.post('/parts/:id/receive', (req, res) => {
    const actor = actorOf(res);
    requireRole(actor, ['planner', 'supervisor'], 'receive stock');
    const qty = Number(req.body?.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 500) throw new RuleError('Quantity must be a whole number from 1 to 500.');
    transaction(db, () => {
      const part = repo.getPart(db, req.params.id);
      if (!part) throw new RuleError('Part not found', 404);
      repo.adjustOnHand(db, part.id, qty);
      audit(ctx, actor, 'part.receive', 'part', part.id, `Received ${qty} × ${part.stockCode} ${part.description}${part.quality === 'Q' ? ' (Q-level receipt inspection complete)' : ''}`);
    });
    res.json(repo.getPart(db, req.params.id));
  });

  r.get('/reliability', (_req, res) => {
    res.json({ windowDays: WINDOW_DAYS, systems: systemReliability(ctx) });
  });

  r.get('/audit', (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    res.json(repo.listAudit(db, { limit, offset, entityType: str(req.query.entityType) || undefined }));
  });

  r.post('/demo/reset', (_req, res) => {
    resetDemo(ctx);
    res.json({ ok: true });
  });

  return r;
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof RuleError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
}

