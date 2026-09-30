import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { config } from 'dotenv';
import bcrypt from 'bcryptjs';
config({ path: new URL('../.env.test', import.meta.url) });
const { app } = await import('../server/index.js');
const { pool } = await import('../server/db.js');

let server, base, adminCookie, userCookie;

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

  const hash = await bcrypt.hash('TestPass123', 12);
  await pool.query(
    `INSERT INTO users (name, email, password_hash, is_admin, is_active) VALUES ('Test NonAdmin', 'test-nonadmin-accounts@example.com', ?, 0, 1)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
    [hash]
  );
  const userRes = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: process.env.APP_ORIGIN },
    body: JSON.stringify({ email: 'test-nonadmin-accounts@example.com', password: 'TestPass123' }),
  });
  userCookie = userRes.headers.get('set-cookie').split(';')[0];

  await pool.query(`DELETE FROM users WHERE email LIKE 'accounts-test-%@example.com'`);
});

after(async () => {
  await pool.query(`DELETE FROM users WHERE email LIKE 'accounts-test-%@example.com'`);
  server.close();
  await pool.end();
});

test('GET /api/accounts requires auth', async () => {
  const res = await fetch(`${base}/api/accounts`, { headers: { Origin: process.env.APP_ORIGIN } });
  assert.equal(res.status, 401);
});

test('GET /api/accounts requires admin', async () => {
  const res = await fetch(`${base}/api/accounts`, {
    headers: { Origin: process.env.APP_ORIGIN, Cookie: userCookie },
  });
  assert.equal(res.status, 403);
});

test('GET /api/accounts never exposes password_hash', async () => {
  const res = await api('/api/accounts');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.rows.length > 0);
  for (const row of body.rows) assert.equal('password_hash' in row, false);
});

test('POST /api/accounts creates a user and audits user_create with no password', async () => {
  const res = await api('/api/accounts', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Accounts Test One',
      email: 'accounts-test-1@example.com',
      password: 'LongEnoughPass1',
      is_admin: false,
    }),
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.email, 'accounts-test-1@example.com');
  assert.equal('password_hash' in body, false);

  const [[auditRow]] = await pool.query(
    `SELECT new_value FROM audit_log WHERE action = 'user_create' AND entity_id = ? ORDER BY id DESC LIMIT 1`,
    [String(body.id)]
  );
  const newValue = JSON.parse(auditRow.new_value);
  assert.equal(newValue.email, 'accounts-test-1@example.com');
  assert.equal('password' in newValue, false);
  assert.equal('password_hash' in newValue, false);
});

test('POST /api/accounts rejects a duplicate email with 409', async () => {
  const res = await api('/api/accounts', {
    method: 'POST',
    body: JSON.stringify({ name: 'Dup', email: 'accounts-test-1@example.com', password: 'LongEnoughPass1' }),
  });
  assert.equal(res.status, 409);
});

test('POST /api/accounts rejects a short password', async () => {
  const res = await api('/api/accounts', {
    method: 'POST',
    body: JSON.stringify({ name: 'X', email: 'accounts-test-2@example.com', password: 'short' }),
  });
  assert.equal(res.status, 400);
});

test('POST /api/accounts rejects an unknown field', async () => {
  const res = await api('/api/accounts', {
    method: 'POST',
    body: JSON.stringify({
      name: 'X',
      email: 'accounts-test-3@example.com',
      password: 'LongEnoughPass1',
      extra: 1,
    }),
  });
  assert.equal(res.status, 400);
});

test('PATCH /api/accounts/:id updates only the changed fields and audits them', async () => {
  const [[{ id }]] = await pool.query(`SELECT id FROM users WHERE email = 'accounts-test-1@example.com'`);
  const res = await api(`/api/accounts/${id}`, { method: 'PATCH', body: JSON.stringify({ name: 'Renamed' }) });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.name, 'Renamed');
  assert.equal(body.email, 'accounts-test-1@example.com');

  const [[auditRow]] = await pool.query(
    `SELECT old_value, new_value FROM audit_log WHERE action = 'user_update' AND entity_id = ? ORDER BY id DESC LIMIT 1`,
    [String(id)]
  );
  const oldValue = JSON.parse(auditRow.old_value);
  const newValue = JSON.parse(auditRow.new_value);
  assert.deepEqual(Object.keys(newValue), ['name']);
  assert.equal(oldValue.name, 'Accounts Test One');
  assert.equal(newValue.name, 'Renamed');
});

test('PATCH /api/accounts/:id rejects a duplicate email with 409', async () => {
  await api('/api/accounts', {
    method: 'POST',
    body: JSON.stringify({ name: 'Y', email: 'accounts-test-4@example.com', password: 'LongEnoughPass1' }),
  });
  const [[{ id }]] = await pool.query(`SELECT id FROM users WHERE email = 'accounts-test-1@example.com'`);
  const res = await api(`/api/accounts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ email: 'accounts-test-4@example.com' }),
  });
  assert.equal(res.status, 409);
});

test('PATCH /api/accounts/:id blocks an admin changing their own is_admin or is_active', async () => {
  const meRes = await api('/api/auth/me');
  const me = await meRes.json();

  const res1 = await api(`/api/accounts/${me.id}`, { method: 'PATCH', body: JSON.stringify({ is_admin: false }) });
  assert.equal(res1.status, 409);

  const res2 = await api(`/api/accounts/${me.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: false }) });
  assert.equal(res2.status, 409);
});

test('PATCH /api/accounts/:id allows deactivating another admin while others remain active', async () => {
  const createRes = await api('/api/accounts', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Spare Admin',
      email: 'accounts-test-5@example.com',
      password: 'LongEnoughPass1',
      is_admin: true,
    }),
  });
  const { id } = await createRes.json();

  const res = await api(`/api/accounts/${id}`, { method: 'PATCH', body: JSON.stringify({ is_active: false }) });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.is_active, 0);
});

test('PATCH /api/accounts/:id on a missing id returns 404', async () => {
  const res = await api('/api/accounts/999999', { method: 'PATCH', body: JSON.stringify({ name: 'X' }) });
  assert.equal(res.status, 404);
});

test('POST /api/accounts/:id/reset-password sets a new hash and audits with no password data', async () => {
  const [[{ id }]] = await pool.query(`SELECT id FROM users WHERE email = 'accounts-test-1@example.com'`);
  const res = await api(`/api/accounts/${id}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ password: 'BrandNewPassword1' }),
  });
  assert.equal(res.status, 204);

  const [[row]] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [id]);
  const ok = await bcrypt.compare('BrandNewPassword1', row.password_hash);
  assert.ok(ok);

  const [[auditRow]] = await pool.query(
    `SELECT meta, new_value FROM audit_log WHERE action = 'user_password_reset' AND entity_id = ? ORDER BY id DESC LIMIT 1`,
    [String(id)]
  );
  assert.equal(auditRow.meta, null);
  assert.equal(auditRow.new_value, null);
});

test('POST /api/accounts/:id/reset-password rejects a short password', async () => {
  const [[{ id }]] = await pool.query(`SELECT id FROM users WHERE email = 'accounts-test-1@example.com'`);
  const res = await api(`/api/accounts/${id}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ password: 'short' }),
  });
  assert.equal(res.status, 400);
});

test('POST /api/accounts/:id/reset-password on a missing id returns 404', async () => {
  const res = await api('/api/accounts/999999/reset-password', {
    method: 'POST',
    body: JSON.stringify({ password: 'LongEnoughPass1' }),
  });
  assert.equal(res.status, 404);
});
