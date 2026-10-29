import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type DB = DatabaseSync;

// Timestamps are ISO strings (UTC). Calendar dates (due dates, work dates) are
// 'YYYY-MM-DD' in plant local time.
const MIGRATIONS: string[] = [
  `
  CREATE TABLE plant (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT NOT NULL,
    short_name TEXT NOT NULL,
    operator TEXT NOT NULL,
    timezone TEXT NOT NULL,
    reactor_type TEXT NOT NULL
  );

  CREATE TABLE people (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    initials TEXT NOT NULL,
    role TEXT NOT NULL,
    title TEXT NOT NULL,
    discipline TEXT
  );

  CREATE TABLE systems (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    risk_significant INTEGER NOT NULL,
    mr_ff_limit INTEGER NOT NULL,
    mr_unavail_limit_hours REAL NOT NULL
  );

  CREATE TABLE tech_specs (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    condition TEXT NOT NULL,
    required_action TEXT NOT NULL,
    completion_hours REAL NOT NULL
  );

  CREATE TABLE equipment (
    id TEXT PRIMARY KEY,
    tag TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    system_code TEXT NOT NULL REFERENCES systems(code),
    equipment_type TEXT NOT NULL,
    discipline TEXT NOT NULL,
    safety_class TEXT NOT NULL CHECK (safety_class IN ('SR', 'AQ', 'NSR')),
    criticality INTEGER NOT NULL,
    train TEXT,
    location TEXT NOT NULL,
    manufacturer TEXT NOT NULL,
    model TEXT NOT NULL,
    tech_spec_id TEXT REFERENCES tech_specs(id),
    status TEXT NOT NULL DEFAULT 'operable',
    status_note TEXT,
    run_hours REAL
  );

  CREATE TABLE meter_readings (
    id TEXT PRIMARY KEY,
    equipment_id TEXT NOT NULL REFERENCES equipment(id),
    value REAL NOT NULL,
    read_at TEXT NOT NULL,
    read_by TEXT NOT NULL
  );
  CREATE INDEX meter_readings_equipment ON meter_readings (equipment_id, read_at);

  CREATE TABLE pm_plans (
    id TEXT PRIMARY KEY,
    equipment_id TEXT NOT NULL REFERENCES equipment(id),
    title TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('PM', 'PDM', 'ST')),
    sr_ref TEXT,
    interval_days INTEGER,
    interval_hours INTEGER,
    grace_pct REAL NOT NULL DEFAULT 25,
    lead_days INTEGER NOT NULL DEFAULT 14,
    last_done_date TEXT,
    last_done_hours REAL,
    est_hours REAL NOT NULL,
    discipline TEXT NOT NULL,
    requires_oos INTEGER NOT NULL DEFAULT 0,
    steps_json TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    CHECK ((interval_days IS NULL) <> (interval_hours IS NULL))
  );

  CREATE TABLE work_orders (
    id TEXT PRIMARY KEY,
    number TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    equipment_id TEXT NOT NULL REFERENCES equipment(id),
    type TEXT NOT NULL CHECK (type IN ('CM', 'PM', 'PDM', 'ST')),
    priority INTEGER NOT NULL CHECK (priority BETWEEN 1 AND 4),
    status TEXT NOT NULL,
    discipline TEXT NOT NULL,
    pm_plan_id TEXT REFERENCES pm_plans(id),
    due_date TEXT,
    late_date TEXT,
    scheduled_date TEXT,
    requires_oos INTEGER NOT NULL DEFAULT 0,
    clearance_json TEXT NOT NULL DEFAULT '[]',
    clearance_status TEXT NOT NULL DEFAULT 'none',
    est_hours REAL NOT NULL DEFAULT 0,
    est_dose_mrem REAL NOT NULL DEFAULT 0,
    rad_area INTEGER NOT NULL DEFAULT 0,
    fme INTEGER NOT NULL DEFAULT 0,
    confined_space INTEGER NOT NULL DEFAULT 0,
    functional_failure INTEGER,
    mr_note TEXT,
    parent_wo_id TEXT REFERENCES work_orders(id),
    source_step_id TEXT,
    origin TEXT NOT NULL,
    requested_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    released_at TEXT,
    released_by TEXT,
    work_complete_at TEXT,
    closed_at TEXT,
    closed_by TEXT,
    cancel_reason TEXT
  );
  CREATE INDEX work_orders_status ON work_orders (status);
  CREATE INDEX work_orders_equipment ON work_orders (equipment_id, created_at);
  CREATE INDEX work_orders_plan ON work_orders (pm_plan_id);

  CREATE TABLE wo_steps (
    id TEXT PRIMARY KEY,
    wo_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('step', 'reading', 'qc_hold', 'pmt')),
    text TEXT NOT NULL,
    unit TEXT,
    min_value REAL,
    max_value REAL,
    value REAL,
    result TEXT,
    completed_by TEXT,
    completed_at TEXT
  );
  CREATE INDEX wo_steps_wo ON wo_steps (wo_id, seq);

  CREATE TABLE parts (
    id TEXT PRIMARY KEY,
    stock_code TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    mfr_part TEXT NOT NULL,
    quality TEXT NOT NULL CHECK (quality IN ('Q', 'NQ')),
    bin TEXT NOT NULL,
    on_hand INTEGER NOT NULL,
    reorder_point INTEGER NOT NULL,
    max_qty INTEGER NOT NULL,
    unit_cost_cents INTEGER NOT NULL,
    lead_days INTEGER NOT NULL,
    critical_spare INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE wo_parts (
    id TEXT PRIMARY KEY,
    wo_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    part_id TEXT NOT NULL REFERENCES parts(id),
    qty_reserved INTEGER NOT NULL,
    qty_issued INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE wo_labor (
    id TEXT PRIMARY KEY,
    wo_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    person_id TEXT NOT NULL REFERENCES people(id),
    hours REAL NOT NULL,
    worked_on TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT ''
  );

  -- Every period a component was out of service. Rows with a tech_spec_id are
  -- Tech Spec LCO entries; all rows feed Maintenance Rule unavailability.
  CREATE TABLE oos_events (
    id TEXT PRIMARY KEY,
    equipment_id TEXT NOT NULL REFERENCES equipment(id),
    wo_id TEXT REFERENCES work_orders(id),
    reason TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    tech_spec_id TEXT REFERENCES tech_specs(id),
    lco_due_at TEXT,
    entered_by TEXT NOT NULL,
    exited_by TEXT
  );
  CREATE INDEX oos_open ON oos_events (equipment_id, ended_at);

  CREATE TABLE audit (
    id TEXT PRIMARY KEY,
    at TEXT NOT NULL,
    actor_id TEXT,
    actor_name TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    summary TEXT NOT NULL
  );
  CREATE INDEX audit_entity ON audit (entity_type, entity_id, at);
  CREATE INDEX audit_at ON audit (at);

  CREATE TABLE counters (
    name TEXT PRIMARY KEY,
    value INTEGER NOT NULL
  );
  `,
];

export function openDatabase(path: string): DB {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  migrate(db);
  return db;
}

function migrate(db: DB): void {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
  for (let v = row.user_version; v < MIGRATIONS.length; v++) {
    transaction(db, () => {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

let depth = 0;

/** Runs fn in a transaction. Nested calls join the outer transaction. */
export function transaction<T>(db: DB, fn: () => T): T {
  if (depth > 0) return fn();
  db.exec('BEGIN');
  depth++;
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    depth--;
  }
}

/** Deletes all data (keeps the schema). Used by demo reset. */
export function clearAll(db: DB): void {
  transaction(db, () => {
    for (const t of ['audit', 'wo_labor', 'wo_parts', 'wo_steps', 'oos_events', 'work_orders', 'pm_plans', 'meter_readings', 'parts', 'equipment', 'tech_specs', 'systems', 'people', 'plant', 'counters']) {
      db.exec(`DELETE FROM ${t}`);
    }
  });
}
