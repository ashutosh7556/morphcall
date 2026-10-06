import React from 'react';
import { House, AudioLines, Users, Clock, Settings, Search, Bell, BellRing, User } from 'lucide-react';
import InstallButton from '../InstallButton';

const NAV_ITEMS = [
  { id: 'home', label: 'Home', icon: House },
  { id: 'effects', label: 'Voice Effects', short: 'Effects', icon: AudioLines, effectsOnly: true },
  { id: 'contacts', label: 'Contacts', icon: Users },
  { id: 'recents', label: 'Recent Calls', short: 'Recents', icon: Clock },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const visibleItems = (plain) => NAV_ITEMS.filter((item) => !(plain && item.effectsOnly));

export function BrandLogo() {
  return (
    <div className="brand">
      <span className="brand-wave" aria-hidden="true">
        {[10, 18, 26, 18, 10].map((h, i) => (
          <i key={i} style={{ height: h }} />
        ))}
      </span>
      <span className="brand-title">Voice Call</span>
    </div>
  );
}

// Desktop / tablet sidebar
export function Sidebar({ activeView, onNavigate, plain }) {
  return (
    <aside className="sidebar">
      <BrandLogo />
      <nav className="sidebar-nav">
        {visibleItems(plain).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={`sidebar-link ${activeView === id ? 'active' : ''}`}
            onClick={() => onNavigate(id)}
            title={label}
          >
            <Icon size={20} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">
        <InstallButton variant="card" />
      </div>
    </aside>
  );
}

// Mobile bottom tab bar
export function BottomNav({ activeView, onNavigate, plain }) {
  return (
    <nav className="bottom-nav">
      {visibleItems(plain).map(({ id, label, short, icon: Icon }) => (
        <button
          key={id}
          type="button"
          className={`bottom-nav-btn ${activeView === id ? 'active' : ''}`}
          onClick={() => onNavigate(id)}
        >
          <Icon size={20} />
          <span>{short || label}</span>
        </button>
      ))}
    </nav>
  );
}

export function TopBar({ search, onSearchChange, onSearchSubmit, pushOn, onBellClick, myName, isOnline, onAvatarClick }) {
  return (
    <header className="topbar">
      <div className="topbar-brand-mobile">
        <BrandLogo />
      </div>
      <form
        className="search-box topbar-search"
        onSubmit={(e) => {
          e.preventDefault();
          onSearchSubmit();
        }}
      >
        <Search size={18} />
        <input
          type="search"
          placeholder="Search contacts or enter a friend code..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Search contacts or enter a friend code"
        />
      </form>
      <div className="topbar-actions">
        <InstallButton />
        <button
          type="button"
          className="icon-btn"
          onClick={onBellClick}
          title={pushOn ? 'Call notifications are on' : 'Turn on call notifications'}
          aria-label="Call notifications"
        >
          {pushOn ? <BellRing size={19} /> : <Bell size={19} />}
          {!pushOn && <span className="icon-btn-dot" />}
        </button>
        <button type="button" className="avatar-btn" onClick={onAvatarClick} title={myName || 'Your profile'} aria-label="Profile and settings">
          {myName ? myName.slice(0, 1).toUpperCase() : <User size={20} />}
          <span className={`presence-badge ${isOnline ? 'online' : ''}`} />
        </button>
      </div>
    </header>
  );
}
