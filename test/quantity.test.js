import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { config } from 'dotenv';
import bcrypt from 'bcryptjs';
import { parseJsonColumn } from './helpers.js';
config({ path: new URL('../.env.test', import.meta.url) });
const { app } = await import('../server/index.js');
const { pool } = await import('../server/db.js');

let server, base, cookie, userCookie, targetId, original;

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

  const hash = await bcrypt.hash('TestPass123', 12);
  await pool.query(
    `INSERT INTO users (name, email, password_hash, is_admin, is_active) VALUES ('Test NonAdmin', 'test-nonadmin-quantity@example.com', ?, 0, 1)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
    [hash]
  );
  const userRes = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: process.env.APP_ORIGIN },
    body: JSON.stringify({ email: 'test-nonadmin-quantity@example.com', password: 'TestPass123' }),
  });
  userCookie = userRes.headers.get('set-cookie').split(';')[0];

  // Non-Fuel row: editing its quantities must not disturb the fuel_lost_l acceptance check elsewhere.
  const [[row]] = await pool.query(
    `SELECT id, quantity_lost, quantity_override, quantity_ned, quantity_ned_override
     FROM thefts WHERE item_type != 'Fuel' AND quantity_lost IS NOT NULL LIMIT 1`
  );
  targetId = row.id;
  original = row;
});

after(async () => {
  await pool.query(
    'UPDATE thefts SET quantity_lost = ?, quantity_override = ?, quantity_ned = ?, quantity_ned_override = ? WHERE id = ?',
    [original.quantity_lost, original.quantity_override, original.quantity_ned, original.quantity_ned_override, targetId]
  );
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

test('PATCH /api/thefts/:id/quantity requires admin', async () => {
  const res = await fetch(`${base}/api/thefts/${targetId}/quantity`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Origin: process.env.APP_ORIGIN, Cookie: userCookie },
    body: JSON.stringify({ quantity_lost: 5 }),
  });
  assert.equal(res.status, 403);
});

test('PATCH corrects the quantity and marks it overridden', async () => {
  const newQty = Number(original.quantity_lost) + 1;
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
  assert.equal(Number(parseJsonColumn(auditRow.new_value).quantity_lost), newQty);
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

test('PATCH /api/thefts/:id/quantity_ned requires auth', async () => {
  const res = await fetch(`${base}/api/thefts/${targetId}/quantity_ned`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Origin: process.env.APP_ORIGIN },
    body: JSON.stringify({ quantity_ned: 5 }),
  });
  assert.equal(res.status, 401);
});

test('PATCH /api/thefts/:id/quantity_ned requires admin', async () => {
  const res = await fetch(`${base}/api/thefts/${targetId}/quantity_ned`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Origin: process.env.APP_ORIGIN, Cookie: userCookie },
    body: JSON.stringify({ quantity_ned: 5 }),
  });
  assert.equal(res.status, 403);
});

test('PATCH corrects quantity_ned and marks it overridden, independently of quantity_lost', async () => {
  const res = await api(`/api/thefts/${targetId}/quantity_ned`, {
    method: 'PATCH',
    body: JSON.stringify({ quantity_ned: 42 }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(Number(body.quantity_ned), 42);
  assert.equal(body.quantity_ned_override, 1);
  assert.equal(Number(body.quantity_lost), Number(original.quantity_lost) + 1); // untouched by the earlier quantity_lost edit

  const [[row]] = await pool.query('SELECT quantity_ned, quantity_ned_override FROM thefts WHERE id = ?', [targetId]);
  assert.equal(Number(row.quantity_ned), 42);
  assert.equal(row.quantity_ned_override, 1);

  const [[auditRow]] = await pool.query(
    `SELECT action, new_value FROM audit_log WHERE entity = 'theft' AND entity_id = ? ORDER BY id DESC LIMIT 1`,
    [String(targetId)]
  );
  assert.equal(auditRow.action, 'quantity_ned_override');
  assert.equal(Number(parseJsonColumn(auditRow.new_value).quantity_ned), 42);
});

test('PATCH /quantity_ned rejects invalid quantities', async () => {
  for (const quantity_ned of [-1, 1.005, 'abc', true]) {
    const res = await api(`/api/thefts/${targetId}/quantity_ned`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity_ned }),
    });
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(quantity_ned)}`);
  }
});

test('PATCH /quantity_ned rejects an unknown field', async () => {
  const res = await api(`/api/thefts/${targetId}/quantity_ned`, {
    method: 'PATCH',
    body: JSON.stringify({ quantity_ned: 5, extra: 1 }),
  });
  assert.equal(res.status, 400);
});

test('PATCH /quantity_ned on a missing id returns 404', async () => {
  const res = await api('/api/thefts/999999/quantity_ned', {
    method: 'PATCH',
    body: JSON.stringify({ quantity_ned: 5 }),
  });
  assert.equal(res.status, 404);
});

test('subtotal is keyed off quantity_ned, not quantity_lost', async () => {
  await api(`/api/thefts/${targetId}/quantity_ned`, { method: 'PATCH', body: JSON.stringify({ quantity_ned: 10 }) });
  await api(`/api/thefts/${targetId}/price`, { method: 'PATCH', body: JSON.stringify({ unit_price: 3 }) });

  const res = await api(`/api/thefts/${targetId}`);
  const row = await res.json();
  assert.equal(Number(row.subtotal), 30); // quantity_ned (10) * price (3), regardless of quantity_lost

  // Changing quantity_lost must not move the subtotal.
  await api(`/api/thefts/${targetId}/quantity`, { method: 'PATCH', body: JSON.stringify({ quantity_lost: 999 }) });
  const res2 = await api(`/api/thefts/${targetId}`);
  const row2 = await res2.json();
  assert.equal(Number(row2.subtotal), 30);

  await api(`/api/thefts/${targetId}/price`, { method: 'PATCH', body: JSON.stringify({ unit_price: null }) });
});
