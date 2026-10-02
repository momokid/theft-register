// mysql2 returns a JSON column as a string on some server versions (local MariaDB
// 10.4) and as an already-decoded object on others (CI's mariadb:10.11) — tests that
// read audit_log directly must handle both, same as server/routes/audit.js.
export function parseJsonColumn(v) {
  if (v === null || v === undefined) return null;
  return typeof v === 'string' ? JSON.parse(v) : v;
}
