import { Router } from 'express';
import { tx } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';
import { audit } from '../audit.js';
import {
  ValidationError,
  validatePriceBody,
  validatePriceApply,
  validateQuantityBody,
  validateQuantityNedBody,
} from '../validate.js';

// Subtotal is keyed off quantity_ned (not quantity_lost) per the 2026-10-01 decision —
// see REFERENCE.md §5. NULL quantity_ned yields a NULL subtotal, same as any other
// missing-value case.
const UPDATED_ROW_SQL = `SELECT id, project, post_date, theft_date, site_id, site_name, item_stolen, item_type, unit,
  quantity_lost, quantity_override, quantity_ned, quantity_ned_override, unit_price, price_override, flags,
  (quantity_ned * unit_price) AS subtotal
 FROM thefts WHERE id = ?`;

// Mounted at /api/thefts, alongside the read routes in thefts.js.
export const priceRouter = Router();

priceRouter.patch('/:id/price', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid id' });
    const unitPrice = validatePriceBody(req.body);

    const result = await tx(async (conn) => {
      const [rows] = await conn.query(
        'SELECT unit_price, price_override FROM thefts WHERE id = ? FOR UPDATE',
        [id]
      );
      const before = rows[0];
      if (!before) return null;

      const oldValue = { unit_price: before.unit_price, price_override: !!before.price_override };

      if (unitPrice === null) {
        await conn.query('UPDATE thefts SET unit_price = NULL, price_override = 0 WHERE id = ?', [id]);
        await audit(conn, {
          userId: req.user.id,
          action: 'price_clear',
          entity: 'theft',
          entityId: String(id),
          oldValue,
          newValue: { unit_price: null, price_override: false },
          ip: req.ip,
        });
      } else {
        await conn.query('UPDATE thefts SET unit_price = ?, price_override = 1 WHERE id = ?', [unitPrice, id]);
        await audit(conn, {
          userId: req.user.id,
          action: 'price_override',
          entity: 'theft',
          entityId: String(id),
          oldValue,
          newValue: { unit_price: unitPrice, price_override: true },
          ip: req.ip,
        });
      }

      const [[updated]] = await conn.query(UPDATED_ROW_SQL, [id]);
      return updated;
    });

    if (!result) return res.status(404).json({ error: 'Not found' });
    res.json(result);
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
    next(err);
  }
});

// Direct correction of an extracted quantity_lost value (e.g. a misread digit). Unlike price,
// there's no "unpriced" equivalent state for quantity, so this only ever sets a value, and the
// override flag is a permanent audit marker rather than something a user clears back to null.
priceRouter.patch('/:id/quantity', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid id' });
    const quantityLost = validateQuantityBody(req.body);

    const result = await tx(async (conn) => {
      const [rows] = await conn.query(
        'SELECT quantity_lost, quantity_override FROM thefts WHERE id = ? FOR UPDATE',
        [id]
      );
      const before = rows[0];
      if (!before) return null;

      await conn.query('UPDATE thefts SET quantity_lost = ?, quantity_override = 1 WHERE id = ?', [
        quantityLost,
        id,
      ]);
      await audit(conn, {
        userId: req.user.id,
        action: 'quantity_override',
        entity: 'theft',
        entityId: String(id),
        oldValue: { quantity_lost: before.quantity_lost, quantity_override: !!before.quantity_override },
        newValue: { quantity_lost: quantityLost, quantity_override: true },
        ip: req.ip,
      });

      const [[updated]] = await conn.query(UPDATED_ROW_SQL, [id]);
      return updated;
    });

    if (!result) return res.status(404).json({ error: 'Not found' });
    res.json(result);
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
    next(err);
  }
});

// Mirrors the quantity_lost route above. A separate override flag keeps each
// quantity's "edited" badge independent in the UI.
priceRouter.patch('/:id/quantity_ned', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid id' });
    const quantityNed = validateQuantityNedBody(req.body);

    const result = await tx(async (conn) => {
      const [rows] = await conn.query(
        'SELECT quantity_ned, quantity_ned_override FROM thefts WHERE id = ? FOR UPDATE',
        [id]
      );
      const before = rows[0];
      if (!before) return null;

      await conn.query('UPDATE thefts SET quantity_ned = ?, quantity_ned_override = 1 WHERE id = ?', [
        quantityNed,
        id,
      ]);
      await audit(conn, {
        userId: req.user.id,
        action: 'quantity_ned_override',
        entity: 'theft',
        entityId: String(id),
        oldValue: { quantity_ned: before.quantity_ned, quantity_ned_override: !!before.quantity_ned_override },
        newValue: { quantity_ned: quantityNed, quantity_ned_override: true },
        ip: req.ip,
      });

      const [[updated]] = await conn.query(UPDATED_ROW_SQL, [id]);
      return updated;
    });

    if (!result) return res.status(404).json({ error: 'Not found' });
    res.json(result);
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
    next(err);
  }
});

// Mounted at /api/prices.
export const applyRouter = Router();

applyRouter.post('/apply', requireAuth, async (req, res, next) => {
  try {
    const { item_type, from, to, project, unit_price } = validatePriceApply(req.body);

    const result = await tx(async (conn) => {
      const params = [item_type, from, to];
      let projectClause = '';
      if (project) {
        projectClause = ' AND project = ?';
        params.push(project);
      }

      const [affected] = await conn.query(
        `SELECT id, unit_price FROM thefts
         WHERE item_type = ? AND post_date BETWEEN ? AND ?${projectClause} AND price_override = 0
         FOR UPDATE`,
        params
      );

      const [[{ skipped_overrides }]] = await conn.query(
        `SELECT COUNT(*) AS skipped_overrides FROM thefts
         WHERE item_type = ? AND post_date BETWEEN ? AND ?${projectClause} AND price_override = 1`,
        params
      );

      if (affected.length) {
        await conn.query(
          `UPDATE thefts SET unit_price = ?
           WHERE item_type = ? AND post_date BETWEEN ? AND ?${projectClause} AND price_override = 0`,
          [unit_price, ...params]
        );
      }

      await audit(conn, {
        userId: req.user.id,
        action: 'price_apply',
        entity: 'theft',
        meta: { item_type, from, to, project: project || null, unit_price },
        oldValue: affected.map((r) => ({ id: r.id, unit_price: r.unit_price })),
        newValue: { unit_price },
        ip: req.ip,
      });

      return { updated: affected.length, skipped_overrides };
    });

    res.json(result);
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
    next(err);
  }
});
