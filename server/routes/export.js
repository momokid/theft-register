import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../auth.js';
import { audit } from '../audit.js';
import { buildTheftFilter, buildOrderBy, FILTER_KEYS } from '../filters.js';
import { requireOnlyKeys, ValidationError } from '../validate.js';
import { buildExportWorkbook, exportFileName } from '../services/exportXlsx.js';

export const router = Router();

const EXPORT_CAP = 5000;

router.get('/', requireAuth, async (req, res, next) => {
  try {
    requireOnlyKeys(req.query, [...FILTER_KEYS, 'sort']);
    const { where, params } = buildTheftFilter(req.query);
    const orderBy = buildOrderBy(req.query.sort);

    const [rows] = await pool.query(
      `SELECT *, (quantity_ned * unit_price) AS subtotal FROM thefts ${where}
       ORDER BY ${orderBy} LIMIT ${EXPORT_CAP}`,
      params
    );

    const [[stats]] = await pool.query(
      `SELECT
        SUM(CASE WHEN item_type = 'Fuel' THEN quantity_lost ELSE 0 END) AS fuel_lost_l,
        SUM(quantity_ned * unit_price) AS grand_total
       FROM thefts ${where}`,
      params
    );

    const generatedAt = new Date();
    const workbook = buildExportWorkbook({
      rows,
      filters: req.query,
      generatedBy: req.user.name,
      generatedAt,
      fuelLostL: stats.fuel_lost_l || 0,
      grandTotal: stats.grand_total || 0,
    });

    await audit(pool, {
      userId: req.user.id,
      action: 'export',
      entity: 'theft',
      meta: { filters: req.query, row_count: rows.length },
      ip: req.ip,
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${exportFileName(generatedAt)}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
    next(err);
  }
});
