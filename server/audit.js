// Appends one row to audit_log. Call with a transaction connection when the
// audited change must commit atomically with the audit row (e.g. price writes).
export async function audit(conn, { userId, action, entity, entityId, oldValue, newValue, meta, ip }) {
  await conn.query(
    `INSERT INTO audit_log (user_id, action, entity, entity_id, old_value, new_value, meta, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId ?? null,
      action,
      entity ?? null,
      entityId ?? null,
      oldValue === undefined ? null : JSON.stringify(oldValue),
      newValue === undefined ? null : JSON.stringify(newValue),
      meta === undefined ? null : JSON.stringify(meta),
      ip ?? null,
    ]
  );
}
