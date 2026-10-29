// Loads the fictional plant with 24 months of history and a realistic set of open
// work. Everything is placed relative to "now", so the dashboard always looks
// current; randomness is seeded, so the shape is the same on every reset.
import { transaction, clearAll } from './database.ts';
import * as repo from './repo.ts';
import { addDays, dateIn, daysBetween } from '../../shared/dates.ts';
import { pmDue, readingResult } from '../../shared/rules.ts';
import type { ClearancePoint, Discipline, Equipment, Person, PmPlan, WorkOrder, WorkStatus, WorkStep } from '../../shared/types.ts';
import { audit } from '../engine/audit.ts';
import type { AppContext } from '../engine/context.ts';
import { enterOos } from '../engine/operability.ts';
import { generatePmWork } from '../engine/pm.ts';
import { defaultClearance, insertWork } from '../engine/workflow.ts';
import { EQUIPMENT, PARTS, PEOPLE, PLANS, PLANT, SYSTEMS, TECH_SPECS, type PlanSeed, type SeedStep } from './seed-data.ts';

const HOUR = 3_600_000;
const WINDOW_DAYS = 730;

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function isSeeded(ctx: AppContext): boolean {
  return repo.getPlant(ctx.db) !== null;
}

export function seedIfEmpty(ctx: AppContext): boolean {
  if (isSeeded(ctx)) return false;
  seedDemo(ctx);
  return true;
}

export function resetDemo(ctx: AppContext): void {
  clearAll(ctx.db);
  seedDemo(ctx);
}

const eqId = (key: string) => `eq_${key}`;
const partId = (key: string) => `pt_${key}`;
const planId = (key: string) => `pm_${key}`;

const TECH: Record<Discipline, string> = { mechanical: 'tom', electrical: 'elena', ic: 'kenji' };

