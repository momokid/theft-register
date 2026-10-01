import { formatMoney, formatDate } from '../format.js';
import EditableNumberCell from './EditableNumberCell.jsx';

export default function TheftsTable({
  rows,
  grandTotal,
  onView,
  onSaveQuantity,
  onSaveQuantityNed,
  onSavePrice,
  isAdmin,
  sort,
  onToggleSort,
}) {
  return (
    <div className="table-wrap">
      <table className="thefts-table">
        <thead>
          <tr>
            <th className="sortable" onClick={onToggleSort}>
              Date {sort === 'post_date_asc' ? '▲' : '▼'}
            </th>
            <th>Project</th>
            <th>Site</th>
            <th>Item</th>
            <th>Type</th>
            <th>Qty</th>
            <th>Qty (NED)</th>
            <th>Unit price</th>
            <th>Subtotal</th>
            <th>Flags</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={r.flags ? 'flagged' : ''}>
              <td>{formatDate(r.post_date)}</td>
              <td>{r.project}</td>
              <td>{r.site_name || r.site_id || '—'}</td>
              <td>{r.item_stolen}</td>
              <td>{r.item_type}</td>
              <td>
                <EditableNumberCell
                  value={r.quantity_lost}
                  overridden={!!r.quantity_override}
                  badgeLabel="edited"
                  saveLabel="Save"
                  onSave={(v) => onSaveQuantity(r.id, v)}
                  editable={isAdmin}
                />
                {r.unit !== '-' ? r.unit : ''}
              </td>
              <td>
                <EditableNumberCell
                  value={r.quantity_ned}
                  overridden={!!r.quantity_ned_override}
                  badgeLabel="edited"
                  saveLabel="Save"
                  onSave={(v) => onSaveQuantityNed(r.id, v)}
                  editable={isAdmin}
                />
                {r.unit !== '-' ? r.unit : ''}
              </td>
              <td>
                <EditableNumberCell
                  value={r.unit_price}
                  overridden={!!r.price_override}
                  badgeLabel="override"
                  saveLabel="Override"
                  onSave={(v) => onSavePrice(r.id, v)}
                />
              </td>
              <td>{formatMoney(r.subtotal)}</td>
              <td>{r.flags || ''}</td>
              <td>
                <button onClick={() => onView(r.id)}>View</button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={8}>Grand total</td>
            <td>{formatMoney(grandTotal)}</td>
            <td colSpan={2}></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
