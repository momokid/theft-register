import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../api.js';
import { formatDate } from '../format.js';

const PAGE_SIZE = 50;
const ACTIONS = [
  'login',
  'login_failed',
  'logout',
  'price_override',
  'price_clear',
  'price_apply',
  'quantity_override',
  'import',
  'export',
  'user_create',
  'user_update',
  'user_password_reset',
];
const EMPTY_FILTERS = { user_id: '', action: '', from: '', to: '' };

function toQuery(filters, page) {
  const params = new URLSearchParams();
  if (filters.user_id) params.set('user_id', filters.user_id);
  if (filters.action) params.set('action', filters.action);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  params.set('page', page);
  params.set('pageSize', PAGE_SIZE);
  return params.toString();
}

export default function AuditLogTab() {
  const [users, setUsers] = useState([]);
  const [draft, setDraft] = useState(EMPTY_FILTERS);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const debounceRef = useRef();

  useEffect(() => {
    apiFetch('/accounts')
      .then((res) => setUsers(res.rows))
      .catch(() => {});
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setFilters(draft);
      setPage(1);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [draft]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    apiFetch(`/audit?${toQuery(filters, page)}`, { signal: controller.signal })
      .then(setData)
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [filters, page]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="audit-tab">
      <div className="filters">
        <select value={draft.user_id} onChange={(e) => setDraft((d) => ({ ...d, user_id: e.target.value }))}>
          <option value="">All users</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <select value={draft.action} onChange={(e) => setDraft((d) => ({ ...d, action: e.target.value }))}>
          <option value="">All actions</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <input
          type="date"
          aria-label="From date"
          value={draft.from}
          onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
        />
        <input
          type="date"
          aria-label="To date"
          value={draft.to}
          onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
        />
      </div>

      {error && <div className="error-banner">{error}</div>}
      {loading && <div className="loading">Loading…</div>}

      {!loading && data && (
        <>
          <div className="table-wrap">
            <table className="thefts-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Old</th>
                  <th>New</th>
                  <th>Meta</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDate(row.created_at?.slice(0, 10))} {row.created_at?.slice(11, 16)}</td>
                    <td>{row.user_name || '—'}</td>
                    <td>{row.action}</td>
                    <td>{row.entity ? `${row.entity} #${row.entity_id}` : '—'}</td>
                    <td>
                      <KeyValueList data={row.old_value} />
                    </td>
                    <td>
                      <KeyValueList data={row.new_value} />
                    </td>
                    <td>
                      <KeyValueList data={row.meta} />
                    </td>
                    <td>{row.ip || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Prev
            </button>
            <span>
              Page {page} of {totalPages}
            </span>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function KeyValueList({ data }) {
  if (!data || typeof data !== 'object') return '—';
  const entries = Object.entries(data);
  if (!entries.length) return '—';
  return (
    <div className="kv-list">
      {entries.map(([k, v]) => (
        <div key={k}>
          <strong>{k}:</strong> {typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? '—')}
        </div>
      ))}
    </div>
  );
}
