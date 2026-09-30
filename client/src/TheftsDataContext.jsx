import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiFetch } from './api.js';

const PAGE_SIZE = 50;
const EMPTY_FILTERS = { project: '', site_id: '', from: '', to: '', item_type: '', flagged: false };

export function toQuery(filters, extra = {}) {
  const params = new URLSearchParams();
  if (filters.project) params.set('project', filters.project);
  if (filters.site_id) params.set('site_id', filters.site_id);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.item_type) params.set('item_type', filters.item_type);
  if (filters.flagged) params.set('flagged', '1');
  for (const [k, v] of Object.entries(extra)) params.set(k, v);
  return params.toString();
}

const TheftsDataContext = createContext(null);

// One shared filtered dataset behind both the Dashboard (cards/filters/chart) and the
// Datasheet (table) tabs, so they can never show different filters or diverge in totals.
export function TheftsDataProvider({ children }) {
  const [meta, setMeta] = useState(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [drawerId, setDrawerId] = useState(null);

  useEffect(() => {
    apiFetch('/meta')
      .then(setMeta)
      .catch((e) => setError(e.message));
  }, []);

  const onFiltersChange = useCallback((next) => {
    setFilters(next);
    setPage(1);
  }, []);

  useEffect(() => {
    if (!meta) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    Promise.all([
      apiFetch(`/thefts?${toQuery(filters, { page, pageSize: PAGE_SIZE })}`, { signal: controller.signal }),
      apiFetch(`/summary?${toQuery(filters)}`, { signal: controller.signal }),
    ])
      .then(([theftsRes, summaryRes]) => {
        setData(theftsRes);
        setSummary(summaryRes);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [meta, filters, page]);

  // For actions that mutate rows outside the per-cell save path (bulk apply-price).
  const refetch = useCallback(() => {
    Promise.all([
      apiFetch(`/thefts?${toQuery(filters, { page, pageSize: PAGE_SIZE })}`),
      apiFetch(`/summary?${toQuery(filters)}`),
    ]).then(([theftsRes, summaryRes]) => {
      setData(theftsRes);
      setSummary(summaryRes);
    });
  }, [filters, page]);

  async function handleCellSave(id, body) {
    const path = 'unit_price' in body ? `/thefts/${id}/price` : `/thefts/${id}/quantity`;
    const updated = await apiFetch(path, { method: 'PATCH', body: JSON.stringify(body) });
    setData((d) => ({ ...d, rows: d.rows.map((r) => (r.id === id ? { ...r, ...updated } : r)) }));
    apiFetch(`/summary?${toQuery(filters)}`)
      .then(setSummary)
      .catch(() => {});
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  const value = {
    meta,
    filters,
    onFiltersChange,
    page,
    setPage,
    totalPages,
    data,
    summary,
    loading,
    error,
    drawerId,
    setDrawerId,
    onSavePrice: (id, unit_price) => handleCellSave(id, { unit_price }),
    onSaveQuantity: (id, quantity_lost) => handleCellSave(id, { quantity_lost }),
    refetch,
  };

  return <TheftsDataContext.Provider value={value}>{children}</TheftsDataContext.Provider>;
}

export function useTheftsData() {
  const ctx = useContext(TheftsDataContext);
  if (!ctx) throw new Error('useTheftsData must be used within TheftsDataProvider');
  return ctx;
}
