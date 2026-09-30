import { useTheftsData } from '../TheftsDataContext.jsx';
import Filters from './Filters.jsx';
import Cards from './Cards.jsx';
import MonthlyChart from './MonthlyChart.jsx';

export default function Dashboard() {
  const { meta, filters, onFiltersChange, summary, loading, error } = useTheftsData();

  if (!meta) return <div className="loading">Loading…</div>;

  return (
    <div className="dashboard">
      <Filters meta={meta} value={filters} onChange={onFiltersChange} />
      {error && <div className="error-banner">{error}</div>}
      {loading && <div className="loading">Loading…</div>}
      {summary && <Cards summary={summary} />}
      {summary && <MonthlyChart data={summary.by_month} />}
    </div>
  );
}
