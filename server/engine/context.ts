import type { AppConfig } from '../config.ts';
import type { DB } from '../db/database.ts';
import { getPlant } from '../db/repo.ts';
import { dateIn } from '../../shared/dates.ts';
import { ROLE_LABEL } from '../../shared/rules.ts';
import type { Person, Role } from '../../shared/types.ts';

/** Everything the engine needs. `now` is injectable for tests and seeding. */
export interface AppContext {
  db: DB;
  config: AppConfig;
  now: () => Date;
}

export function nowIso(ctx: AppContext): string {
  return ctx.now().toISOString();
}

/** Today's date at the plant. */
export function plantToday(ctx: AppContext): string {
  return dateIn(getPlant(ctx.db)?.timezone ?? 'America/Chicago', ctx.now());
}

/** Thrown for anything the user can fix: a failed gate, a missing field, a wrong role. */
export class RuleError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function requireRole(actor: Person, roles: readonly Role[], what: string): void {
  if (!roles.includes(actor.role)) {
    throw new RuleError(`${actor.name} (${ROLE_LABEL[actor.role]}) can't ${what}. That takes a ${roles.map((r) => ROLE_LABEL[r]).join(' or ')}.`, 403);
  }
}
