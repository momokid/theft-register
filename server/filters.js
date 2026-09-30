import { ValidationError, isValidDate } from './validate.js';

export const FILTER_KEYS = ['project', 'site_id', 'from', 'to', 'item_type', 'flagged'];

// Shared by the thefts list, summary, export, and print report so their WHERE logic never diverges.
export function buildTheftFilter(query = {}) {
  const where = [];
  const params = [];

  if (query.project !== undefined) {
    if (query.project !== 'HTG' && query.project !== 'ATC') throw new ValidationError('Invalid project');
    where.push('project = ?');
    params.push(query.project);
  }

  if (query.site_id !== undefined) {
    if (typeof query.site_id !== 'string' || !query.site_id) throw new ValidationError('Invalid site_id');
    where.push('site_id = ?');
    params.push(query.site_id);
  }

  if (query.from !== undefined) {
    if (!isValidDate(query.from)) throw new ValidationError('Invalid from date');
    where.push('post_date >= ?');
    params.push(query.from);
  }

  if (query.to !== undefined) {
    if (!isValidDate(query.to)) throw new ValidationError('Invalid to date');
    where.push('post_date <= ?');
    params.push(query.to);
  }

  if (query.item_type !== undefined) {
    if (typeof query.item_type !== 'string' || !query.item_type) throw new ValidationError('Invalid item_type');
    where.push('item_type = ?');
    params.push(query.item_type);
  }

  if (query.flagged !== undefined) {
    if (query.flagged !== '1') throw new ValidationError('Invalid flagged');
    where.push("flags IS NOT NULL AND flags <> ''");
  }

  return { where: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

export const AUDIT_FILTER_KEYS = ['user_id', 'action', 'from', 'to'];

// Shared by the audit log list so its WHERE logic stays in one place.
export function buildAuditFilter(query = {}) {
  const where = [];
  const params = [];

  if (query.user_id !== undefined) {
    const id = Number(query.user_id);
    if (!Number.isInteger(id) || id < 1) throw new ValidationError('Invalid user_id');
    where.push('a.user_id = ?');
    params.push(id);
  }

  if (query.action !== undefined) {
    if (typeof query.action !== 'string' || !query.action) throw new ValidationError('Invalid action');
    where.push('a.action = ?');
    params.push(query.action);
  }

  if (query.from !== undefined) {
    if (!isValidDate(query.from)) throw new ValidationError('Invalid from date');
    where.push('a.created_at >= ?');
    params.push(`${query.from} 00:00:00`);
  }

  if (query.to !== undefined) {
    if (!isValidDate(query.to)) throw new ValidationError('Invalid to date');
    where.push('a.created_at <= ?');
    params.push(`${query.to} 23:59:59`);
  }

  return { where: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}
