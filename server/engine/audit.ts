import { insertAudit } from '../db/repo.ts';
import type { AuditEntry, Person } from '../../shared/types.ts';
import { type AppContext, nowIso } from './context.ts';

/** Records who did what. `actor` null means the system (PM generator, seed import). */
export function audit(ctx: AppContext, actor: Person | null, action: string, entityType: AuditEntry['entityType'], entityId: string | null, summary: string, at?: string): void {
  insertAudit(ctx.db, { at: at ?? nowIso(ctx), actorId: actor?.id ?? null, actorName: actor?.name ?? 'System', action, entityType, entityId, summary });
}
