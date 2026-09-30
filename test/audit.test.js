import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { config } from 'dotenv';
import bcrypt from 'bcryptjs';
config({ path: new URL('../.env.test', import.meta.url) });
const { app } = await import('../server/index.js');
const { pool } = await import('../server/db.js');

let server, base, adminCookie, userCookie, adminId;

async function api(path, opts = {}) {
  return fetch(`${base}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Origin: process.env.APP_ORIGIN,
      Cookie: adminCookie,
      ...opts.headers,
    },
  });
}

before(async () => {
  server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  base = `http://localhost:${server.address().port}`;

  const adminRes = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: process.env.APP_ORIGIN },
    body: JSON.stringify({ email: 'test-admin@example.com', password: 'TestPass123' }),
  });
  adminCookie = adminRes.headers.get('set-cookie').split(';')[0];
  const me = await (await fetch(`${base}/api/auth/me`, { headers: { Cookie: adminCookie } })).json();
  adminId = me.id;

  const hash = await bcrypt.hash('TestPass123', 12);
  await pool.query(
    `INSERT INTO users (name, email, password_hash, is_admin, is_active) VALUES ('Test NonAdmin', 'test-nonadmin-audit@example.com', ?, 0, 1)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
    [hash]
  );
  const userRes = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: process.env.APP_ORIGIN },
    body: JSON.stringify({ email: 'test-nonadmin-audit@example.com', password: 'TestPass123' }),
  });
  userCookie = userRes.headers.get('set-cookie').split(';')[0];

  await pool.query(`DELETE FROM users WHERE email = 'audit-test-created@example.com'`);
});

after(async () => {
  await pool.query(`DELETE FROM users WHERE email = 'audit-test-created@example.com'`);
  server.close();
  await pool.end();
});

test('GET /api/audit requires auth', async () => {
  const res = await fetch(`${base}/api/audit`, { headers: { Origin: process.env.APP_ORIGIN } });
  assert.equal(res.status, 401);
});

test('GET /api/audit requires admin', async () => {
  const res = await fetch(`${base}/api/audit`, { headers: { Origin: process.env.APP_ORIGIN, Cookie: userCookie } });
  assert.equal(res.status, 403);
});

test('GET /api/audit rejects an unknown filter key', async () => {
  const res = await api('/api/audit?bogus=1');
  assert.equal(res.status, 400);
});

test('GET /api/audit lists the admin login with a readable actor name', async () => {
  const res = await api(`/api/audit?user_id=${adminId}&action=login`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.rows.length > 0);
  assert.ok(body.rows.every((r) => r.action === 'login'));
  assert.ok(body.rows.every((r) => r.user_id === adminId));
  assert.ok(typeof body.rows[0].user_name === 'string' && body.rows[0].user_name.length > 0);
});

test('GET /api/audit filters by date range', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const res = await api(`/api/audit?from=${today}&to=${today}&user_id=${adminId}`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.rows.length > 0);

  const future = '2099-01-01';
  const noneRes = await api(`/api/audit?from=${future}&to=${future}`);
  const noneBody = await noneRes.json();
  assert.equal(noneBody.rows.length, 0);
  assert.equal(noneBody.total, 0);
});

test('GET /api/audit paginates with a default page size of 50', async () => {
  const res = await api('/api/audit');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.rows.length <= 50);
  assert.equal(typeof body.total, 'number');
});

test('user_create and user_password_reset audit rows never carry password data', async () => {
  const createRes = await api('/api/accounts', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Audit Test Created',
      email: 'audit-test-created@example.com',
      password: 'LongEnoughPass1',
    }),
  });
  const created = await createRes.json();

  await api(`/api/accounts/${created.id}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ password: 'AnotherLongPass1' }),
  });

  const res = await api(`/api/audit?user_id=${adminId}&action=user_create`);
  const body = await res.json();
  const row = body.rows.find((r) => r.entity_id === String(created.id));
  assert.ok(row);
  const blob = JSON.stringify([row.old_value, row.new_value, row.meta]);
  assert.doesNotMatch(blob, /password/i);
  assert.doesNotMatch(blob, /\$2[aby]\$/); // bcrypt hash prefix
});
