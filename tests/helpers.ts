import type { AddressInfo } from 'node:net';
import { loadConfig } from '../server/config.ts';
import { openDatabase } from '../server/db/database.ts';
import * as repo from '../server/db/repo.ts';
import { seedDemo } from '../server/db/seed.ts';
import type { AppContext } from '../server/engine/context.ts';
import { createApp } from '../server/http/app.ts';
import type { Person } from '../shared/types.ts';

/** Thursday Oct 29 2026, 10:00 AM in Chicago. */
export const FIXED_NOW = new Date('2026-10-29T15:00:00Z');

export function testContext(opts: { env?: Record<string, string>; now?: Date } = {}): AppContext {
  const config = loadConfig({ DATABASE_PATH: ':memory:', SCHEDULER_ENABLED: 'false', ...opts.env });
  let now = opts.now ?? FIXED_NOW;
  const ctx: AppContext & { advance: (hours: number) => void } = {
    db: openDatabase(':memory:'),
    config,
    now: () => now,
    advance: (hours) => {
      now = new Date(now.getTime() + hours * 3_600_000);
    },
  };
  return ctx;
}

export function seeded(opts: { now?: Date } = {}): AppContext & { advance: (hours: number) => void } {
  const ctx = testContext(opts) as AppContext & { advance: (hours: number) => void };
  seedDemo(ctx);
  return ctx;
}

export function who(ctx: AppContext, id: string): Person {
  return repo.getPerson(ctx.db, id)!;
}

export function eq(ctx: AppContext, tag: string) {
  return repo.listEquipment(ctx.db).find((e) => e.tag === tag)!;
}

export function openWork(ctx: AppContext, tag: string, title: RegExp) {
  const e = eq(ctx, tag);
  return repo.listWorkOrders(ctx.db, { equipmentId: e.id, statuses: ['requested', 'planning', 'ready', 'in_progress', 'testing'] }).find((w) => title.test(w.title))!;
}

export async function startServer(ctx: AppContext): Promise<{ url: string; close: () => Promise<void> }> {
  const app = createApp(ctx);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise((resolve) => server.close(() => resolve())) };
}
