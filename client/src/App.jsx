import { useState, useEffect } from 'react';
import { apiFetch } from './api.js';
import { TheftsDataProvider } from './TheftsDataContext.jsx';
import Login from './components/Login.jsx';
import Header from './components/Header.jsx';
import Dashboard from './components/Dashboard.jsx';
import Datasheet from './components/Datasheet.jsx';
import ImportTab from './components/ImportTab.jsx';
import AccountsTab from './components/AccountsTab.jsx';
import AuditLogTab from './components/AuditLogTab.jsx';

function initialTheme() {
  try {
    const saved = localStorage.getItem('theme');
    if (saved) return saved;
  } catch {
    // localStorage unavailable; fall through to system preference
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = checking session, null = logged out
  const [theme, setTheme] = useState(initialTheme);
  const [tab, setTab] = useState('dashboard');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('theme', theme);
    } catch {
      // ignore storage failures (private browsing, etc.)
    }
  }, [theme]);

  useEffect(() => {
    // Raw fetch, not apiFetch: a 401 here just means "not logged in", not "session expired".
    fetch('/api/auth/me', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  if (user === undefined) return <div className="loading-screen">Loading…</div>;
  if (user === null) return <Login onLogin={setUser} />;

  return (
    <div className="app">
      <Header
        user={user}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        tab={tab}
        onTabChange={setTab}
        onLogout={async () => {
          await apiFetch('/auth/logout', { method: 'POST' });
          setUser(null);
        }}
      />
      <main className={tab === 'datasheet' ? 'main-wide' : ''}>
        {(tab === 'dashboard' || tab === 'datasheet') && (
          <TheftsDataProvider>
            {tab === 'dashboard' && <Dashboard />}
            {tab === 'datasheet' && <Datasheet user={user} />}
          </TheftsDataProvider>
        )}
        {tab === 'import' && user.is_admin && <ImportTab />}
        {tab === 'accounts' && user.is_admin && <AccountsTab user={user} />}
        {tab === 'audit' && user.is_admin && <AuditLogTab />}
      </main>
    </div>
  );
}
