import { useState, useEffect, useRef } from 'react';

function siteTextFor(value, meta) {
  if (!value.site_id) return '';
  const match = meta.sites.find((s) => s.site_id === value.site_id);
  return match ? `${match.site_id} — ${match.site_name}` : '';
}

// `value` seeds this instance from the shared filter state (TheftsDataContext) on mount, so
// the Dashboard and Datasheet copies of this component agree even though each keeps its own
// local draft for debouncing.
export default function Filters({ meta, value, onChange }) {
  const [draft, setDraft] = useState(value);
  const [siteText, setSiteText] = useState(() => siteTextFor(value, meta));
  const debounceRef = useRef();

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onChange(draft), 300);
    return () => clearTimeout(debounceRef.current);
  }, [draft, onChange]);

  function update(key, value) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function handleSiteInput(text) {
    setSiteText(text);
    const match = meta.sites.find((s) => `${s.site_id} — ${s.site_name}` === text);
    update('site_id', match ? match.site_id : '');
  }

  return (
    <div className="filters">
      <select value={draft.project} onChange={(e) => update('project', e.target.value)}>
        <option value="">All projects</option>
        <option value="HTG">HTG</option>
        <option value="ATC">ATC</option>
      </select>

      <input list="sites-datalist" placeholder="Site" value={siteText} onChange={(e) => handleSiteInput(e.target.value)} />
      <datalist id="sites-datalist">
        {meta.sites.map((s) => (
          <option key={s.site_id} value={`${s.site_id} — ${s.site_name}`} />
        ))}
      </datalist>

      <input type="date" aria-label="From date" value={draft.from} onChange={(e) => update('from', e.target.value)} />
      <input type="date" aria-label="To date" value={draft.to} onChange={(e) => update('to', e.target.value)} />

      <select value={draft.item_type} onChange={(e) => update('item_type', e.target.value)}>
        <option value="">All item types</option>
        {meta.item_types.map((it) => (
          <option key={it.item_type} value={it.item_type}>
            {it.item_type}
          </option>
        ))}
      </select>

      <label className="checkbox">
        <input type="checkbox" checked={draft.flagged} onChange={(e) => update('flagged', e.target.checked)} />
        Flagged only
      </label>
    </div>
  );
}
