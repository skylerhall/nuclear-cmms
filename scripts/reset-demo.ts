// Wipes the database and reloads the fictional plant: `npm run demo:reset`.
import { existsSync } from 'node:fs';
import { loadConfig } from '../server/config.ts';
import { openDatabase } from '../server/db/database.ts';
import { resetDemo } from '../server/db/seed.ts';

if (existsSync('.env')) process.loadEnvFile('.env');
const config = loadConfig();
const db = openDatabase(config.databasePath);
resetDemo({ db, config, now: () => new Date() });
console.log(`Demo data reset in ${config.databasePath}`);
