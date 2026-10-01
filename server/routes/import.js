import { Router } from 'express';
import multer from 'multer';
import { pool, tx } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';
import { audit } from '../audit.js';
import { parseImportFile, ImportParseError } from '../services/importXlsx.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

export const router = Router();

const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

const INSERT_COLUMNS = [
  'project',
  'post_date',
  'theft_date',
  'site_id',
  'site_name',
  'last_visit_date',
  'item_stolen',
  'item_type',
  'unit',
  'length',
  'rh_before',
  'rh_after',
  'dipstick_before_cm',
  'dipstick_after_cm',
  'probe_before_l',
  'probe_after_l',
  'fuel_before_l',
  'fuel_after_l',
  'quantity_lost',
  'quantity_ned',
  'posted_by',
  'source_time',
  'source_msg_ids',
  'flags',
  'remarks',
  'raw_post',
];

function checkUpload(req, res) {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return false;
  }
  if (!req.file.originalname.toLowerCase().endsWith('.xlsx')) {
    res.status(400).json({ error: 'File must be a .xlsx file' });
    return false;
  }
  if (!req.file.buffer.subarray(0, 4).equals(ZIP_MAGIC)) {
    res.status(400).json({ error: 'File does not look like a valid .xlsx file' });
    return false;
  }
  return true;
}

async function getExistingKeys() {
  const [rows] = await pool.query('SELECT project, source_msg_ids, item_stolen FROM thefts');
  return new Set(rows.map((r) => `${r.project}|${r.source_msg_ids}|${r.item_stolen}`));
}

async function parseUpload(req, res) {
  const existingKeys = await getExistingKeys();
  try {
    return await parseImportFile(req.file.buffer, existingKeys);
  } catch (err) {
    if (err instanceof ImportParseError) {
      res.status(400).json({ error: err.message });
      return null;
    }
    throw err;
  }
}

router.post('/preview', requireAuth, requireAdmin, upload.single('file'), async (req, res, next) => {
  try {
    if (!checkUpload(req, res)) return;
    const results = await parseUpload(req, res);
    if (!results) return;

    const counts = { new: 0, duplicate: 0, error: 0 };
    for (const r of results) counts[r.status]++;

    res.json({
      counts,
      rows: results.slice(0, 200).map((r) => ({ row: r.row, status: r.status, reason: r.reason })),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/commit', requireAuth, requireAdmin, upload.single('file'), async (req, res, next) => {
  try {
    if (!checkUpload(req, res)) return;
    const results = await parseUpload(req, res);
    if (!results) return;

    if (results.some((r) => r.status === 'error')) {
      return res.status(409).json({ error: 'File has rows with errors; fix them and retry.' });
    }

    const newRows = results.filter((r) => r.status === 'new').map((r) => r.values);
    const skipped = results.length - newRows.length;

    await tx(async (conn) => {
      for (let i = 0; i < newRows.length; i += 100) {
        const batch = newRows.slice(i, i + 100).map((r) => INSERT_COLUMNS.map((c) => r[c] ?? null));
        if (batch.length) {
          await conn.query(`INSERT INTO thefts (${INSERT_COLUMNS.join(', ')}) VALUES ?`, [batch]);
        }
      }

      await audit(conn, {
        userId: req.user.id,
        action: 'import',
        entity: 'theft',
        meta: { file_name: req.file.originalname, inserted: newRows.length, skipped },
        ip: req.ip,
      });
    });

    res.json({ inserted: newRows.length, skipped });
  } catch (err) {
    next(err);
  }
});
