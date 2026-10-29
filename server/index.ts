// Entry point: loads .env, opens the database, seeds the demo when empty,
// starts the PM generator and serves the dashboard.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { loadConfig } from './config.ts';
import { openDatabase } from './db/database.ts';
import { seedIfEmpty } from './db/seed.ts';
import type { AppContext } from './engine/context.ts';
import { startScheduler } from './engine/scheduler.ts';
import { createApp } from './http/app.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dev = process.argv.includes('--dev');

if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'));

const config = loadConfig();
const db = openDatabase(config.databasePath);
const ctx: AppContext = { db, config, now: () => new Date() };

if (seedIfEmpty(ctx)) console.log('[seed] Loaded the fictional Halcyon Point plant');
if (config.schedulerEnabled) startScheduler(ctx);

const app = createApp(ctx);

if (dev) {
  const { createServer } = await import('vite');
  const vite = await createServer({ configFile: join(root, 'vite.config.ts'), server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
} else {
  const dist = join(root, 'dist', 'web');
  if (!existsSync(join(dist, 'index.html'))) {
    console.error('Dashboard build not found. Run "npm run build" first (or "npm run dev" for development).');
    process.exit(1);
  }
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(join(dist, 'index.html')));
}

app.listen(config.port, () => {
  console.log(`\n  CMMS       http://localhost:${config.port}`);
  console.log(`  Database   ${config.databasePath}`);
  console.log(`  Password   ${config.demoPassword ? 'required' : 'off (set DEMO_PASSWORD before deploying)'}\n`);
});
