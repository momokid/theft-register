import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { config } from 'dotenv';
import { parseJsonColumn } from './helpers.js';
config({ path: new URL('../.env.test', import.meta.url) });
const { app } = await import('../server/index.js');
const { pool } = await import('../server/db.js');

let server, base, cookie;

async function api(path, opts = {}) {
  return fetch(`${base}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Origin: process.env.APP_ORIGIN, Cookie: cookie, ...opts.headers },
  });
}

before(async () => {
  server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  base = `http://localhost:${server.address().port}`;

  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: process.env.APP_ORIGIN },
    body: JSON.stringify({ email: 'test-admin@example.com', password: 'TestPass123' }),
  });
  cookie = res.headers.get('set-cookie').split(';')[0];

  // Reset the rows this file mutates so re-running the suite is idempotent.
  await pool.query(`UPDATE thefts SET unit_price = NULL, price_override = 0 WHERE item_type = 'Fuel'`);
});

after(async () => {
  server.close();
  await pool.end();
});

test('PATCH /api/thefts/:id/price requires auth', async () => {
  const res = await fetch(`${base}/api/thefts/1/price`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Origin: process.env.APP_ORIGIN },
    body: JSON.stringify({ unit_price: 5 }),
  });
  assert.equal(res.status, 401);
});

test('PATCH sets an override price', async () => {
  const [[{ id }]] = await pool.query(`SELECT id FROM thefts WHERE item_type = 'Fuel' LIMIT 1`);
  const res = await api(`/api/thefts/${id}/price`, { method: 'PATCH', body: JSON.stringify({ unit_price: 12.5 }) });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.unit_price, 12.5);
  assert.equal(body.price_override, 1);

  const [[row]] = await pool.query('SELECT unit_price, price_override FROM thefts WHERE id = ?', [id]);
  assert.equal(Number(row.unit_price), 12.5);
  assert.equal(row.price_override, 1);

  const [[auditRow]] = await pool.query(
    `SELECT action, old_value, new_value FROM audit_log WHERE entity = 'theft' AND entity_id = ? ORDER BY id DESC LIMIT 1`,
    [String(id)]
  );
  assert.equal(auditRow.action, 'price_override');
  assert.equal(parseJsonColumn(auditRow.new_value).unit_price, 12.5);
});

test('PATCH with null clears the override', async () => {
  const [[{ id }]] = await pool.query(`SELECT id FROM thefts WHERE item_type = 'Fuel' AND price_override = 1 LIMIT 1`);
  const res = await api(`/api/thefts/${id}/price`, { method: 'PATCH', body: JSON.stringify({ unit_price: null }) });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.unit_price, null);
  assert.equal(body.price_override, 0);

  const [[auditRow]] = await pool.query(
    `SELECT action FROM audit_log WHERE entity = 'theft' AND entity_id = ? ORDER BY id DESC LIMIT 1`,
    [String(id)]
  );
  assert.equal(auditRow.action, 'price_clear');
});

test('PATCH rejects invalid prices', async () => {
  const [[{ id }]] = await pool.query(`SELECT id FROM thefts LIMIT 1`);
  for (const unit_price of [-1, 10000000, 1.005, 'abc', true]) {
    const res = await api(`/api/thefts/${id}/price`, { method: 'PATCH', body: JSON.stringify({ unit_price }) });
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(unit_price)}`);
  }
});

test('PATCH rejects an unknown field', async () => {
  const [[{ id }]] = await pool.query(`SELECT id FROM thefts LIMIT 1`);
  const res = await api(`/api/thefts/${id}/price`, { method: 'PATCH', body: JSON.stringify({ unit_price: 5, extra: 1 }) });
  assert.equal(res.status, 400);
});

test('PATCH on a missing id returns 404', async () => {
  const res = await api('/api/thefts/999999/price', { method: 'PATCH', body: JSON.stringify({ unit_price: 5 }) });
  assert.equal(res.status, 404);
});

test('POST /api/prices/apply requires auth', async () => {
  const res = await fetch(`${base}/api/prices/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: process.env.APP_ORIGIN },
    body: JSON.stringify({ item_type: 'Fuel', from: '2026-01-01', to: '2026-12-31', unit_price: 10 }),
  });
  assert.equal(res.status, 401);
});

test('POST /api/prices/apply rejects invalid input', async () => {
  const cases = [
    { item_type: '', from: '2026-01-01', to: '2026-12-31', unit_price: 10 },
    { item_type: 'Fuel', from: '2026-12-31', to: '2026-01-01', unit_price: 10 },
    { item_type: 'Fuel', from: '2026-01-01', to: '2026-12-31', project: 'XYZ', unit_price: 10 },
    { item_type: 'Fuel', from: '2026-01-01', to: '2026-12-31', unit_price: -5 },
    { item_type: 'Fuel', from: '2026-01-01', to: '2026-12-31', unit_price: 10, extra: 1 },
  ];
  for (const body of cases) {
    const res = await api('/api/prices/apply', { method: 'POST', body: JSON.stringify(body) });
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(body)}`);
  }
});

test('acceptance check: apply, override, re-apply skips the overridden row', async () => {
  const filter = { item_type: 'Fuel', project: 'ATC', from: '2026-04-30', to: '2026-09-07' };

  const first = await api('/api/prices/apply', {
    method: 'POST',
    body: JSON.stringify({ ...filter, unit_price: 10 }),
  });
  assert.equal(first.status, 200);
  const firstBody = await first.json();
  assert.equal(firstBody.updated, 7);
  assert.equal(firstBody.skipped_overrides, 0);

  const [[{ id }]] = await pool.query(
    `SELECT id FROM thefts WHERE item_type = 'Fuel' AND project = 'ATC' AND post_date BETWEEN '2026-04-30' AND '2026-09-07' LIMIT 1`
  );
  const overrideRes = await api(`/api/thefts/${id}/price`, { method: 'PATCH', body: JSON.stringify({ unit_price: 12 }) });
  assert.equal(overrideRes.status, 200);

  const second = await api('/api/prices/apply', {
    method: 'POST',
    body: JSON.stringify({ ...filter, unit_price: 11 }),
  });
  assert.equal(second.status, 200);
  const secondBody = await second.json();
  assert.equal(secondBody.updated, 6);
  assert.equal(secondBody.skipped_overrides, 1);

  const [[row]] = await pool.query('SELECT unit_price FROM thefts WHERE id = ?', [id]);
  assert.equal(Number(row.unit_price), 12);

  const [[applyAudit]] = await pool.query(
    `SELECT old_value FROM audit_log WHERE action = 'price_apply' ORDER BY id DESC LIMIT 1`
  );
  const oldValues = parseJsonColumn(applyAudit.old_value);
  assert.equal(oldValues.length, 6);
  assert.ok(oldValues.every((r) => Number(r.unit_price) === 10));
  assert.ok(!oldValues.some((r) => r.id === id));
});
