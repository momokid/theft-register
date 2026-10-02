import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';
import { buildAuditFilter, AUDIT_FILTER_KEYS } from '../filters.js';
import { requireOnlyKeys, parsePagination, ValidationError } from '../validate.js';

export const router = Router();

// mysql2 returns a JSON column as a string on some server versions (MariaDB < 10.5,
// confirmed locally) and as an already-decoded object on others (CI's mariadb:10.11) —
// never assume one or the other.
function parseJsonColumn(v) {
  if (v === null || v === undefined) return null;
  return typeof v === 'string' ? JSON.parse(v) : v;
}

router.get('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    requireOnlyKeys(req.query, [...AUDIT_FILTER_KEYS, 'page', 'pageSize']);
    const { where, params } = buildAuditFilter(req.query);
    const { limit, offset } = parsePagination(req.query);

    const [rows] = await pool.query(
      `SELECT a.id, a.created_at, a.user_id, u.name AS user_name, u.email AS user_email,
        a.action, a.entity, a.entity_id, a.old_value, a.new_value, a.meta, a.ip
       FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
       ${where} ORDER BY a.id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM audit_log a ${where}`, params);

    for (const row of rows) {
      row.old_value = parseJsonColumn(row.old_value);
      row.new_value = parseJsonColumn(row.new_value);
      row.meta = parseJsonColumn(row.meta);
    }

    res.json({ rows, total });
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
    next(err);
  }
});
