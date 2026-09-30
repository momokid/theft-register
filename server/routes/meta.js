import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../auth.js';

export const router = Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    // GROUP BY site_id, not DISTINCT: the same site is sometimes recorded with a
    // slightly different name across posts (e.g. "1335" as both "Aboso" and "Tarkwa
    // Aboso"), and DISTINCT on both columns would return one row per spelling.
    const [sites] = await pool.query(
      `SELECT site_id, MIN(site_name) AS site_name FROM thefts
       WHERE site_id IS NOT NULL GROUP BY site_id ORDER BY site_name`
    );
    const [item_types] = await pool.query(
      `SELECT item_type, unit FROM thefts GROUP BY item_type, unit ORDER BY item_type`
    );
    res.json({ projects: ['HTG', 'ATC'], sites, item_types });
  } catch (err) {
    next(err);
  }
});
