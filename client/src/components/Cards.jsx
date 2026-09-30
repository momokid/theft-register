import { formatMoney } from '../format.js';

export default function Cards({ summary }) {
  return (
    <div className="cards">
      <Card label="Rows" value={summary.rows} />
      <Card label="Fuel lost (L)" value={summary.fuel_lost_l.toLocaleString()} />
      <Card label="Flagged" value={summary.flagged} />
      <Card label="Unpriced" value={summary.unpriced} />
      <Card label="Grand total" value={formatMoney(summary.grand_total)} />
    </div>
  );
}

function Card({ label, value }) {
  return (
    <div className="card">
      <div className="card-label">{label}</div>
      <div className="card-value">{value}</div>
    </div>
  );
}
