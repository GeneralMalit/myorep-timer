import React from 'react';
import './Sidebar.css';

const Sidebar = ({ currentTheme, setTheme, setShowSettings, showSettings, isCollapsed, toggleSidebar }) => {
  const themes = [
    { id: 'theme-default', name: 'Deep Purple', color: '#bb86fc' },
    { id: 'theme-ocean', name: 'Ocean Blue', color: '#03dac6' },
    { id: 'theme-fire', name: 'Crimson Fire', color: '#cf6679' },
    { id: 'theme-forest', name: 'Neon Forest', color: '#00e676' },
  ];

  return (
    <div className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <div className="header-row">
          {!isCollapsed && <h2>MyoREP</h2>}
          <button onClick={toggleSidebar} className="collapse-btn">
            {isCollapsed ? '☰' : '«'}
          </button>
        </div>
        {!isCollapsed && <span className="version">v2.3.0</span>}
      </div>

      <div className="sidebar-section">
        {!isCollapsed && <h3>Themes</h3>}
        <div className="theme-options">
          {themes.map((theme) => (
            <button
              key={theme.id}
              className={`theme-btn ${currentTheme === theme.id ? 'active' : ''}`}
              onClick={() => setTheme(theme.id)}
              style={{ borderColor: isCollapsed ? 'transparent' : theme.color }}
              title={theme.name}
            >
              <span className="dot" style={{ backgroundColor: theme.color }}></span>
              {!isCollapsed && theme.name}
            </button>
          ))}
        </div>
      </div>

      <div className="sidebar-section spacer-bottom">
        <button
          className={`settings-toggle-btn ${showSettings ? 'active' : ''}`}
          onClick={() => setShowSettings(!showSettings)}
          title="Settings"
        >
          {isCollapsed ? '⚙' : (showSettings ? 'Close Settings' : 'Settings')}
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
