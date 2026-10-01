import { useState, useEffect } from 'react';
import { apiFetch } from '../api.js';
import { formatMoney, formatDate } from '../format.js';

export default function SourceDrawer({ id, onClose }) {
  const [row, setRow] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setRow(null);
    setError(null);
    apiFetch(`/thefts/${id}`)
      .then(setRow)
      .catch((e) => setError(e.message));
  }, [id]);

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <button className="drawer-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        {error && <div className="error-banner">{error}</div>}
        {!row && !error && <div className="loading">Loading…</div>}
        {row && (
          <div className="drawer-content">
            <div className="drawer-fields">
              <Field label="Project" value={row.project} />
              <Field label="Post date" value={formatDate(row.post_date)} />
              <Field label="Theft date" value={formatDate(row.theft_date)} />
              <Field label="Site" value={row.site_name ? `${row.site_id} — ${row.site_name}` : row.site_id} />
              <Field label="Last visit date" value={formatDate(row.last_visit_date)} />
              <Field label="Item stolen" value={row.item_stolen} />
              <Field label="Item type" value={row.item_type} />
              <Field label="Unit" value={row.unit} />
              <Field label="Quantity lost" value={row.quantity_lost} />
              <Field label="Quantity (NED)" value={row.quantity_ned} />
              <Field label="Unit price" value={formatMoney(row.unit_price)} />
              <Field label="Subtotal" value={formatMoney(row.subtotal)} />
              <Field label="RH before / after" value={`${row.rh_before ?? '—'} / ${row.rh_after ?? '—'}`} />
              <Field
                label="Dipstick before / after (cm)"
                value={`${row.dipstick_before_cm ?? '—'} / ${row.dipstick_after_cm ?? '—'}`}
              />
              <Field label="Probe before / after (L)" value={`${row.probe_before_l ?? '—'} / ${row.probe_after_l ?? '—'}`} />
              <Field label="Fuel before / after (L)" value={`${row.fuel_before_l ?? '—'} / ${row.fuel_after_l ?? '—'}`} />
              <Field label="Posted by" value={row.posted_by} />
              <Field label="Source" value={row.source_time} />
              <Field label="Source msg IDs" value={row.source_msg_ids} />
              <Field label="Flags" value={row.flags} />
              <Field label="Remarks" value={row.remarks} />
            </div>
            <div className="drawer-raw">
              <h3>Raw post</h3>
              <pre className="raw-post">{row.raw_post}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div className="field">
      <div className="field-label">{label}</div>
      <div className="field-value">{value === null || value === undefined || value === '' ? '—' : value}</div>
    </div>
  );
}
