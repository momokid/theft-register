import { useState } from 'react';
import { uploadFile } from '../api.js';

export default function ImportTab() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [error, setError] = useState(null);
  const [working, setWorking] = useState(false);
  const [commitResult, setCommitResult] = useState(null);

  function handleFileChange(e) {
    setFile(e.target.files[0] || null);
    setPreview(null);
    setCommitResult(null);
    setError(null);
  }

  async function handlePreview() {
    if (!file) return;
    setError(null);
    setCommitResult(null);
    setWorking(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      setPreview(await uploadFile('/import/preview', formData));
    } catch (e) {
      setError(e.message);
      setPreview(null);
    } finally {
      setWorking(false);
    }
  }

  async function handleCommit() {
    if (!file) return;
    setError(null);
    setWorking(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      setCommitResult(await uploadFile('/import/commit', formData));
      setPreview(null);
      setFile(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setWorking(false);
    }
  }

  const hasErrors = preview && preview.counts.error > 0;
  const filteredRows = preview ? preview.rows.filter((r) => !statusFilter || r.status === statusFilter) : [];

  return (
    <div className="import-tab">
      <div className="import-upload">
        <input type="file" accept=".xlsx" onChange={handleFileChange} />
        <button type="button" onClick={handlePreview} disabled={!file || working}>
          {working ? 'Working…' : 'Preview'}
        </button>
        <button type="button" onClick={handleCommit} disabled={!preview || hasErrors || working}>
          Commit
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {commitResult && (
        <div className="import-result">
          Inserted {commitResult.inserted} · skipped {commitResult.skipped} duplicates
        </div>
      )}

      {preview && (
        <>
          <div className="import-counts">
            <span>New: {preview.counts.new}</span>
            <span>Duplicate: {preview.counts.duplicate}</span>
            <span>Error: {preview.counts.error}</span>
          </div>

          <label className="import-status-filter">
            Show
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All</option>
              <option value="new">New</option>
              <option value="duplicate">Duplicate</option>
              <option value="error">Error</option>
            </select>
          </label>

          <div className="table-wrap">
            <table className="thefts-table">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Status</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => (
                  <tr key={r.row} className={r.status === 'error' ? 'flagged' : ''}>
                    <td>{r.row}</td>
                    <td>{r.status}</td>
                    <td>{r.reason || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.rows.length === 200 && (
            <div className="import-note">Showing the first 200 rows. Counts above reflect the whole file.</div>
          )}
        </>
      )}
    </div>
  );
}
