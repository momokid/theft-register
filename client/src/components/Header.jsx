function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

export default function Header({ user, theme, onToggleTheme, tab, onTabChange, onLogout }) {
  const tabs = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'datasheet', label: 'Datasheet' },
    ...(user.is_admin
      ? [
          { key: 'import', label: 'Import' },
          { key: 'accounts', label: 'Accounts' },
          { key: 'audit', label: 'Audit log' },
        ]
      : []),
  ];

  return (
    <header className="app-header">
      <div className="app-header-top">
        <span className="app-name">Theft Register</span>
        <div className="app-header-actions">
          <button
            className="icon-button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
          <span className="user-name">{user.name}</span>
          <button className="icon-button" onClick={onLogout} aria-label="Logout" title="Logout">
            <LogoutIcon />
          </button>
        </div>
      </div>
      <nav className="tabs">
        {tabs.map((t) => (
          <button key={t.key} className={t.key === tab ? 'tab active' : 'tab'} onClick={() => onTabChange(t.key)}>
            {t.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
