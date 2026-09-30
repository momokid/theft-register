import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { config } from 'dotenv';
config({ path: new URL('../.env.test', import.meta.url) });
const { app } = await import('../server/index.js');
const { pool } = await import('../server/db.js');

let server, base, cookie, targetId, originalQuantity, originalOverride;

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

  // Non-Fuel row: editing its quantity must not disturb the fuel_lost_l acceptance check elsewhere.
  const [[row]] = await pool.query(
    `SELECT id, quantity_lost, quantity_override FROM thefts WHERE item_type != 'Fuel' AND quantity_lost IS NOT NULL LIMIT 1`
  );
  targetId = row.id;
  originalQuantity = row.quantity_lost;
  originalOverride = row.quantity_override;
});

after(async () => {
  await pool.query('UPDATE thefts SET quantity_lost = ?, quantity_override = ? WHERE id = ?', [
    originalQuantity,
    originalOverride,
    targetId,
  ]);
  server.close();
  await pool.end();
});

test('PATCH /api/thefts/:id/quantity requires auth', async () => {
  const res = await fetch(`${base}/api/thefts/${targetId}/quantity`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Origin: process.env.APP_ORIGIN },
    body: JSON.stringify({ quantity_lost: 5 }),
  });
  assert.equal(res.status, 401);
});

test('PATCH corrects the quantity and marks it overridden', async () => {
  const newQty = Number(originalQuantity) + 1;
  const res = await api(`/api/thefts/${targetId}/quantity`, {
    method: 'PATCH',
    body: JSON.stringify({ quantity_lost: newQty }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(Number(body.quantity_lost), newQty);
  assert.equal(body.quantity_override, 1);

  const [[row]] = await pool.query('SELECT quantity_lost, quantity_override FROM thefts WHERE id = ?', [targetId]);
  assert.equal(Number(row.quantity_lost), newQty);
  assert.equal(row.quantity_override, 1);

  const [[auditRow]] = await pool.query(
    `SELECT action, new_value FROM audit_log WHERE entity = 'theft' AND entity_id = ? ORDER BY id DESC LIMIT 1`,
    [String(targetId)]
  );
  assert.equal(auditRow.action, 'quantity_override');
  assert.equal(Number(JSON.parse(auditRow.new_value).quantity_lost), newQty);
});

test('PATCH rejects invalid quantities', async () => {
  for (const quantity_lost of [-1, 1.005, 'abc', true]) {
    const res = await api(`/api/thefts/${targetId}/quantity`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity_lost }),
    });
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(quantity_lost)}`);
  }
});

test('PATCH rejects an unknown field', async () => {
  const res = await api(`/api/thefts/${targetId}/quantity`, {
    method: 'PATCH',
    body: JSON.stringify({ quantity_lost: 5, extra: 1 }),
  });
  assert.equal(res.status, 400);
});

test('PATCH on a missing id returns 404', async () => {
  const res = await api('/api/thefts/999999/quantity', {
    method: 'PATCH',
    body: JSON.stringify({ quantity_lost: 5 }),
  });
  assert.equal(res.status, 404);
});

test('subtotal reflects the corrected quantity', async () => {
  await api(`/api/thefts/${targetId}/price`, { method: 'PATCH', body: JSON.stringify({ unit_price: 3 }) });
  const res = await api(`/api/thefts/${targetId}`);
  const row = await res.json();
  assert.equal(Number(row.subtotal), Number(row.quantity_lost) * 3);
  await api(`/api/thefts/${targetId}/price`, { method: 'PATCH', body: JSON.stringify({ unit_price: null }) });
});
