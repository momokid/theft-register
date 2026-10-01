import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { config } from 'dotenv';
import ExcelJS from 'exceljs';
import bcrypt from 'bcryptjs';
config({ path: new URL('../.env.test', import.meta.url) });
const { app } = await import('../server/index.js');
const { pool } = await import('../server/db.js');

let server, base, adminCookie, userCookie;

const HEADERS = [
  'PROJECT',
  'DATE',
  'THEFT DATE',
  'SITE ID',
  'SITE NAME',
  'LAST VISIT DATE',
  'ITEM STOLEN',
  'ITEM TYPE',
  'UNIT',
  'LENGTH',
  'RH BEFORE',
  'RH AFTER',
  'DIPSTICK BEFORE (cm)',
  'DIPSTICK AFTER (cm)',
  'PROBE BEFORE (L)',
  'PROBE AFTER (L)',
  'FUEL BEFORE (L)',
  'FUEL AFTER (L)',
  'QUANTITY LOST',
  'QUANTITY (NED)',
  'UNIT COST (GHS)',
  'SUBTOTAL (GHS)',
  'POSTED BY',
  'SOURCE (chat msg)',
  'SOURCE MSG IDS',
  'FLAG',
  'REMARKS',
  'RAW POST',
];

async function buildFixture({ sheetName = 'All (for import)', rows = [], includeTotalsBlock = false } = {}) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.addRow(HEADERS);
  for (const row of rows) sheet.addRow(HEADERS.map((h) => row[h] ?? null));
  if (includeTotalsBlock) {
    sheet.addRow([]); // the separator: a fully empty row
    sheet.addRow(['', '', '', '', '', '', 'TOTAL', '', '', '', '', '', '', '', '', '', '', '', 999]);
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function multipartBody(buffer, filename, boundary) {
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return Buffer.concat([head, buffer, tail]);
}

async function uploadFile(base, path, cookie, buffer, filename = 'import.xlsx') {
  const boundary = '----theftRegisterTestBoundary';
  const body = multipartBody(buffer, filename, boundary);
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      Origin: process.env.APP_ORIGIN,
      Cookie: cookie,
    },
    body,
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
    `INSERT INTO users (name, email, password_hash, is_admin, is_active) VALUES ('Test User', 'test-user@example.com', ?, 0, 1)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
    [hash]
  );
  const userRes = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: process.env.APP_ORIGIN },
    body: JSON.stringify({ email: 'test-user@example.com', password: 'TestPass123' }),
  });
  userCookie = userRes.headers.get('set-cookie').split(';')[0];

  await pool.query(`DELETE FROM thefts WHERE source_msg_ids LIKE 'IMPORT-TEST-%'`);
});

after(async () => {
  await pool.query(`DELETE FROM thefts WHERE source_msg_ids LIKE 'IMPORT-TEST-%'`);
  // test-user is left in place: its login is audited, and audit_log is append-only (FK blocks the delete).
  server.close();
  await pool.end();
});

test('POST /api/import/preview requires auth', async () => {
  const buffer = await buildFixture({ rows: [] });
  const res = await uploadFile(base, '/api/import/preview', '', buffer);
  assert.equal(res.status, 401);
});

test('POST /api/import/preview requires admin', async () => {
  const buffer = await buildFixture({ rows: [] });
  const res = await uploadFile(base, '/api/import/preview', userCookie, buffer);
  assert.equal(res.status, 403);
});

test('rejects a non-.xlsx filename', async () => {
  const buffer = await buildFixture({ rows: [] });
  const res = await uploadFile(base, '/api/import/preview', adminCookie, buffer, 'import.csv');
  assert.equal(res.status, 400);
});

test('rejects a file with the wrong magic bytes', async () => {
  const buffer = Buffer.from('not a real xlsx file');
  const res = await uploadFile(base, '/api/import/preview', adminCookie, buffer, 'import.xlsx');
  assert.equal(res.status, 400);
});

test('rejects a workbook missing the required sheet', async () => {
  const buffer = await buildFixture({ sheetName: 'Sheet1', rows: [] });
  const res = await uploadFile(base, '/api/import/preview', adminCookie, buffer);
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /All \(for import\)/);
});

test('rejects a sheet missing required headers', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('All (for import)');
  sheet.addRow(['PROJECT', 'DATE']); // missing ITEM STOLEN, ITEM TYPE, UNIT, SOURCE MSG IDS
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const res = await uploadFile(base, '/api/import/preview', adminCookie, buffer);
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /ITEM STOLEN/);
});

test('preview classifies new, duplicate, and error rows, and stops at the totals block', async () => {
  const [[existing]] = await pool.query(`SELECT project, source_msg_ids, item_stolen FROM thefts LIMIT 1`);

  const buffer = await buildFixture({
    includeTotalsBlock: true,
    rows: [
      {
        PROJECT: 'HTG',
        DATE: new Date(Date.UTC(2026, 0, 15)),
        'ITEM STOLEN': 'Fuel',
        'ITEM TYPE': 'Fuel',
        UNIT: 'L',
        'QUANTITY LOST': 100,
        'SOURCE MSG IDS': 'IMPORT-TEST-1',
      },
      {
        PROJECT: existing.project,
        DATE: new Date(Date.UTC(2026, 0, 15)),
        'ITEM STOLEN': existing.item_stolen,
        'ITEM TYPE': 'Fuel',
        UNIT: 'L',
        'SOURCE MSG IDS': existing.source_msg_ids,
      },
      {
        PROJECT: 'HTG',
        DATE: '',
        'ITEM STOLEN': 'Cable',
        'ITEM TYPE': 'Earth cable',
        UNIT: 'm',
        'SOURCE MSG IDS': 'IMPORT-TEST-2',
      },
    ],
  });

  const res = await uploadFile(base, '/api/import/preview', adminCookie, buffer);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.counts, { new: 1, duplicate: 1, error: 1 });
  assert.equal(body.rows.length, 3);
  assert.equal(body.rows[0].status, 'new');
  assert.equal(body.rows[1].status, 'duplicate');
  assert.equal(body.rows[2].status, 'error');
  assert.match(body.rows[2].reason, /date/);
});

test('quantity_lost is computed from fuel before/after when blank', async () => {
  const buffer = await buildFixture({
    rows: [
      {
        PROJECT: 'HTG',
        DATE: new Date(Date.UTC(2026, 0, 16)),
        'ITEM STOLEN': 'Fuel',
        'ITEM TYPE': 'Fuel',
        UNIT: 'L',
        'FUEL BEFORE (L)': 500,
        'FUEL AFTER (L)': 300,
        'SOURCE MSG IDS': 'IMPORT-TEST-3',
      },
    ],
  });
  const res = await uploadFile(base, '/api/import/preview', adminCookie, buffer);
  const body = await res.json();
  assert.equal(body.counts.new, 1);
});

test('an uncached formula in QUANTITY LOST falls back to fuel before/after, not an error', async () => {
  // Some tools re-save workbooks without recalculating formulas, so the cell carries
  // {formula: ...} with no cached result. Real-world files hit this on QUANTITY LOST
  // cells like IF(AND(ISNUMBER(before),ISNUMBER(after)),before-after,"").
  const buffer = await buildFixture({
    rows: [
      {
        PROJECT: 'HTG',
        DATE: new Date(Date.UTC(2026, 0, 18)),
        'ITEM STOLEN': 'Fuel',
        'ITEM TYPE': 'Fuel',
        UNIT: 'L',
        'FUEL BEFORE (L)': 500,
        'FUEL AFTER (L)': 300,
        'SOURCE MSG IDS': 'IMPORT-TEST-FORMULA-1',
      },
    ],
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet('All (for import)');
  sheet.getRow(2).getCell(19).value = { formula: 'IF(AND(ISNUMBER(Q2),ISNUMBER(R2)),Q2-R2,"")' };
  const patchedBuffer = Buffer.from(await workbook.xlsx.writeBuffer());

  const res = await uploadFile(base, '/api/import/preview', adminCookie, patchedBuffer);
  const body = await res.json();
  assert.equal(body.counts.error, 0);
  assert.equal(body.counts.new, 1);
  assert.equal(body.rows[0].status, 'new');
});

test('quantity_ned is parsed and persisted independently of quantity_lost', async () => {
  const buffer = await buildFixture({
    rows: [
      {
        PROJECT: 'HTG',
        DATE: new Date(Date.UTC(2026, 0, 17)),
        'ITEM STOLEN': 'Fuel',
        'ITEM TYPE': 'Fuel',
        UNIT: 'L',
        'QUANTITY LOST': 100,
        'QUANTITY (NED)': 85.5,
        'SOURCE MSG IDS': 'IMPORT-TEST-NED-1',
      },
    ],
  });

  const commitRes = await uploadFile(base, '/api/import/commit', adminCookie, buffer);
  assert.equal(commitRes.status, 200);

  const [[row]] = await pool.query(
    `SELECT quantity_lost, quantity_ned FROM thefts WHERE source_msg_ids = 'IMPORT-TEST-NED-1'`
  );
  assert.equal(Number(row.quantity_lost), 100);
  assert.equal(Number(row.quantity_ned), 85.5);
});

test('commit inserts only new rows and is idempotent on re-import', async () => {
  const buffer = await buildFixture({
    rows: [
      {
        PROJECT: 'ATC',
        DATE: new Date(Date.UTC(2026, 0, 20)),
        'ITEM STOLEN': 'Fuel',
        'ITEM TYPE': 'Fuel',
        UNIT: 'L',
        'QUANTITY LOST': 50,
        'SOURCE MSG IDS': 'IMPORT-TEST-4',
      },
    ],
  });

  const first = await uploadFile(base, '/api/import/commit', adminCookie, buffer);
  assert.equal(first.status, 200);
  const firstBody = await first.json();
  assert.equal(firstBody.inserted, 1);
  assert.equal(firstBody.skipped, 0);

  const [[row]] = await pool.query(`SELECT unit_price, price_override, quantity_override FROM thefts WHERE source_msg_ids = 'IMPORT-TEST-4'`);
  assert.equal(row.unit_price, null);
  assert.equal(row.price_override, 0);
  assert.equal(row.quantity_override, 0);

  const [[auditRow]] = await pool.query(`SELECT meta FROM audit_log WHERE action = 'import' ORDER BY id DESC LIMIT 1`);
  const meta = JSON.parse(auditRow.meta);
  assert.equal(meta.inserted, 1);

  const second = await uploadFile(base, '/api/import/commit', adminCookie, buffer);
  const secondBody = await second.json();
  assert.equal(secondBody.inserted, 0);
  assert.equal(secondBody.skipped, 1);
});

test('commit rejects a file with any error row and inserts nothing', async () => {
  const [[{ count: before }]] = await pool.query(`SELECT COUNT(*) AS count FROM thefts`);

  const buffer = await buildFixture({
    rows: [
      {
        PROJECT: 'HTG',
        DATE: new Date(Date.UTC(2026, 0, 21)),
        'ITEM STOLEN': 'Fuel',
        'ITEM TYPE': 'Fuel',
        UNIT: 'L',
        'SOURCE MSG IDS': 'IMPORT-TEST-5',
      },
      {
        PROJECT: 'XYZ', // invalid project -> error row
        DATE: new Date(Date.UTC(2026, 0, 21)),
        'ITEM STOLEN': 'Fuel',
        'ITEM TYPE': 'Fuel',
        UNIT: 'L',
        'SOURCE MSG IDS': 'IMPORT-TEST-6',
      },
    ],
  });

  const res = await uploadFile(base, '/api/import/commit', adminCookie, buffer);
  assert.equal(res.status, 409);

  const [[{ count: after }]] = await pool.query(`SELECT COUNT(*) AS count FROM thefts`);
  assert.equal(after, before);
});

test('upload over 10MB is rejected with 413', async () => {
  const huge = Buffer.alloc(11 * 1024 * 1024, 0x50);
  const res = await uploadFile(base, '/api/import/preview', adminCookie, huge, 'huge.xlsx');
  assert.equal(res.status, 413);
});
