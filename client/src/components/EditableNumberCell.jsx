import { useState, useEffect } from 'react';

// Shared by the Qty and Unit price table columns: an input, a Save/Override
// button that only appears once the value actually differs from what's saved,
// Enter to save, Esc to revert the in-progress edit — the button applies the
// change and disappears on its own since `dirty` goes false once saved.
export default function EditableNumberCell({ value, overridden, badgeLabel, saveLabel = 'Save', onSave, editable = true }) {
  const [draft, setDraft] = useState(value === null || value === undefined ? '' : String(value));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setDraft(value === null || value === undefined ? '' : String(value));
  }, [value]);

  if (!editable) {
    return (
      <div className="editable-cell">
        <span>{value === null || value === undefined ? '—' : value}</span>
        {overridden && <span className="badge">{badgeLabel}</span>}
      </div>
    );
  }

  const draftNum = draft === '' ? null : Number(draft);
  const dirty = draftNum !== value;

  async function save() {
    if (draftNum !== null && Number.isNaN(draftNum)) {
      setError('Enter a valid number');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(draftNum);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') setDraft(value === null || value === undefined ? '' : String(value));
  }

  return (
    <div className="editable-cell">
      <input
        type="number"
        step="0.01"
        value={draft}
        disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      {dirty && (
        <button type="button" onClick={save} disabled={saving}>
          {saveLabel}
        </button>
      )}
      {overridden && <span className="badge">{badgeLabel}</span>}
      {error && <div className="cell-error">{error}</div>}
    </div>
  );
}
