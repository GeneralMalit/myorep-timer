import React from 'react';
import './SettingsPanel.css';

const SettingsPanel = ({ settings, setSettings, isOpen, onClose }) => {
    if (!isOpen) return null;

    const handleChange = (key, value) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    return (
        <div className="settings-panel">
            <div className="settings-header">
                <h2>Appearance & Timer Settings</h2>
                <button className="close-btn" onClick={onClose}>&times;</button>
            </div>

            <div className="settings-content">
                <div className="setting-group">
                    <label>Active Color (Main)</label>
                    <div className="color-picker-wrapper">
                        <input
                            type="color"
                            value={settings.activeColor}
                            onChange={(e) => handleChange('activeColor', e.target.value)}
                        />
                        <span>{settings.activeColor}</span>
                    </div>
                </div>

                <div className="setting-group">
                    <label>Rest Color</label>
                    <div className="color-picker-wrapper">
                        <input
                            type="color"
                            value={settings.restColor}
                            onChange={(e) => handleChange('restColor', e.target.value)}
                        />
                        <span>{settings.restColor}</span>
                    </div>
                </div>

                <div className="setting-group">
                    <label>Critical Last Second Color</label>
                    <div className="color-picker-wrapper">
                        <input
                            type="color"
                            value={settings.criticalRepColor}
                            onChange={(e) => handleChange('criticalRepColor', e.target.value)}
                        />
                        <span>{settings.criticalRepColor}</span>
                    </div>
                </div>

                <div className="setting-group">
                    <label>Critical Rep Threshold (s)</label>
                    <input
                        type="number"
                        value={settings.lastSecondThreshold}
                        onChange={(e) => handleChange('lastSecondThreshold', parseInt(e.target.value))}
                        min="1"
                        max="10"
                    />
                </div>

                <div className="setting-group checkbox-group">
                    <label>Smooth Timer Animation</label>
                    <input
                        type="checkbox"
                        checked={settings.smoothAnimation}
                        onChange={(e) => handleChange('smoothAnimation', e.target.checked)}
                    />
                </div>

                <div className="setting-group">
                    <label>Startup Duration (s)</label>
                    <input
                        type="number"
                        value={settings.prepTime}
                        onChange={(e) => handleChange('prepTime', parseInt(e.target.value) || 0)}
                        min="1"
                        max="60"
                    />
                </div>

                <div className="setting-group checkbox-group">
                    <label>Full Screen Mode</label>
                    <input
                        type="checkbox"
                        checked={settings.fullScreenMode}
                        onChange={(e) => handleChange('fullScreenMode', e.target.checked)}
                    />
                </div>

                <div className="setting-group checkbox-group">
                    <label>Enable Metronome</label>
                    <input
                        type="checkbox"
                        checked={settings.metronomeEnabled}
                        onChange={(e) => handleChange('metronomeEnabled', e.target.checked)}
                    />
                </div>

                {settings.metronomeEnabled && (
                    <div className="setting-group">
                        <label>Metronome Sound</label>
                        <select
                            value={settings.metronomeSound}
                            onChange={(e) => handleChange('metronomeSound', e.target.value)}
                            style={{
                                width: '100%',
                                padding: '10px',
                                borderRadius: '8px',
                                background: '#2c2c2c',
                                color: '#fff',
                                border: '1px solid #444'
                            }}
                        >
                            <option value="woodblock">Woodblock</option>
                            <option value="mechanical">Mechanical</option>
                            <option value="electronic">Electronic</option>
                            <option value="low-thud">Low Thud</option>
                        </select>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SettingsPanel;
