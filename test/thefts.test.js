import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { config } from 'dotenv';
config({ path: new URL('../.env.test', import.meta.url) });
const { app } = await import('../server/index.js');
const { pool } = await import('../server/db.js');

let server, base, cookie;

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
  assert.equal(res.status, 200);
  cookie = res.headers.get('set-cookie').split(';')[0];
});

after(async () => {
  server.close();
  await pool.end();
});

test('GET /api/meta requires auth', async () => {
  const res = await fetch(`${base}/api/meta`);
  assert.equal(res.status, 401);
});

test('GET /api/meta returns projects, sites, item_types', async () => {
  const res = await fetch(`${base}/api/meta`, { headers: { Cookie: cookie } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.projects, ['HTG', 'ATC']);
  assert.ok(Array.isArray(body.sites) && body.sites.length > 0);
  assert.ok(Array.isArray(body.item_types) && body.item_types.length > 0);
});

test('GET /api/thefts requires auth', async () => {
  const res = await fetch(`${base}/api/thefts`);
  assert.equal(res.status, 401);
});

test('GET /api/thefts with no filter: 172 total, 50 rows per page, no raw_post', async () => {
  const res = await fetch(`${base}/api/thefts`, { headers: { Cookie: cookie } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.total, 172);
  assert.equal(body.rows.length, 50);
  assert.ok(!('raw_post' in body.rows[0]));
});

test('GET /api/thefts?all=1 returns every matching row', async () => {
  const res = await fetch(`${base}/api/thefts?all=1`, { headers: { Cookie: cookie } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.rows.length, 172);
});

test('GET /api/thefts rejects an unknown filter key', async () => {
  const res = await fetch(`${base}/api/thefts?bogus=1`, { headers: { Cookie: cookie } });
  assert.equal(res.status, 400);
});

test('GET /api/thefts rejects all combined with page', async () => {
  const res = await fetch(`${base}/api/thefts?all=1&page=2`, { headers: { Cookie: cookie } });
  assert.equal(res.status, 400);
});

test('GET /api/thefts/:id returns raw_post and subtotal, 404 for missing id', async () => {
  const list = await fetch(`${base}/api/thefts?all=1`, { headers: { Cookie: cookie } });
  const { rows } = await list.json();
  const id = rows[0].id;

  const res = await fetch(`${base}/api/thefts/${id}`, { headers: { Cookie: cookie } });
  assert.equal(res.status, 200);
  const row = await res.json();
  assert.ok('raw_post' in row);
  assert.ok('subtotal' in row);

  const missing = await fetch(`${base}/api/thefts/999999`, { headers: { Cookie: cookie } });
  assert.equal(missing.status, 404);
});

test('GET /api/summary requires auth', async () => {
  const res = await fetch(`${base}/api/summary`);
  assert.equal(res.status, 401);
});

test('GET /api/summary with no filter matches acceptance numbers', async () => {
  const res = await fetch(`${base}/api/summary`, { headers: { Cookie: cookie } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.rows, 172);
  assert.equal(body.fuel_lost_l, 22532);
});

test('GET /api/summary grand_total matches SELECT SUM(quantity_ned*unit_price) for a filtered set', async () => {
  const res = await fetch(`${base}/api/summary?project=HTG&item_type=Fuel`, { headers: { Cookie: cookie } });
  assert.equal(res.status, 200);
  const body = await res.json();

  const [[{ expected }]] = await pool.query(
    `SELECT SUM(quantity_ned * unit_price) AS expected FROM thefts WHERE project = 'HTG' AND item_type = 'Fuel'`
  );
  assert.equal(body.grand_total, expected || 0);
});

test('GET /api/summary rejects a pagination key', async () => {
  const res = await fetch(`${base}/api/summary?page=1`, { headers: { Cookie: cookie } });
  assert.equal(res.status, 400);
});
