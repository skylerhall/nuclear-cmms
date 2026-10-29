import { createHash } from 'node:crypto';

export interface AppConfig {
  port: number;
  databasePath: string;
  demoPassword: string | null;
  sessionSecret: string;
  /** Runs the PM/surveillance generator hourly. */
  schedulerEnabled: boolean;
}

type Env = Record<string, string | undefined>;

function str(env: Env, key: string): string | null {
  const value = env[key]?.trim();
  return value ? value : null;
}

function num(env: Env, key: string, fallback: number): number {
  const value = Number(str(env, key));
  return Number.isFinite(value) && str(env, key) !== null ? value : fallback;
}

function bool(env: Env, key: string, fallback: boolean): boolean {
  const value = str(env, key);
  if (value === null) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export function loadConfig(env: Env = process.env): AppConfig {
  const demoPassword = str(env, 'DEMO_PASSWORD');
  return {
    port: num(env, 'PORT', 4200),
    databasePath: str(env, 'DATABASE_PATH') ?? './data/cmms.db',
    demoPassword,
    sessionSecret: str(env, 'SESSION_SECRET') ?? createHash('sha256').update(`session:${demoPassword ?? 'open-demo'}`).digest('hex'),
    schedulerEnabled: bool(env, 'SCHEDULER_ENABLED', true),
  };
}
