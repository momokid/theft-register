import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../auth.js';
import { buildTheftFilter, buildOrderBy, FILTER_KEYS } from '../filters.js';
import { requireOnlyKeys, parsePagination, ValidationError } from '../validate.js';

// Subtotal is keyed off quantity_ned (not quantity_lost) per the 2026-10-01 decision —
// see REFERENCE.md §5. NULL quantity_ned yields a NULL subtotal.
const LIST_COLUMNS = `id, project, post_date, theft_date, site_id, site_name, item_stolen, item_type, unit,
  quantity_lost, quantity_override, quantity_ned, quantity_ned_override, unit_price, price_override, flags,
  (quantity_ned * unit_price) AS subtotal`;

export const router = Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    requireOnlyKeys(req.query, [...FILTER_KEYS, 'page', 'pageSize', 'all', 'sort']);
    const { where, params } = buildTheftFilter(req.query);
    const { limit, offset } = parsePagination(req.query);
    const orderBy = buildOrderBy(req.query.sort);

    const [rows] = await pool.query(
      `SELECT ${LIST_COLUMNS} FROM thefts ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM thefts ${where}`, params);

    res.json({ rows, total });
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
    next(err);
  }
});

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid id' });

    const [rows] = await pool.query(
      `SELECT *, (quantity_ned * unit_price) AS subtotal FROM thefts WHERE id = ?`,
      [id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

export const summaryRouter = Router();

summaryRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    requireOnlyKeys(req.query, FILTER_KEYS);
    const { where, params } = buildTheftFilter(req.query);

    const [[stats]] = await pool.query(
      `SELECT
        COUNT(*) AS row_count,
        SUM(CASE WHEN item_type = 'Fuel' THEN quantity_lost ELSE 0 END) AS fuel_lost_l,
        SUM(CASE WHEN flags IS NOT NULL AND flags <> '' THEN 1 ELSE 0 END) AS flagged,
        SUM(CASE WHEN quantity_lost IS NOT NULL AND unit_price IS NULL THEN 1 ELSE 0 END) AS unpriced,
        SUM(quantity_ned * unit_price) AS grand_total
       FROM thefts ${where}`,
      params
    );

    const [by_month] = await pool.query(
      `SELECT DATE_FORMAT(post_date, '%Y-%m') AS month,
        SUM(CASE WHEN unit = 'L' THEN quantity_ned * unit_price ELSE 0 END) AS fuel,
        SUM(CASE WHEN unit = 'm' THEN quantity_ned * unit_price ELSE 0 END) AS cable,
        SUM(CASE WHEN unit NOT IN ('L', 'm') THEN quantity_ned * unit_price ELSE 0 END) AS equipment
       FROM thefts ${where}
       GROUP BY month
       ORDER BY month`,
      params
    );

    res.json({
      rows: stats.row_count,
      fuel_lost_l: stats.fuel_lost_l || 0,
      flagged: stats.flagged || 0,
      unpriced: stats.unpriced || 0,
      grand_total: stats.grand_total || 0,
      by_month,
    });
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
    next(err);
  }
});
