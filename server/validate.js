export class ValidationError extends Error {}
export class ConflictError extends Error {}

export function requireOnlyKeys(obj, allowed) {
  const extra = Object.keys(obj || {}).filter((k) => !allowed.includes(k));
  if (extra.length) throw new ValidationError(`Unknown field(s): ${extra.join(', ')}`);
}

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// GET /api/thefts pagination: page/pageSize (default 50, max 100), or all=1 capped at 5000.
export function parsePagination(query) {
  if (query.all !== undefined) {
    if (query.all !== '1') throw new ValidationError('Invalid all');
    if (query.page !== undefined || query.pageSize !== undefined) {
      throw new ValidationError('Cannot combine all with page or pageSize');
    }
    return { limit: 5000, offset: 0 };
  }

  let page = 1;
  if (query.page !== undefined) {
    page = Number(query.page);
    if (!Number.isInteger(page) || page < 1) throw new ValidationError('Invalid page');
  }

  let pageSize = 50;
  if (query.pageSize !== undefined) {
    pageSize = Number(query.pageSize);
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new ValidationError('Invalid pageSize');
    }
  }

  return { limit: pageSize, offset: (page - 1) * pageSize };
}

export function isValidPrice(n) {
  return (
    typeof n === 'number' &&
    Number.isFinite(n) &&
    n >= 0 &&
    n <= 9999999.99 &&
    Math.abs(Math.round(n * 100) - n * 100) < 1e-6
  );
}

export function validatePriceBody(body) {
  requireOnlyKeys(body, ['unit_price']);
  if (!body || !('unit_price' in body)) throw new ValidationError('unit_price is required');
  const { unit_price } = body;
  if (unit_price !== null && !isValidPrice(unit_price)) throw new ValidationError('Invalid unit_price');
  return unit_price;
}

export function validatePriceApply(body) {
  requireOnlyKeys(body, ['item_type', 'from', 'to', 'project', 'unit_price']);
  const { item_type, from, to, project, unit_price } = body || {};
  if (typeof item_type !== 'string' || !item_type) throw new ValidationError('Invalid item_type');
  if (!isValidDate(from)) throw new ValidationError('Invalid from date');
  if (!isValidDate(to)) throw new ValidationError('Invalid to date');
  if (to < from) throw new ValidationError('to must not be before from');
  if (project !== undefined && project !== 'HTG' && project !== 'ATC') throw new ValidationError('Invalid project');
  if (!isValidPrice(unit_price)) throw new ValidationError('Invalid unit_price');
  return { item_type, from, to, project, unit_price };
}

export function isValidQuantity(n) {
  return (
    typeof n === 'number' &&
    Number.isFinite(n) &&
    n >= 0 &&
    n <= 99999999.99 &&
    Math.abs(Math.round(n * 100) - n * 100) < 1e-6
  );
}

export function validateQuantityBody(body) {
  requireOnlyKeys(body, ['quantity_lost']);
  if (!body || !('quantity_lost' in body)) throw new ValidationError('quantity_lost is required');
  const { quantity_lost } = body;
  if (quantity_lost !== null && !isValidQuantity(quantity_lost)) throw new ValidationError('Invalid quantity_lost');
  return quantity_lost;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateLogin(body) {
  requireOnlyKeys(body, ['email', 'password']);
  const { email, password } = body || {};
  if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
    throw new ValidationError('Invalid email or password');
  }
  if (typeof password !== 'string' || password.length < 1) {
    throw new ValidationError('Invalid email or password');
  }
  return { email: email.trim().toLowerCase(), password };
}

export function isValidPassword(s) {
  return typeof s === 'string' && s.length >= 10;
}

export function validateUserCreate(body) {
  requireOnlyKeys(body, ['name', 'email', 'password', 'is_admin']);
  const { name, email, password, is_admin } = body || {};
  if (typeof name !== 'string' || !name.trim()) throw new ValidationError('Invalid name');
  if (typeof email !== 'string' || !EMAIL_RE.test(email)) throw new ValidationError('Invalid email');
  if (!isValidPassword(password)) throw new ValidationError('Password must be at least 10 characters');
  if (is_admin !== undefined && typeof is_admin !== 'boolean') throw new ValidationError('Invalid is_admin');
  return { name: name.trim(), email: email.trim().toLowerCase(), password, is_admin: !!is_admin };
}

// Returns only the fields present in body, so the caller can audit exactly what changed.
export function validateUserUpdate(body) {
  requireOnlyKeys(body, ['name', 'email', 'is_admin', 'is_active']);
  const out = {};
  if (body?.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) throw new ValidationError('Invalid name');
    out.name = body.name.trim();
  }
  if (body?.email !== undefined) {
    if (typeof body.email !== 'string' || !EMAIL_RE.test(body.email)) throw new ValidationError('Invalid email');
    out.email = body.email.trim().toLowerCase();
  }
  if (body?.is_admin !== undefined) {
    if (typeof body.is_admin !== 'boolean') throw new ValidationError('Invalid is_admin');
    out.is_admin = body.is_admin;
  }
  if (body?.is_active !== undefined) {
    if (typeof body.is_active !== 'boolean') throw new ValidationError('Invalid is_active');
    out.is_active = body.is_active;
  }
  if (!Object.keys(out).length) throw new ValidationError('No fields to update');
  return out;
}

export function validatePasswordReset(body) {
  requireOnlyKeys(body, ['password']);
  if (!isValidPassword(body?.password)) throw new ValidationError('Password must be at least 10 characters');
  return body.password;
}