export function seedDemo(ctx: AppContext): void {
  transaction(ctx.db, () => {
    const rand = mulberry32(20261029);
    const between = (a: number, b: number) => a + (b - a) * rand();
    const now = ctx.now();
    const nowMs = now.getTime();
    const today = dateIn(PLANT.timezone, now);
    const hoursAgo = (h: number) => new Date(nowMs - h * HOUR).toISOString();
    const dateAgo = (d: number) => addDays(today, -d);
    // A plant-local afternoon on a given date (about 1–2 PM in Chicago).
    const at = (date: string, hourUtc = 19, minute = 0) => `${date}T${String(hourUtc).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`;

    const people = new Map<string, Person>(PEOPLE.map((p) => [p.id, p]));
    const person = (id: string) => people.get(id)!;

    // ── Reference data ────────────────────────────────────────────────────
    repo.insertPlant(ctx.db, PLANT);
    PEOPLE.forEach((p) => repo.insertPerson(ctx.db, p));
    SYSTEMS.forEach((s) => repo.insertSystem(ctx.db, s));
    TECH_SPECS.forEach((t) => repo.insertTechSpec(ctx.db, t));
    for (const e of EQUIPMENT) {
      repo.insertEquipment(ctx.db, {
        id: eqId(e.key),
        tag: e.tag,
        name: e.name,
        systemCode: e.system,
        equipmentType: e.type,
        discipline: e.discipline,
        safetyClass: e.safety,
        criticality: e.crit,
        train: e.train ?? null,
        location: e.location,
        manufacturer: e.mfr,
        model: e.model,
        techSpecId: e.ts ?? null,
        status: 'operable',
        statusNote: null,
        runHours: e.hours ?? null,
      });
    }
    for (const p of PARTS) {
      repo.insertPart(ctx.db, { id: partId(p.key), stockCode: p.code, description: p.description, mfrPart: p.mfrPart, quality: p.quality, bin: p.bin, onHand: p.onHand, reserved: 0, reorderPoint: p.reorder, maxQty: p.max, unitCostCents: p.cost, leadDays: p.lead, criticalSpare: Boolean(p.critical) });
    }
    const equipment = (key: string) => repo.getEquipment(ctx.db, eqId(key))!;
    // Run hours accumulate at a steady rate per component (about ten years in service).
    const runRate = (e: Equipment) => Math.min(24, Math.max(0.2, (e.runHours ?? 0) / 3650));

    const plans = new Map<string, PmPlan>();
    for (const p of PLANS) {
      const e = equipment(p.equipment);
      const plan: PmPlan = {
        id: planId(p.key),
        equipmentId: e.id,
        title: p.title,
        type: p.type,
        srRef: p.sr ?? null,
        intervalDays: p.days ?? null,
        intervalHours: p.hours ?? null,
        gracePct: 25,
        leadDays: p.lead ?? 14,
        lastDoneDate: p.days ? dateAgo(p.lastAgo) : dateAgo(Math.round(p.lastAgo / runRate(e))),
        lastDoneHours: p.hours ? (e.runHours ?? 0) - p.lastAgo : null,
        estHours: p.estHours,
        discipline: e.discipline,
        requiresOos: Boolean(p.oos),
        steps: p.steps.map(({ typical: _t, spread: _s, ...step }) => ({ ...step, unit: step.unit || undefined })),
        active: true,
      };
      repo.insertPmPlan(ctx.db, plan);
      plans.set(p.key, plan);
    }

    // Meter history: weekly readings for the last 12 weeks.
    for (const e of repo.listEquipment(ctx.db)) {
      if (e.runHours === null) continue;
      const rate = runRate(e);
      for (let w = 12; w >= 1; w--) {
        repo.insertMeterReading(ctx.db, { equipmentId: e.id, value: Math.round(e.runHours - rate * 7 * w), readAt: at(dateAgo(w * 7), 14), readBy: 'Operations rounds' });
      }
    }

    // ── History ───────────────────────────────────────────────────────────
    // Built as a list first so work order numbers come out in date order.
    type HistStep = WorkStep;
    interface Hist {
      wo: WorkOrder;
      steps: HistStep[];
      laborBy: string;
      laborHours: number;
      oos: { start: string; end: string } | null;
      followUp?: { title: string; description: string };
    }
    const history: Hist[] = [];

    const decimals = (spread: number) => (spread >= 10 ? 0 : spread >= 1 ? 1 : spread >= 0.1 ? 2 : 3);
    const roundTo = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;
    const sample = (st: SeedStep): number | null => {
      if (st.typical === undefined) return null;
      const spread = st.spread ?? 0;
      let v = st.typical + spread * (rand() * 2 - 1) * 1.2;
      if (st.min !== undefined) v = Math.max(v, st.min + spread * 0.2);
      if (st.max !== undefined) v = Math.min(v, st.max - spread * 0.2);
      return roundTo(v, decimals(spread || Math.abs(st.typical) / 10));
    };

    // Bearing trends that the demo tells a story about. Values run oldest → newest.
    const trends: Record<string, Record<string, (t: number) => number>> = {
      'ccw-1b-vib': {
        'Motor outboard bearing vibration': (t) => 0.1 + 0.17 * t ** 2.4 + (t === 1 ? 0.07 : 0),
        'Pump inboard bearing vibration': (t) => 0.12 + 0.06 * t ** 2,
        'Pump inboard bearing temperature': (t) => 126 + 22 * t ** 2,
      },
      'rhr-1a-ist': { 'Pump outboard bearing vibration (overall velocity)': (t) => 0.1 + 0.13 * t ** 1.8 },
    };

    const makeSteps = (woId: string, seedSteps: SeedStep[], doneAt: string, discipline: Discipline, trend?: Record<string, (t: number) => number>, t = 0): HistStep[] =>
      seedSteps.map((st, i) => {
        const fn = trend?.[st.text];
        let value = fn ? roundTo(fn(t) + (rand() - 0.5) * 0.01 * (st.typical ?? 1), decimals(st.spread ?? 0.01)) : sample(st);
        if (value === null && (st.min !== undefined || st.max !== undefined)) value = st.min ?? st.max ?? null;
        const step: HistStep = {
          id: repo.newId('st'),
          woId,
          seq: i + 1,
          kind: st.kind,
          text: st.text,
          unit: st.unit || null,
          minValue: st.min ?? null,
          maxValue: st.max ?? null,
          value: st.min !== undefined || st.max !== undefined ? value : null,
          result: null,
          completedBy: st.kind === 'qc_hold' ? 'Rachel Okafor' : person(TECH[discipline]).name,
          completedAt: doneAt,
        };
        if (step.value !== null) step.result = readingResult(step, step.value);
        return step;
      });

    const baseWo = (o: Partial<WorkOrder> & Pick<WorkOrder, 'title' | 'equipmentId' | 'type' | 'createdAt'>): WorkOrder => {
      const e = repo.getEquipment(ctx.db, o.equipmentId)!;
      return {
        id: repo.newId('wo'),
        number: '',
        description: '',
        priority: 3,
        status: 'closed',
        discipline: e.discipline,
        pmPlanId: null,
        dueDate: null,
        lateDate: null,
        scheduledDate: null,
        requiresOos: false,
        clearancePoints: [],
        clearanceStatus: 'none',
        estHours: 4,
        estDoseMrem: 0,
        radArea: false,
        fme: false,
        confinedSpace: false,
        functionalFailure: null,
        mrNote: null,
        parentWoId: null,
        sourceStepId: null,
        origin: 'history',
        requestedBy: 'Work Control',
        updatedAt: o.createdAt,
        releasedAt: null,
        releasedBy: 'Sam Delgado',
        workCompleteAt: null,
        closedAt: null,
        closedBy: 'Marcus Oyelaran',
        cancelReason: null,
        ...o,
      };
    };

    for (const seed of PLANS) {
      const plan = plans.get(seed.key)!;
      const e = repo.getEquipment(ctx.db, plan.equipmentId)!;
      const dates = performanceDates(seed, plan, e);
      const trend = trends[seed.key];
      dates.forEach((date, i) => {
        const older = dates[i + 1];
        const interval = plan.intervalDays ?? Math.round((plan.intervalHours ?? 0) / runRate(e));
        const due = older ? addDays(older, interval) : date;
        const late = addDays(due, Math.floor((interval * plan.gracePct) / 100));
        const lead = plan.intervalDays ? plan.leadDays : 14;
        const created = [addDays(due, -lead), addDays(date, -1)].sort()[0];
        const closedAt = at(date, 21);
        const doneAt = at(date, 19);
        const hours = Math.round(plan.estHours * between(0.8, 1.3) * 2) / 2 || 0.5;
        const ts = e.techSpecId ? TECH_SPECS.find((t) => t.id === e.techSpecId)! : null;
        const oosHours = Math.min(plan.estHours * 1.1, ts ? ts.completionHours * 0.8 : Infinity);
        const wo = baseWo({
          title: plan.title,
          equipmentId: e.id,
          type: plan.type,
          priority: plan.type === 'ST' ? 2 : 3,
          pmPlanId: plan.id,
          dueDate: plan.intervalDays ? due : null,
          lateDate: plan.intervalDays ? late : null,
          createdAt: at(created, 14),
          releasedAt: at(date, 13),
          workCompleteAt: doneAt,
          closedAt,
          requiresOos: plan.requiresOos,
          clearancePoints: plan.requiresOos ? defaultClearance(e) : [],
          clearanceStatus: plan.requiresOos ? 'released' : 'none',
          estHours: plan.estHours,
          origin: 'pm_generator',
          requestedBy: 'PM generator',
        });
        const t = dates.length > 1 ? (dates.length - 1 - i) / (dates.length - 1) : 1;
        const steps = makeSteps(wo.id, seed.steps, doneAt, plan.discipline, trend, t);
        // The newest CCW 1B route found the outboard bearing over its limit (see the open CM below).
        const failed = steps.find((s) => s.result === 'fail');
        history.push({
          wo,
          steps,
          laborBy: TECH[plan.discipline],
          laborHours: hours,
          oos: plan.requiresOos ? { start: new Date(Date.parse(closedAt) - oosHours * HOUR).toISOString(), end: closedAt } : null,
          followUp: failed ? { title: `Out of tolerance: ${failed.text}`, description: `Recorded ${failed.value} ${failed.unit ?? ''} on the vibration route; limit ${failed.maxValue} ${failed.unit ?? ''}. Spectrum shows outer-race defect frequency with harmonics. Plan bearing replacement.` } : undefined,
        });
      });
    }

    function performanceDates(seed: PlanSeed, plan: PmPlan, e: Equipment): string[] {
      const out: string[] = [];
      const cap = seed.historyCap ?? Infinity;
      if (plan.intervalDays) {
        let d = plan.lastDoneDate!;
        while (daysBetween(d, today) <= WINDOW_DAYS && out.length < cap) {
          out.push(d);
          // Surveillances are always done inside the SR 3.0.2 grace; a few PMs run late.
          const late = plan.type !== 'ST' && rand() < 0.08;
          const factor = late ? 1.32 : plan.type === 'ST' ? between(0.9, 1.04) : between(0.88, 1.08);
          d = addDays(d, -Math.max(1, Math.round(plan.intervalDays * factor)));
        }
      } else {
        const rate = runRate(e);
        let back = seed.lastAgo / rate;
        while (back <= WINDOW_DAYS && out.length < cap) {
          out.push(dateAgo(Math.round(back)));
          back += (plan.intervalHours ?? 0) / rate;
        }
      }
      return out;
    }

    // Corrective history. Functional failures are placed deliberately: Service Water
    // ends up over its Maintenance Rule criteria and CCW right at its limit.
    const failures: { eq: string; ago: number; title: string; oos: number; ff: boolean }[] = [
      { eq: 'sw-p-1a', ago: 610, title: 'Pump failed to develop required head during IST: wear ring clearance excessive', oos: 54, ff: true },
      { eq: 'sw-str-1a', ago: 380, title: 'Strainer backwash motor failed; high ΔP alarm, SW Train A declared inoperable', oos: 20, ff: true },
      { eq: 'sw-p-1b', ago: 145, title: 'Pump motor tripped on overcurrent during start: motor bearing seized', oos: 66, ff: true },
      { eq: 'ccw-p-1a', ago: 500, title: 'Mechanical seal failure, leak-off 2 gpm; pump secured', oos: 40, ff: true },
      { eq: 'ccw-p-1b', ago: 210, title: 'Pump failed to start on auto-start signal: breaker closing coil open', oos: 18, ff: true },
      { eq: 'edg-1b', ago: 300, title: 'EDG 1B failed to reach rated voltage in 10 s: voltage regulator card failure', oos: 30, ff: true },
      { eq: 'pt-457', ago: 260, title: 'Ch III output drifted outside as-found tolerance during COT', oos: 10, ff: true },
      { eq: 'crefs-41a', ago: 160, title: 'Fan failed to start on demand: motor starter overload relay tripped', oos: 12, ff: true },
      { eq: 'uat', ago: 400, title: 'Cooling fan bank failure caused high winding temperature alarm', oos: 0, ff: true },
      // Recent LCO entries that were exited in time.
      { eq: 'rhr-mov-8701a', ago: 40, title: 'Stem lubrication degraded; relube stem threads and check thrust', oos: 9, ff: false },
      { eq: 'bat-1b', ago: 25, title: 'Replace cracked jar, cell 22 (jumpered out)', oos: 1.5, ff: false },
      { eq: 'afw-p-2a', ago: 70, title: 'Replace outboard bearing oil seal; oil weeping at housing', oos: 20, ff: false },
      { eq: 'swgr-1b01', ago: 55, title: 'Bus 1B01 cubicle heater and IR window gasket replacement', oos: 5, ff: false },
    ];
    const MINOR: Record<string, string[]> = {
      Pump: ['Packing leak-off above 60 drops/min; adjust packing gland', 'Oil weeping at inboard bearing housing', 'Discharge pressure gauge reading erratic', 'Coupling guard fastener missing', 'Seal water flow indicator stuck'],
      'Motor-operated valve': ['Stem lubrication degraded; relube stem threads', 'Limit switch indication intermittent', 'Handwheel declutch lever stiff'],
      'Diesel generator': ['Jacket water leak at cylinder 4 head gasket', 'Air start motor slow to engage', 'Governor hunting at no load', 'Lube oil keep-warm heater thermostat failed'],
      Battery: ['Corrosion on terminal post, cell 12', 'Cell 37 low specific gravity; equalize charge'],
      'Battery charger': ['Charger output ammeter reading high', 'Cabinet cooling fan noisy'],
      Breaker: ['Spring charge motor runs continuously', 'Position indication lamp burnt out'],
      Switchgear: ['Cubicle heater inoperative', 'IR window gasket degraded'],
      Transmitter: ['Transmitter output noisy; check sensing line for air', 'Root valve packing weep'],
      Fan: ['Belt squeal on start', 'Damper actuator sluggish', 'High motor vibration after belt change'],
      Chiller: ['Low refrigerant charge; leak check', 'Oil heater not maintaining temperature'],
      Compressor: ['Unloader valve sticking', 'Moisture separator drain trap failed open'],
      'Air dryer': ['Purge valve stuck open', 'Tower switching valve leaks by'],
      Transformer: ['Oil level gauge sight glass cracked', 'Radiator cooling fan 3 failed'],
      Generator: ['Collector brush sparking on ring 2', 'Hydrogen dryer regeneration heater failed'],
      'Heat exchanger': ['Channel head gasket weep', 'Tube-side ΔP trending high'],
      Strainer: ['Backwash timer drifted', 'Drain line lagging damaged'],
    };
    const allEq = repo.listEquipment(ctx.db);
    for (let i = 0; i < 46; i++) {
      const e = allEq[Math.floor(rand() * allEq.length)];
      const titles = MINOR[e.equipmentType] ?? ['General deficiency: repair per work instructions'];
      failures.push({ eq: e.id.slice(3), ago: Math.round(between(20, 720)), title: titles[Math.floor(rand() * titles.length)], oos: rand() < 0.35 ? Math.round(between(2, 14)) : 0, ff: false });
    }
    for (const f of failures) {
      const e = equipment(f.eq);
      const createdDate = dateAgo(f.ago);
      const durationDays = f.ff ? Math.max(1, Math.ceil(f.oos / 24)) : Math.round(between(2, 35));
      const closedDate = addDays(createdDate, Math.min(durationDays, f.ago - 1));
      const closedAt = at(closedDate, 22);
      const steps: SeedStep[] = [
        { kind: 'step', text: 'Troubleshoot and identify cause' },
        { kind: 'step', text: 'Repair or replace failed component per vendor manual' },
        ...(e.safetyClass === 'SR' ? [{ kind: 'qc_hold' as const, text: 'QC verify repair and FME closeout' }] : []),
        { kind: 'pmt', text: 'Post-maintenance test: run/operate component and verify normal parameters' },
      ];
      const wo = baseWo({
        title: f.title,
        equipmentId: e.id,
        type: 'CM',
        priority: f.ff ? (e.safetyClass === 'SR' ? 1 : 2) : 3,
        createdAt: at(createdDate, 15, 30),
        releasedAt: at(createdDate, 17),
        workCompleteAt: at(closedDate, 20),
        closedAt,
        requiresOos: f.oos > 0,
        clearancePoints: f.oos > 0 ? defaultClearance(e) : [],
        clearanceStatus: f.oos > 0 ? 'released' : 'none',
        estHours: Math.round(between(4, 24)),
        functionalFailure: e.safetyClass === 'NSR' && !f.ff ? null : f.ff,
        mrNote:
          e.safetyClass === 'NSR' && !f.ff
            ? null
            : f.ff
              ? `Component did not perform its Maintenance Rule function. Counted against ${e.systemCode} performance criteria.`
              : 'Degraded condition did not prevent the component from performing its function. Not a functional failure.',
        origin: f.ff ? 'emergent' : 'request',
        requestedBy: f.ff ? 'Sam Delgado' : 'Operations rounds',
        closedBy: f.oos > 0 ? 'Sam Delgado' : 'Marcus Oyelaran',
      });
      history.push({
        wo,
        steps: makeSteps(wo.id, steps, at(closedDate, 20), e.discipline),
        laborBy: TECH[e.discipline],
        laborHours: Math.round(wo.estHours * between(0.7, 1.4) * 2) / 2,
        oos: f.oos > 0 ? { start: at(createdDate, 16), end: new Date(Date.parse(at(createdDate, 16)) + f.oos * HOUR).toISOString() } : null,
      });
    }

    history.sort((a, b) => a.wo.createdAt.localeCompare(b.wo.createdAt));
    for (const h of history) {
      const year = new Date(h.wo.createdAt).getUTCFullYear();
      h.wo.number = repo.nextWorkOrderNumber(ctx.db, year);
      h.wo.updatedAt = h.wo.closedAt!;
      repo.insertWorkOrder(ctx.db, h.wo);
      h.steps.forEach((s) => repo.insertStep(ctx.db, s));
      repo.insertLabor(ctx.db, { id: repo.newId('lb'), woId: h.wo.id, personId: h.laborBy, hours: h.laborHours, workedOn: h.wo.closedAt!.slice(0, 10), note: '' });
      if (h.oos) {
        const e = repo.getEquipment(ctx.db, h.wo.equipmentId)!;
        const ts = e.techSpecId ? TECH_SPECS.find((t) => t.id === e.techSpecId)! : null;
        repo.insertOos(ctx.db, {
          id: repo.newId('oos'),
          equipmentId: e.id,
          woId: h.wo.id,
          reason: `${h.wo.number}: ${h.wo.title}`,
          startedAt: h.oos.start,
          endedAt: h.oos.end,
          techSpecId: ts?.id ?? null,
          lcoDueAt: ts ? new Date(Date.parse(h.oos.start) + ts.completionHours * HOUR).toISOString() : null,
          enteredBy: 'Sam Delgado',
          exitedBy: 'Sam Delgado',
        });
      }
      audit(ctx, null, 'wo.close', 'work_order', h.wo.id, `${h.wo.number} closed: ${h.wo.title}`, h.wo.closedAt!);
    }

    // ── Open work ─────────────────────────────────────────────────────────
    const sam = person('sam');
    const open = (o: {
      eq: string;
      title: string;
      description?: string;
      type?: WorkOrder['type'];
      priority?: WorkOrder['priority'];
      status: WorkStatus;
      createdHoursAgo: number;
      by?: string;
      plan?: string;
      oos?: boolean;
      clearance?: ClearancePoint[];
      estHours?: number;
      fme?: boolean;
      radArea?: boolean;
      dose?: number;
      scheduledIn?: number;
      steps?: (SeedStep & { done?: number | true; doneHoursAgo?: number })[];
      parts?: { key: string; reserve: number; issued?: number }[];
      labor?: { who: string; hours: number; daysAgo: number; note?: string }[];
      releasedHoursAgo?: number;
      workCompleteHoursAgo?: number;
      parent?: WorkOrder;
      sourceStepId?: string;
      origin?: WorkOrder['origin'];
    }): WorkOrder => {
      const e = equipment(o.eq);
      const plan = o.plan ? plans.get(o.plan)! : null;
      const due = plan ? pmDue(plan, today, e.runHours) : null;
      const createdAt = hoursAgo(o.createdHoursAgo);
      const wo = insertWork(ctx, o.by ? person(o.by) : null, {
        equipmentId: e.id,
        title: o.title,
        description: o.description,
        type: o.type ?? plan?.type ?? 'CM',
        priority: o.priority ?? (plan?.type === 'ST' ? 2 : 3),
        status: o.status,
        origin: o.origin ?? (plan ? 'pm_generator' : 'request'),
        requiresOos: o.oos ?? plan?.requiresOos ?? false,
        clearancePoints: o.clearance ?? ((o.oos ?? plan?.requiresOos) ? defaultClearance(e) : []),
        estHours: o.estHours ?? plan?.estHours ?? 0,
        estDoseMrem: o.dose ?? 0,
        radArea: o.radArea ?? false,
        fme: o.fme ?? false,
        pmPlanId: plan?.id ?? null,
        dueDate: due?.dueDate ?? null,
        lateDate: due?.lateDate ?? null,
        scheduledDate: o.scheduledIn !== undefined ? addDays(today, o.scheduledIn) : null,
        parentWoId: o.parent?.id ?? null,
        sourceStepId: o.sourceStepId ?? null,
        at: createdAt,
      });
      const seedSteps = o.steps ?? plan?.steps ?? [];
      seedSteps.forEach((st, i) => {
        const done = (st as { done?: number | true }).done;
        const doneAt = hoursAgo((st as { doneHoursAgo?: number }).doneHoursAgo ?? 1);
        const step: WorkStep = {
          id: repo.newId('st'),
          woId: wo.id,
          seq: i + 1,
          kind: st.kind,
          text: st.text,
          unit: st.unit || null,
          minValue: st.min ?? null,
          maxValue: st.max ?? null,
          value: typeof done === 'number' ? done : null,
          result: null,
          completedBy: done !== undefined ? (st.kind === 'qc_hold' ? 'Rachel Okafor' : person(TECH[e.discipline]).name) : null,
          completedAt: done !== undefined ? doneAt : null,
        };
        if (step.value !== null) step.result = readingResult(step, step.value);
        repo.insertStep(ctx.db, step);
      });
      for (const p of o.parts ?? []) {
        repo.insertWorkPart(ctx.db, { id: repo.newId('wp'), woId: wo.id, partId: partId(p.key), qtyReserved: p.reserve, qtyIssued: p.issued ?? 0 });
        if (p.issued) repo.adjustOnHand(ctx.db, partId(p.key), -p.issued);
      }
      for (const l of o.labor ?? []) repo.insertLabor(ctx.db, { id: repo.newId('lb'), woId: wo.id, personId: l.who, hours: l.hours, workedOn: dateAgo(l.daysAgo), note: l.note ?? '' });
      const patch: Partial<WorkOrder> = {};
      if (o.releasedHoursAgo !== undefined) {
        patch.releasedAt = hoursAgo(o.releasedHoursAgo);
        patch.releasedBy = sam.name;
        if (wo.requiresOos) {
          enterOos(ctx, e, { woId: wo.id, reason: `${wo.number}: ${wo.title}`, actor: sam, at: patch.releasedAt });
          patch.clearanceStatus = o.workCompleteHoursAgo !== undefined ? 'released' : 'hung';
        }
      }
      if (o.workCompleteHoursAgo !== undefined) patch.workCompleteAt = hoursAgo(o.workCompleteHoursAgo);
      patch.updatedAt = hoursAgo(Math.min(o.createdHoursAgo, o.releasedHoursAgo ?? Infinity, o.workCompleteHoursAgo ?? Infinity));
      repo.updateWorkOrder(ctx.db, wo.id, patch);
      return repo.getWorkOrder(ctx.db, wo.id)!;
    };

    // 1. EDG 1B is in a 72-hour LCO for an injector replacement, 31 hours in.
    open({
      eq: 'edg-1b',
      title: 'Replace cylinder 7R fuel injector: high exhaust temperature on monthly run',
      description: 'During the monthly run (SR 3.8.1.3) cylinder 7R exhaust ran 112 °F above bank average. Injector suspected. EDG 1B declared inoperable at the start of work.',
      priority: 2,
      status: 'in_progress',
      createdHoursAgo: 34,
      by: 'sam',
      oos: true,
      estHours: 18,
      fme: true,
      releasedHoursAgo: 31,
      steps: [
        { kind: 'step', text: 'Verify clearance hung and EDG 1B locked out; bar engine to 7R TDC', done: true, doneHoursAgo: 30 },
        { kind: 'step', text: 'Remove cylinder 7R injector; inspect nozzle tip and seat', done: true, doneHoursAgo: 27 },
        { kind: 'reading', text: 'Replacement injector bench pop pressure', unit: 'psi', min: 3900, max: 4100, done: 4010, doneHoursAgo: 6 },
        { kind: 'step', text: 'Install new injector; torque hold-down nuts to 85 ft-lb in two passes' },
        { kind: 'qc_hold', text: 'QC hold: verify injector torque and FME closeout of cylinder head' },
        { kind: 'pmt', text: 'Start EDG 1B to rated speed and voltage', unit: 's', max: 10 },
        { kind: 'pmt', text: 'Cylinder 7R exhaust temperature deviation from bank average (loaded)', unit: '°F', max: 75 },
        { kind: 'pmt', text: 'Loaded run 4,000–4,400 kW for 60 min', unit: 'kW', min: 4000, max: 4400 },
      ],
      parts: [
        { key: 'injector', reserve: 1, issued: 1 },
        { key: 'head-gasket', reserve: 1 },
      ],
      labor: [
        { who: 'tom', hours: 6, daysAgo: 1, note: 'Injector removal' },
        { who: 'tom', hours: 3.5, daysAgo: 0, note: 'Bench test replacement injector' },
      ],
    });

    // 2. The EDG 1A 18-month PM is ready, but releasing it would take out the other train.
    open({ eq: 'edg-1a', plan: 'edg-1a-18mo', title: 'EDG 1A 18-month inspection and overhaul', status: 'ready', createdHoursAgo: 24 * 12, by: 'dana', fme: true, scheduledIn: 2, parts: [{ key: 'edg-filter', reserve: 6 }, { key: 'edg-fuel-filter', reserve: 4 }, { key: 'head-gasket', reserve: 2 }] });

    // 3. CCW Pump 1B: the vibration trend crossed its limit; bearing replacement in planning.
    const lastCcwRoute = history.filter((h) => h.wo.pmPlanId === planId('ccw-1b-vib')).at(-1)!;
    const failedStep = lastCcwRoute.steps.find((s) => s.result === 'fail')!;
    open({
      eq: 'ccw-p-1b',
      title: lastCcwRoute.followUp!.title,
      description: `${lastCcwRoute.followUp!.description} Found on ${lastCcwRoute.wo.number}.`,
      priority: 2,
      status: 'planning',
      createdHoursAgo: 24 * 4 - 2,
      origin: 'failed_reading',
      parent: lastCcwRoute.wo,
      sourceStepId: failedStep.id,
      oos: true,
      estHours: 16,
      steps: [
        { kind: 'step', text: 'Verify clearance hung; uncouple motor and remove outboard end bell' },
        { kind: 'step', text: 'Replace motor outboard bearing (6315 C3); pack with polyurea grease to 1/3 fill' },
        { kind: 'reading', text: 'Coupling alignment, parallel offset (as-left)', unit: 'mils', max: 2 },
        { kind: 'qc_hold', text: 'QC hold: verify bearing part number, Q-level receipt and installation' },
      ],
      parts: [{ key: 'bearing-6315', reserve: 2 }],
    });
    repo.setEquipmentStatus(ctx.db, eqId('ccw-p-1b'), 'degraded', `Outboard bearing vibration ${failedStep.value} in/s (limit 0.30)`);

    // 4. Breaker 1A01-03 overhaul: work done, waiting on the post-maintenance test.
    open({
      eq: 'bkr-1a0103',
      plan: 'bkr-1a0103-pm',
      title: 'Breaker 1A01-03 overhaul and timing test',
      status: 'testing',
      createdHoursAgo: 24 * 9,
      by: 'dana',
      releasedHoursAgo: 50,
      workCompleteHoursAgo: 3,
      steps: plans.get('bkr-1a0103-pm')!.steps.map((st) => ({
        ...st,
        done: st.kind === 'pmt' ? undefined : st.min !== undefined || st.max !== undefined ? ({ 'Close time': 63, 'Trip time': 35, 'Contact resistance, highest pole': 44, 'Insulation resistance, phase to ground': 16500 } as Record<string, number>)[st.text] : true,
        doneHoursAgo: 6,
      })),
      parts: [{ key: 'contact-lube', reserve: 1, issued: 1 }],
      labor: [
        { who: 'elena', hours: 7, daysAgo: 2, note: 'Disassembly, clean and inspect' },
        { who: 'elena', hours: 5, daysAgo: 0, note: 'Timing and contact resistance tests' },
      ],
    });

    // 5. RHR Pump 1A quarterly IST in the field now. The outboard bearing reading is next.
    open({
      eq: 'rhr-p-1a',
      plan: 'rhr-1a-ist',
      title: 'RHR Pump 1A quarterly inservice test',
      status: 'in_progress',
      createdHoursAgo: 24 * 8,
      by: 'dana',
      releasedHoursAgo: 1.5,
      steps: plans.get('rhr-1a-ist')!.steps.map((st, i) => ({ ...st, done: i === 0 ? true : i === 1 ? 183 : i === 2 ? 0.14 : undefined, doneHoursAgo: 1 })),
      labor: [{ who: 'tom', hours: 1.5, daysAgo: 0 }],
    });

    // 6. CREFS Train A in a 7-day LCO for HEPA replacement.
    open({
      eq: 'crefs-41a',
      title: 'Replace HEPA filter bank: in-place DOP penetration above limit',
      description: 'Routine in-place test found 0.08% penetration (limit 0.05%). Train A declared inoperable.',
      priority: 2,
      status: 'in_progress',
      createdHoursAgo: 74,
      by: 'sam',
      oos: true,
      estHours: 30,
      releasedHoursAgo: 70,
      steps: [
        { kind: 'step', text: 'Verify clearance hung; open filter housing access doors', done: true, doneHoursAgo: 68 },
        { kind: 'step', text: 'Remove and bag old HEPA cells for disposal (contaminated)', done: true, doneHoursAgo: 40 },
        { kind: 'step', text: 'Install new HEPA cells; verify gasket seating and clamp torque', done: true, doneHoursAgo: 20 },
        { kind: 'qc_hold', text: 'QC hold: verify HEPA cell certification and installation' },
        { kind: 'pmt', text: 'HEPA in-place DOP penetration (as-left)', unit: '%', max: 0.05 },
        { kind: 'pmt', text: 'Run Train A 15 min; filter train flow', unit: 'cfm', min: 3600, max: 4400 },
      ],
      parts: [{ key: 'hepa', reserve: 4, issued: 4 }],
      labor: [
        { who: 'tom', hours: 8, daysAgo: 2 },
        { who: 'tom', hours: 7.5, daysAgo: 1 },
      ],
      radArea: false,
    });

    // 7. IA Compressor 2 out of service (non-safety, no LCO).
    open({
      eq: 'ia-c-2',
      title: 'Compressor 2 unloader valve sticking; short-cycling loaded/unloaded',
      priority: 3,
      status: 'in_progress',
      createdHoursAgo: 52,
      by: 'marcus',
      oos: true,
      estHours: 8,
      releasedHoursAgo: 20,
      steps: [
        { kind: 'step', text: 'Verify clearance hung; bleed down air receiver', done: true, doneHoursAgo: 19 },
        { kind: 'step', text: 'Replace unloader valve kit' },
        { kind: 'pmt', text: 'Load test 30 min; discharge pressure at full load', unit: 'psig', min: 120, max: 130 },
      ],
      parts: [{ key: 'ia-unloader', reserve: 1, issued: 1 }],
      labor: [{ who: 'tom', hours: 2, daysAgo: 0 }],
    });

    // 8–9. Ready and planning work across disciplines.
    open({
      eq: 'main-xfmr',
      title: 'Replace failed radiator cooling fan motor, bank 2',
      priority: 3,
      status: 'ready',
      createdHoursAgo: 24 * 6,
      by: 'elena',
      estHours: 6,
      scheduledIn: 1,
      steps: [
        { kind: 'step', text: 'Open fan bank 2 supply breaker at transformer control cabinet; verify de-energized' },
        { kind: 'step', text: 'Replace fan motor; verify rotation' },
        { kind: 'reading', text: 'Fan motor running current', unit: 'A', max: 4.8 },
      ],
      parts: [{ key: 'xfmr-fan', reserve: 1 }],
    });
    open({
      eq: 'cr-chiller',
      title: 'Low refrigerant charge: leak check and recharge',
      priority: 3,
      status: 'planning',
      createdHoursAgo: 24 * 3,
      by: 'marcus',
      estHours: 6,
      steps: [
        { kind: 'step', text: 'Electronic leak check of all brazed joints and service valves' },
        { kind: 'step', text: 'Repair leak; evacuate and recharge to nameplate charge' },
      ],
      parts: [{ key: 'r134a', reserve: 1 }],
    });

    // 10–11. Work requests waiting for screening.
    open({ eq: 'sw-p-1a', title: 'Packing leak-off about 90 drops/min (limit 60)', description: 'Found on operator rounds. Puddle at pump base; no spray. Pump running normally.', priority: 3, status: 'requested', createdHoursAgo: 9, by: 'sam' });
    repo.setEquipmentStatus(ctx.db, eqId('sw-p-1a'), 'degraded', 'Packing leak-off above limit');
    open({ eq: 'crefs-41b', title: 'Belt squeal on start; belts appear glazed', description: 'Heard during the monthly run. Belts likely need replacement; Train B is still operable.', priority: 3, status: 'requested', createdHoursAgo: 26, by: 'tom' });
    open({ eq: 'afw-p-2a', title: 'Oil bubbler level low on inboard bearing', priority: 3, status: 'requested', createdHoursAgo: 40, by: 'tom' });
    open({ eq: 'fp-p-1', title: 'Packing gland nuts loose; leak-off excessive', priority: 3, status: 'requested', createdHoursAgo: 60, by: 'marcus' });

    // 12. MOV 8701B ready to work (Train B can come out: Train A is operable).
    open({
      eq: 'rhr-mov-8701b',
      title: 'Limit switch indication intermittent (dual indication on MCB)',
      priority: 3,
      status: 'ready',
      createdHoursAgo: 24 * 12,
      by: 'sam',
      oos: true,
      estHours: 8,
      radArea: true,
      dose: 45,
      scheduledIn: 4,
      steps: [
        { kind: 'step', text: 'Verify clearance hung; remove limit switch compartment cover' },
        { kind: 'step', text: 'Inspect limit switch rotors and contacts; replace rotor 4' },
        { kind: 'qc_hold', text: 'QC hold: verify rotor settings against MOV setup sheet' },
        { kind: 'pmt', text: 'Stroke valve from MCB; verify indication', unit: 's', max: 20 },
      ],
      parts: [{ key: 'limit-switch', reserve: 1 }],
    });

    // 13. Aging backlog.
    open({ eq: 'ccw-hx-1a', title: 'Replace cracked sight glass, CCW HX 1A shell vent', priority: 3, status: 'planning', createdHoursAgo: 24 * 140, by: 'tom', estHours: 3 });
    open({ eq: 'sw-str-1a', title: 'Repair damaged lagging on strainer drain line', priority: 4, status: 'requested', createdHoursAgo: 24 * 210, by: 'tom' });
    open({
      eq: 'main-gen',
      title: 'Replace collector housing air filters (next refueling outage)',
      priority: 4,
      status: 'ready',
      createdHoursAgo: 24 * 260,
      by: 'elena',
      estHours: 10,
      steps: [{ kind: 'step', text: 'Remove and replace collector housing inlet filters; inspect housing seals' }],
    });
    open({ eq: 'cd-p-1a', title: 'Motor space heater inoperative', priority: 3, status: 'planning', createdHoursAgo: 24 * 45, by: 'elena', estHours: 4, steps: [{ kind: 'step', text: 'Check heater element continuity and supply fuse; replace as needed' }] });
    open({ eq: 'lt-517', title: 'Minor weep at sensing line root valve', priority: 3, status: 'planning', createdHoursAgo: 24 * 20, by: 'kenji', estHours: 4, radArea: true, dose: 30 });
    open({ eq: 'bat-1b', title: 'Corrosion on terminal post, cell 37', priority: 3, status: 'planning', createdHoursAgo: 24 * 8, by: 'elena', estHours: 2 });

    // ── PM generator ──────────────────────────────────────────────────────
    const generated = generatePmWork(ctx, hoursAgo(5));
    // Work Control already reviewed a few of these packages.
    for (const wo of generated) {
      if ([planId('bat-1a-weekly'), planId('fp-2-weekly'), planId('pt-455-cot'), planId('edg-1a-monthly')].includes(wo.pmPlanId ?? '')) {
        repo.updateWorkOrder(ctx.db, wo.id, { status: 'ready', scheduledDate: wo.dueDate && wo.dueDate > today ? addDays(wo.dueDate, -1) : today });
      }
    }
  });
}
