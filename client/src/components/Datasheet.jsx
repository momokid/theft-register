import { useState } from 'react';
import { useTheftsData, toQuery } from '../TheftsDataContext.jsx';
import Filters from './Filters.jsx';
import ApplyPriceBar from './ApplyPriceBar.jsx';
import TheftsTable from './TheftsTable.jsx';
import SourceDrawer from './SourceDrawer.jsx';
import PrintReport from './PrintReport.jsx';

export default function Datasheet({ user }) {
  const {
    meta,
    filters,
    onFiltersChange,
    data,
    summary,
    loading,
    error,
    page,
    setPage,
    totalPages,
    drawerId,
    setDrawerId,
    onSavePrice,
    onSaveQuantity,
    refetch,
  } = useTheftsData();
  const [showPrint, setShowPrint] = useState(false);

  if (!meta) return <div className="loading">Loading…</div>;

  if (showPrint) {
    return <PrintReport filters={filters} summary={summary} user={user} onClose={() => setShowPrint(false)} />;
  }

  return (
    <div className="datasheet">
      <Filters meta={meta} value={filters} onChange={onFiltersChange} />
      <ApplyPriceBar meta={meta} filters={filters} refetch={refetch} />
      <div className="datasheet-actions">
        <a className="button-link" href={`/api/export.xlsx?${toQuery(filters)}`}>
          Export Excel
        </a>
        <button type="button" onClick={() => setShowPrint(true)}>
          Print report
        </button>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {loading && <div className="loading">Loading…</div>}
      {!loading && data && (
        <>
          <TheftsTable
            rows={data.rows}
            grandTotal={summary?.grand_total}
            onView={setDrawerId}
            onSavePrice={onSavePrice}
            onSaveQuantity={onSaveQuantity}
          />
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
      {drawerId && <SourceDrawer id={drawerId} onClose={() => setDrawerId(null)} />}
    </div>
  );
}
