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
                <section className="settings-section">
                    <h3>Visual Identity</h3>
                    <div className="settings-grid">
                        <div className="setting-group">
                            <label>Active Color</label>
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
                            <label>Finished Color</label>
                            <div className="color-picker-wrapper">
                                <input
                                    type="color"
                                    value={settings.finishedColor}
                                    onChange={(e) => handleChange('finishedColor', e.target.value)}
                                />
                                <span>{settings.finishedColor}</span>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="settings-section">
                    <h3>Timer Behavior</h3>
                    <div className="settings-grid">
                        <div className="setting-group">
                            <label>Concentric (s)</label>
                            <input
                                type="number"
                                value={settings.concentricSecond}
                                onChange={(e) => handleChange('concentricSecond', parseInt(e.target.value))}
                                min="1"
                                max="10"
                            />
                        </div>
                        <div className="setting-group">
                            <label>Startup (s)</label>
                            <input
                                type="number"
                                value={settings.prepTime}
                                onChange={(e) => handleChange('prepTime', parseInt(e.target.value) || 0)}
                                min="1"
                                max="60"
                            />
                        </div>
                    </div>

                    <div className="setting-group checkbox-group">
                        <label>Smooth Animation</label>
                        <input
                            type="checkbox"
                            checked={settings.smoothAnimation}
                            onChange={(e) => handleChange('smoothAnimation', e.target.checked)}
                        />
                    </div>
                </section>

                <section className="settings-section">
                    <h3>Display & UI</h3>
                    <div className="settings-grid">
                        <div className="setting-group">
                            <label>Workout Info</label>
                            <select
                                value={settings.infoVisibility}
                                onChange={(e) => handleChange('infoVisibility', e.target.value)}
                                className="settings-select"
                            >
                                <option value="always">Always</option>
                                <option value="resting">Rest Only</option>
                                <option value="never">Never</option>
                            </select>
                        </div>
                        <div className="setting-group">
                            <label>Pulsating</label>
                            <select
                                value={settings.pulseEffect}
                                onChange={(e) => handleChange('pulseEffect', e.target.value)}
                                className="settings-select"
                            >
                                <option value="always">Always</option>
                                <option value="resting">Rest Only</option>
                                <option value="never">Never</option>
                            </select>
                        </div>
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
                        <label>Up Down Mode</label>
                        <input
                            type="checkbox"
                            checked={settings.upDownMode}
                            onChange={(e) => handleChange('upDownMode', e.target.checked)}
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
                    {settings.floatingWindow && (
                        <div className="setting-group checkbox-group">
                            <label>Show Info in PiP</label>
                            <input
                                type="checkbox"
                                checked={settings.pipShowInfo}
                                onChange={(e) => handleChange('pipShowInfo', e.target.checked)}
                            />
                        </div>
                    )}
                </section>

                <section className="settings-section">
                    <h3>Sound Cues</h3>
                    <div className="setting-group checkbox-group">
                        <label>Enable Sound</label>
                        <input
                            type="checkbox"
                            checked={settings.metronomeEnabled}
                            onChange={(e) => handleChange('metronomeEnabled', e.target.checked)}
                        />
                    </div>

                    <div className="settings-grid">
                        <div className="setting-group">
                            <label>Sound Mode</label>
                            <select
                                value={settings.soundMode}
                                onChange={(e) => handleChange('soundMode', e.target.value)}
                                className="settings-select"
                            >
                                <option value="metronome">Metronome</option>
                                <option value="tts">Notes</option>
                            </select>
                        </div>

                        {settings.soundMode === 'tts' && (
                            <div className="setting-group">
                                <label>Test Voice</label>
                                <button
                                    type="button"
                                    className="test-voice-btn"
                                    onClick={() => {
                                        const voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
                                        console.log('[TTS Test] Voices:', voices.length);

                                        if (voices.length === 0) {
                                            // Use tone fallback - import dynamically
                                            import('../utils/audioEngine.js').then(({ audioEngine }) => {
                                                audioEngine.speakWithTones('Ready');
                                                setTimeout(() => audioEngine.speakWithTones(3), 500);
                                                setTimeout(() => audioEngine.speakWithTones(2), 1000);
                                                setTimeout(() => audioEngine.speakWithTones(1), 1500);
                                                setTimeout(() => audioEngine.speakWithTones('Go'), 2000);
                                            });
                                        } else {
                                            window.speechSynthesis.cancel();
                                            const u = new SpeechSynthesisUtterance('Ready 3 2 1 Go');
                                            u.volume = 1.0;
                                            u.voice = voices[0];
                                            window.speechSynthesis.speak(u);
                                        }
                                    }}
                                >
                                    Test
                                </button>
                            </div>
                        )}

                        {settings.metronomeEnabled && settings.soundMode === 'metronome' && (
                            <div className="setting-group">
                                <label>Sample</label>
                                <select
                                    value={settings.metronomeSound}
                                    onChange={(e) => handleChange('metronomeSound', e.target.value)}
                                    className="settings-select"
                                >
                                    <option value="woodblock">Woodblock</option>
                                    <option value="mechanical">Mechanical</option>
                                    <option value="electronic">Elec.</option>
                                    <option value="low-thud">Thud</option>
                                </select>
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
};

export default SettingsPanel;
