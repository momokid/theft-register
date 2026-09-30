import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool, tx } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';
import { audit } from '../audit.js';
import { ValidationError, ConflictError, validateUserCreate, validateUserUpdate, validatePasswordReset } from '../validate.js';

export const router = Router();
router.use(requireAuth, requireAdmin);

const USER_COLUMNS = 'id, name, email, is_admin, is_active, created_at';

router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.query(`SELECT ${USER_COLUMNS} FROM users ORDER BY name`);
    res.json({ rows });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, email, password, is_admin } = validateUserCreate(req.body);
    const passwordHash = await bcrypt.hash(password, 12);

    const userId = await tx(async (conn) => {
      let result;
      try {
        [result] = await conn.query(
          'INSERT INTO users (name, email, password_hash, is_admin, is_active) VALUES (?, ?, ?, ?, 1)',
          [name, email, passwordHash, is_admin ? 1 : 0]
        );
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') throw new ConflictError('A user with that email already exists');
        throw err;
      }

      await audit(conn, {
        userId: req.user.id,
        action: 'user_create',
        entity: 'user',
        entityId: String(result.insertId),
        newValue: { name, email, is_admin },
        ip: req.ip,
      });

      return result.insertId;
    });

    const [[created]] = await pool.query(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, [userId]);
    res.status(201).json(created);
  } catch (err) {
    if (err instanceof ConflictError) return res.status(409).json({ error: err.message });
    if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid id' });
    const changes = validateUserUpdate(req.body);

    if (id === req.user.id && ('is_admin' in changes || 'is_active' in changes)) {
      return res.status(409).json({ error: 'You cannot change your own admin or active status' });
    }

    const result = await tx(async (conn) => {
      const [rows] = await conn.query(
        'SELECT id, name, email, is_admin, is_active FROM users WHERE id = ? FOR UPDATE',
        [id]
      );
      const before = rows[0];
      if (!before) return null;

      // Only block the change if it would actually drop the active-admin count to zero.
      const wasActiveAdmin = !!before.is_admin && !!before.is_active;
      const willBeActiveAdmin =
        ('is_admin' in changes ? changes.is_admin : !!before.is_admin) &&
        ('is_active' in changes ? changes.is_active : !!before.is_active);

      if (wasActiveAdmin && !willBeActiveAdmin) {
        const [[{ activeAdmins }]] = await conn.query(
          'SELECT COUNT(*) AS activeAdmins FROM users WHERE is_admin = 1 AND is_active = 1 AND id <> ?',
          [id]
        );
        if (activeAdmins === 0) throw new ConflictError('At least one active admin must remain');
      }

      const fields = Object.keys(changes);
      const assignments = fields.map((f) => `${f} = ?`).join(', ');
      const values = fields.map((f) => (typeof changes[f] === 'boolean' ? (changes[f] ? 1 : 0) : changes[f]));

      try {
        await conn.query(`UPDATE users SET ${assignments} WHERE id = ?`, [...values, id]);
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') throw new ConflictError('A user with that email already exists');
        throw err;
      }

      const oldValue = {};
      const newValue = {};
      for (const f of fields) {
        oldValue[f] = ['is_admin', 'is_active'].includes(f) ? !!before[f] : before[f];
        newValue[f] = changes[f];
      }

      await audit(conn, {
        userId: req.user.id,
        action: 'user_update',
        entity: 'user',
        entityId: String(id),
        oldValue,
        newValue,
        ip: req.ip,
      });

      const [[updated]] = await conn.query(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, [id]);
      return updated;
    });

    if (!result) return res.status(404).json({ error: 'Not found' });
    res.json(result);
  } catch (err) {
    if (err instanceof ConflictError) return res.status(409).json({ error: err.message });
    if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
    next(err);
  }
});

router.post('/:id/reset-password', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid id' });
    const password = validatePasswordReset(req.body);
    const passwordHash = await bcrypt.hash(password, 12);

    const ok = await tx(async (conn) => {
      const [result] = await conn.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, id]);
      if (!result.affectedRows) return false;

      await audit(conn, {
        userId: req.user.id,
        action: 'user_password_reset',
        entity: 'user',
        entityId: String(id),
        ip: req.ip,
      });
      return true;
    });

    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.status(204).end();
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
    next(err);
  }
});
