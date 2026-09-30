import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { formatMoney } from '../format.js';

function monthLabel(m) {
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
}

const compactNumber = new Intl.NumberFormat('en-GH', { notation: 'compact' });

export default function MonthlyChart({ data }) {
  if (!data || data.length === 0) return null;

  return (
    <div className="chart-card">
      <h3>Losses by month (GHS)</h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
          <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 12 }} tickFormatter={(v) => compactNumber.format(v)} />
          <Tooltip
            formatter={(value, name) => [formatMoney(value), name]}
            labelFormatter={monthLabel}
            contentStyle={{ background: 'var(--surface)', border: '2px solid var(--border)', borderRadius: 4 }}
            labelStyle={{ color: 'var(--text)' }}
          />
          <Legend wrapperStyle={{ color: 'var(--text-muted)', fontSize: 13 }} />
          <Bar dataKey="fuel" name="Fuel" stackId="a" fill="var(--chart-fuel)" />
          <Bar dataKey="cable" name="Cable" stackId="a" fill="var(--chart-cable)" />
          <Bar dataKey="equipment" name="Equipment" stackId="a" fill="var(--chart-equipment)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
