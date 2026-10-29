// Operability: taking equipment out of service, Tech Spec LCO clocks, protected
// trains and LCO 3.0.3.
import * as repo from '../db/repo.ts';
import { hoursBetween } from '../../shared/dates.ts';
import type { ActiveLco, Equipment, OosEvent, Person, Ts303Alert } from '../../shared/types.ts';
import { audit } from './audit.ts';
import { type AppContext, nowIso } from './context.ts';

function fmtHours(h: number): string {
  return h >= 48 && h % 24 === 0 ? `${h / 24} days` : `${h} h`;
}

/**
 * Removes equipment from service. For Tech Spec equipment this enters the LCO and
 * starts its completion-time clock. If the equipment is already out of service,
 * the open event is reused (and linked to the work order if it had none).
 */
export function enterOos(ctx: AppContext, equipment: Equipment, opts: { woId: string | null; reason: string; actor: Person | null; at?: string }): OosEvent {
  const existing = repo.openOosForEquipment(ctx.db, equipment.id)[0];
  if (existing) {
    if (opts.woId && !existing.woId) {
      repo.linkOosToWorkOrder(ctx.db, existing.id, opts.woId);
      existing.woId = opts.woId;
    }
    return existing;
  }
  const at = opts.at ?? nowIso(ctx);
  const ts = equipment.techSpecId ? repo.getTechSpec(ctx.db, equipment.techSpecId) : null;
  const event: OosEvent = {
    id: repo.newId('oos'),
    equipmentId: equipment.id,
    woId: opts.woId,
    reason: opts.reason,
    startedAt: at,
    endedAt: null,
    techSpecId: ts?.id ?? null,
    lcoDueAt: ts ? new Date(Date.parse(at) + ts.completionHours * 3_600_000).toISOString() : null,
    enteredBy: opts.actor?.name ?? 'System',
    exitedBy: null,
  };
  repo.insertOos(ctx.db, event);
  repo.setEquipmentStatus(ctx.db, equipment.id, 'inoperable', opts.reason);
  audit(
    ctx,
    opts.actor,
    ts ? 'lco.enter' : 'equipment.oos',
    'equipment',
    equipment.id,
    ts ? `${equipment.tag} declared inoperable. Entered LCO ${ts.code} (${fmtHours(ts.completionHours)} completion time). ${opts.reason}` : `${equipment.tag} removed from service. ${opts.reason}`,
    at,
  );
  return event;
}

/** Ends the out-of-service events a work order holds and, when nothing else holds the equipment out, declares it operable. */
export function restoreEquipment(ctx: AppContext, equipment: Equipment, opts: { woId: string; actor: Person; at?: string }): void {
  const at = opts.at ?? nowIso(ctx);
  const open = repo.openOosForEquipment(ctx.db, equipment.id);
  for (const e of open.filter((e) => e.woId === opts.woId)) {
    repo.endOos(ctx.db, e.id, at, opts.actor.name);
    const ts = e.techSpecId ? repo.getTechSpec(ctx.db, e.techSpecId) : null;
    const hours = hoursBetween(e.startedAt, at);
    audit(ctx, opts.actor, ts ? 'lco.exit' : 'equipment.rts', 'equipment', equipment.id, ts ? `${equipment.tag} declared operable. Exited LCO ${ts.code} after ${hours.toFixed(1)} h.` : `${equipment.tag} returned to service after ${hours.toFixed(1)} h.`, at);
  }
  if (!open.some((e) => e.woId !== opts.woId)) repo.setEquipmentStatus(ctx.db, equipment.id, 'operable', null);
}

/** Other trains of the same Tech Spec that are inoperable right now. Taking this train out too would leave no operable train. */
export function protectedTrainConflicts(ctx: AppContext, equipment: Equipment): Equipment[] {
  if (!equipment.techSpecId || !equipment.train) return [];
  return repo
    .listEquipment(ctx.db)
    .filter((e) => e.id !== equipment.id && e.techSpecId === equipment.techSpecId && e.train && e.train !== equipment.train && e.status === 'inoperable');
}

export function activeLcos(ctx: AppContext): ActiveLco[] {
  const now = nowIso(ctx);
  const out: ActiveLco[] = [];
  for (const oos of repo.openOosEvents(ctx.db)) {
    if (!oos.techSpecId || !oos.lcoDueAt) continue;
    const equipment = repo.getEquipment(ctx.db, oos.equipmentId)!;
    const techSpec = repo.getTechSpec(ctx.db, oos.techSpecId)!;
    const wo = oos.woId ? repo.getWorkOrder(ctx.db, oos.woId) : null;
    const hoursRemaining = hoursBetween(now, oos.lcoDueAt);
    out.push({
      oos,
      equipment,
      techSpec,
      workOrder: wo ? { id: wo.id, number: wo.number, title: wo.title, status: wo.status } : null,
      hoursRemaining,
      expired: hoursRemaining <= 0,
    });
  }
  return out.sort((a, b) => a.hoursRemaining - b.hoursRemaining);
}

/** Tech Specs where every train is inoperable at once. */
export function ts303Alerts(ctx: AppContext): Ts303Alert[] {
  const equipment = repo.listEquipment(ctx.db);
  const alerts: Ts303Alert[] = [];
  for (const ts of repo.listTechSpecs(ctx.db)) {
    const covered = equipment.filter((e) => e.techSpecId === ts.id && e.train);
    const trains = new Set(covered.map((e) => e.train));
    if (trains.size < 2) continue;
    const down = covered.filter((e) => e.status === 'inoperable');
    if (new Set(down.map((e) => e.train)).size === trains.size) alerts.push({ techSpec: ts, equipment: down });
  }
  return alerts;
}
