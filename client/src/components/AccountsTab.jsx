import { useState, useEffect } from 'react';
import { apiFetch } from '../api.js';
import { formatDate } from '../format.js';
import Modal from './Modal.jsx';

export default function AccountsTab({ user }) {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [resettingUser, setResettingUser] = useState(null);

  function load() {
    setError(null);
    apiFetch('/accounts')
      .then((res) => setUsers(res.rows))
      .catch((e) => setError(e.message));
  }

  useEffect(load, []);

  async function toggleActive(row) {
    const next = !row.is_active;
    if (!window.confirm(`${next ? 'Activate' : 'Deactivate'} ${row.name}?`)) return;
    try {
      await apiFetch(`/accounts/${row.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: next }) });
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="accounts-tab">
      <div className="datasheet-actions">
        <button type="button" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? 'Cancel' : 'New user'}
        </button>
      </div>

      {showCreate && (
        <CreateUserForm
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}

      {error && <div className="error-banner">{error}</div>}
      {!users && !error && <div className="loading">Loading…</div>}

      {users && (
        <div className="table-wrap">
          <table className="thefts-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Admin</th>
                <th>Active</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((row) => (
                <tr key={row.id} className={row.is_active ? '' : 'flagged'}>
                  <td>{row.name}</td>
                  <td>{row.email}</td>
                  <td>{row.is_admin ? 'Yes' : 'No'}</td>
                  <td>{row.is_active ? 'Yes' : 'No'}</td>
                  <td>{formatDate(row.created_at?.slice(0, 10))}</td>
                  <td>
                    <div className="row-actions">
                      <button type="button" onClick={() => setEditingUser(row)}>
                        Edit
                      </button>
                      <button type="button" onClick={() => setResettingUser(row)}>
                        Reset password
                      </button>
                      <button type="button" disabled={row.id === user.id} onClick={() => toggleActive(row)}>
                        {row.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editingUser && (
        <EditUserModal
          row={editingUser}
          self={editingUser.id === user.id}
          onClose={() => setEditingUser(null)}
          onSaved={() => {
            setEditingUser(null);
            load();
          }}
        />
      )}

      {resettingUser && (
        <ResetPasswordModal row={resettingUser} onClose={() => setResettingUser(null)} />
      )}
    </div>
  );
}

function CreateUserForm({ onCreated }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      await apiFetch('/accounts', {
        method: 'POST',
        body: JSON.stringify({ name, email, password, is_admin: isAdmin }),
      });
      onCreated();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="account-form" onSubmit={handleSubmit}>
      <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
      <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input
        type="password"
        placeholder="Password (min 10 chars)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      <input
        type="password"
        placeholder="Confirm password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        required
      />
      <label className="checkbox">
        <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
        Admin
      </label>
      <button type="submit" disabled={saving}>
        {saving ? 'Creating…' : 'Create user'}
      </button>
      {error && <div className="cell-error">{error}</div>}
    </form>
  );
}

function EditUserModal({ row, self, onClose, onSaved }) {
  const [name, setName] = useState(row.name);
  const [email, setEmail] = useState(row.email);
  const [isAdmin, setIsAdmin] = useState(!!row.is_admin);
  const [isActive, setIsActive] = useState(!!row.is_active);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    const body = {};
    if (name !== row.name) body.name = name;
    if (email !== row.email) body.email = email;
    if (!self && isAdmin !== !!row.is_admin) body.is_admin = isAdmin;
    if (!self && isActive !== !!row.is_active) body.is_active = isActive;
    if (!Object.keys(body).length) return onClose();

    setSaving(true);
    try {
      await apiFetch(`/accounts/${row.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Edit ${row.name}`} onClose={onClose}>
      <form className="account-form" onSubmit={handleSubmit}>
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label className="checkbox">
          <input type="checkbox" checked={isAdmin} disabled={self} onChange={(e) => setIsAdmin(e.target.checked)} />
          Admin
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={isActive} disabled={self} onChange={(e) => setIsActive(e.target.checked)} />
          Active
        </label>
        {self && <div className="import-note">You can't change your own admin or active status.</div>}
        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        {error && <div className="cell-error">{error}</div>}
      </form>
    </Modal>
  );
}

function ResetPasswordModal({ row, onClose }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/accounts/${row.id}/reset-password`, { method: 'POST', body: JSON.stringify({ password }) });
      setDone(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Reset password — ${row.name}`} onClose={onClose}>
      {done ? (
        <div className="import-result">Password updated.</div>
      ) : (
        <form className="account-form" onSubmit={handleSubmit}>
          <input
            type="password"
            placeholder="New password (min 10 chars)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Confirm new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
          <button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Reset password'}
          </button>
          {error && <div className="cell-error">{error}</div>}
        </form>
      )}
    </Modal>
  );
}
