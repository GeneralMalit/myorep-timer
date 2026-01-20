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
                    <label>Concentric Color</label>
                    <div className="color-picker-wrapper">
                        <input
                            type="color"
                            value={settings.concentricColor}
                            onChange={(e) => handleChange('concentricColor', e.target.value)}
                        />
                        <span>{settings.concentricColor}</span>
                    </div>
                </div>

                <div className="setting-group">
                    <label>Concentric Second (s)</label>
                    <input
                        type="number"
                        value={settings.concentricSecond}
                        onChange={(e) => handleChange('concentricSecond', parseInt(e.target.value))}
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
                    <label>Up Down Mode (Visuals Only)</label>
                    <input
                        type="checkbox"
                        checked={settings.upDownMode}
                        onChange={(e) => handleChange('upDownMode', e.target.checked)}
                    />
                </div>

                <div className="setting-group">
                    <label>Workout Info Visibility</label>
                    <select
                        value={settings.infoVisibility}
                        onChange={(e) => handleChange('infoVisibility', e.target.value)}
                        className="settings-select"
                    >
                        <option value="always">Always Show</option>
                        <option value="resting">Show During Rest Only</option>
                        <option value="never">Never Show</option>
                    </select>
                </div>

                <div className="setting-group checkbox-group">
                    <label>Enable Sound Cues</label>
                    <input
                        type="checkbox"
                        checked={settings.metronomeEnabled}
                        onChange={(e) => handleChange('metronomeEnabled', e.target.checked)}
                    />
                </div>

                <div className="setting-group checkbox-group">
                    <label>Floating Window (PiP)</label>
                    <input
                        type="checkbox"
                        checked={settings.floatingWindow}
                        onChange={(e) => handleChange('floatingWindow', e.target.checked)}
                    />
                </div>

                <div className="setting-group">
                    <label>Pulsating Word Effect</label>
                    <select
                        value={settings.pulseEffect}
                        onChange={(e) => handleChange('pulseEffect', e.target.value)}
                        className="settings-select"
                    >
                        <option value="always">Always Pulse</option>
                        <option value="resting">Pulse on Rest Only</option>
                        <option value="never">Never Pulse</option>
                    </select>
                </div>

                <div className="setting-group">
                    <label>Sound Cue Mode</label>
                    <select
                        value={settings.soundMode}
                        onChange={(e) => handleChange('soundMode', e.target.value)}
                        className="settings-select"
                    >
                        <option value="metronome">Metronome (Beeps)</option>
                        <option value="tts">Natural Voice (TTS)</option>
                    </select>
                </div>

                {settings.metronomeEnabled && settings.soundMode === 'metronome' && (
                    <div className="setting-group">
                        <label>Metronome Sound</label>
                        <select
                            value={settings.metronomeSound}
                            onChange={(e) => handleChange('metronomeSound', e.target.value)}
                            className="settings-select"
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
