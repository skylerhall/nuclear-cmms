// Maintenance Rule (10 CFR 50.65) performance monitoring per system over a
// rolling 24 months: functional failures and unavailability against each
// system's performance criteria. A system over its criteria goes to (a)(1):
// goal-setting and closer monitoring until performance recovers.
import * as repo from '../db/repo.ts';
import { type AppContext, nowIso } from './context.ts';
import type { PlantSystem } from '../../shared/types.ts';

export const WINDOW_DAYS = 730;

export interface SystemReliability {
  system: PlantSystem;
  equipmentCount: number;
  functionalFailures: number;
  unavailabilityHours: number;
  correctiveCount: number;
  /** Component-hours per functional failure. null when there were none. */
  mtbfHours: number | null;
  /** Mean hours out of service for corrective work. */
  mttrHours: number | null;
  status: 'a1' | 'watch' | 'a2';
}

export function systemReliability(ctx: AppContext): SystemReliability[] {
  const now = nowIso(ctx);
  const nowMs = Date.parse(now);
  const since = new Date(nowMs - WINDOW_DAYS * 86_400_000).toISOString();
  const sinceMs = Date.parse(since);
  const equipment = repo.listEquipment(ctx.db);
  const systemOf = new Map(equipment.map((e) => [e.id, e.systemCode]));
  const cms = repo.listWorkOrders(ctx.db, { createdSince: since }).filter((w) => w.type === 'CM' && w.status !== 'cancelled');
  const cmIds = new Set(repo.listWorkOrders(ctx.db).filter((w) => w.type === 'CM').map((w) => w.id));
  const oos = repo.listOosSince(ctx.db, since);

  return repo.listSystems(ctx.db).map((system) => {
    const count = equipment.filter((e) => e.systemCode === system.code).length;
    const sysCms = cms.filter((w) => systemOf.get(w.equipmentId) === system.code);
    const ff = sysCms.filter((w) => w.functionalFailure === true).length;
    const sysOos = oos.filter((e) => systemOf.get(e.equipmentId) === system.code);
    const unavailability = sysOos.reduce((sum, e) => {
      const start = Math.max(Date.parse(e.startedAt), sinceMs);
      const end = e.endedAt ? Date.parse(e.endedAt) : nowMs;
      return sum + Math.max(0, end - start) / 3_600_000;
    }, 0);
    const repairs = sysOos.filter((e) => e.endedAt && e.woId && cmIds.has(e.woId)).map((e) => (Date.parse(e.endedAt!) - Date.parse(e.startedAt)) / 3_600_000);
    const ffRatio = ff / Math.max(system.mrFunctionalFailureLimit, 1);
    const unavailRatio = unavailability / system.mrUnavailabilityLimitHours;
    const status = ff > system.mrFunctionalFailureLimit || unavailRatio > 1 ? 'a1' : ffRatio >= 0.75 || unavailRatio >= 0.75 ? 'watch' : 'a2';
    return {
      system,
      equipmentCount: count,
      functionalFailures: ff,
      unavailabilityHours: Math.round(unavailability * 10) / 10,
      correctiveCount: sysCms.length,
      mtbfHours: ff ? Math.round((count * WINDOW_DAYS * 24) / ff) : null,
      mttrHours: repairs.length ? Math.round((repairs.reduce((a, b) => a + b, 0) / repairs.length) * 10) / 10 : null,
      status,
    };
  });
}
