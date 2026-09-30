import { useState } from 'react';
import { apiFetch } from '../api.js';

export default function ApplyPriceBar({ meta, filters, refetch }) {
  const [itemType, setItemType] = useState('');
  const [from, setFrom] = useState(filters.from || '');
  const [to, setTo] = useState(filters.to || '');
  const [project, setProject] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [applying, setApplying] = useState(false);

  async function handleApply() {
    setError(null);
    setResult(null);

    if (!itemType || !from || !to || unitPrice === '') {
      setError('Fill in item type, from, to, and price.');
      return;
    }
    const price = Number(unitPrice);
    if (Number.isNaN(price)) {
      setError('Enter a valid price.');
      return;
    }

    const confirmed = window.confirm(
      `Apply GHS ${price.toFixed(2)} to ${itemType} for ${from} to ${to}` +
        `${project ? ` (${project} only)` : ''}? This overwrites the unit price on matching rows that aren't already overridden.`
    );
    if (!confirmed) return;

    setApplying(true);
    try {
      const body = { item_type: itemType, from, to, unit_price: price };
      if (project) body.project = project;
      const res = await apiFetch('/prices/apply', { method: 'POST', body: JSON.stringify(body) });
      setResult(`Updated ${res.updated} · skipped ${res.skipped_overrides} overrides`);
      refetch();
    } catch (e) {
      setError(e.message);
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="apply-price-bar">
      <select value={itemType} onChange={(e) => setItemType(e.target.value)}>
        <option value="">Item type…</option>
        {meta.item_types.map((it) => (
          <option key={it.item_type} value={it.item_type}>
            {it.item_type}
          </option>
        ))}
      </select>
      <input type="date" aria-label="Apply from date" value={from} onChange={(e) => setFrom(e.target.value)} />
      <input type="date" aria-label="Apply to date" value={to} onChange={(e) => setTo(e.target.value)} />
      <select value={project} onChange={(e) => setProject(e.target.value)}>
        <option value="">All projects</option>
        <option value="HTG">HTG</option>
        <option value="ATC">ATC</option>
      </select>
      <input
        type="number"
        step="0.01"
        placeholder="Price (GHS)"
        value={unitPrice}
        onChange={(e) => setUnitPrice(e.target.value)}
      />
      <button type="button" onClick={handleApply} disabled={applying}>
        {applying ? 'Applying…' : 'Apply price'}
      </button>
      {result && <span className="apply-result">{result}</span>}
      {error && <div className="cell-error">{error}</div>}
    </div>
  );
}
