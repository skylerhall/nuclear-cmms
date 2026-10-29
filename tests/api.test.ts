// End to end through HTTP, the way the dashboard drives it.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seedDemo } from '../server/db/seed.ts';
import { seeded, startServer, testContext } from './helpers.ts';

function client(url: string, user = 'dana') {
  return async (path: string, init: { method?: string; body?: unknown; as?: string } = {}) => {
    const res = await fetch(`${url}/api${path}`, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      headers: { 'content-type': 'application/json', 'x-user': init.as ?? user },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    return { status: res.status, body: (await res.json()) as any };
  };
}

test('dashboard API: request work, plan it, and see role-gated actions', async () => {
  const ctx = seeded();
  const server = await startServer(ctx);
  const api = client(server.url);
  try {
    const boot = await api('/bootstrap');
    assert.equal(boot.body.plant.name, 'Halcyon Point Generating Station');
    assert.equal(boot.body.people.length, 8);

    const overview = await api('/overview');
    assert.equal(overview.body.lcos.length, 2);
    assert.ok(overview.body.emergent.length > 0);

    const equipment = (await api('/equipment')).body as { id: string; tag: string }[];
    const afw = equipment.find((e) => e.tag === '1-AFW-P-1')!;
    const created = await api('/work-orders', { body: { equipmentId: afw.id, title: 'Governor oil leak at actuator fitting', priority: 3 }, as: 'tom' });
    assert.equal(created.status, 201);
    assert.equal(created.body.status, 'requested');
    assert.equal(created.body.requestedBy, 'Tom Brandt');

    // A technician can't screen work; a supervisor can.
    const denied = await api(`/work-orders/${created.body.id}/actions`, { body: { action: 'screen' }, as: 'tom' });
    assert.equal(denied.status, 403);
    const screened = await api(`/work-orders/${created.body.id}/actions`, { body: { action: 'screen' }, as: 'marcus' });
    assert.equal(screened.body.workOrder.status, 'planning');

    const steps = await api(`/work-orders/${created.body.id}/steps`, { body: { kind: 'reading', text: 'Actuator oil pressure', unit: 'psig', min: 150, max: 200 } });
    assert.equal(steps.status, 200);
    const ready = steps.body.actions.find((a: { action: string }) => a.action === 'ready');
    assert.equal(ready.allowedForActor, true);
    assert.ok(ready.gates.some((g: { label: string; ok: boolean }) => /QC hold/.test(g.label) && !g.ok));

    const byNumber = await api(`/work-orders/${created.body.number}`);
    assert.equal(byNumber.body.workOrder.id, created.body.id);

    const unknown = await api('/overview', { as: 'nobody' });
    assert.equal(unknown.status, 400);

    const reliability = await api('/reliability');
    assert.equal(reliability.body.systems.find((s: { system: { code: string } }) => s.system.code === 'SW').status, 'a1');
    const equipmentDetail = await api(`/equipment/1-CCW-P-1B`);
    assert.ok(equipmentDetail.body.trends.some((t: { text: string }) => /outboard/.test(t.text)));
  } finally {
    await server.close();
  }
});

test('DEMO_PASSWORD locks the API', async () => {
  const ctx = testContext({ env: { DEMO_PASSWORD: 'reactor' } });
  seedDemo(ctx);
  const server = await startServer(ctx);
  try {
    const locked = await fetch(`${server.url}/api/bootstrap`);
    assert.equal(locked.status, 401);
    const bad = await fetch(`${server.url}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'nope' }) });
    assert.equal(bad.status, 401);
    const login = await fetch(`${server.url}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'reactor' }) });
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    const ok = await fetch(`${server.url}/api/bootstrap`, { headers: { cookie } });
    assert.equal(ok.status, 200);
  } finally {
    await server.close();
  }
});
