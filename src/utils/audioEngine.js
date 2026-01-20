class AudioEngine {
    constructor() {
        this.audioCtx = null;
    }

    init() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    playTick(type = 'woodblock') {
        this.init();
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }

        const osc = this.audioCtx.createOscillator();
        const envelope = this.audioCtx.createGain();

        osc.connect(envelope);
        envelope.connect(this.audioCtx.destination);

        const now = this.audioCtx.currentTime;

        switch (type) {
            case 'woodblock':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(1200, now);
                osc.frequency.exponentialRampToValueAtTime(800, now + 0.05);
                envelope.gain.setValueAtTime(0.5, now);
                envelope.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
                osc.start(now);
                osc.stop(now + 0.05);
                break;

            case 'mechanical':
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(800, now);
                envelope.gain.setValueAtTime(0.3, now);
                envelope.gain.linearRampToValueAtTime(0, now + 0.02);
                osc.start(now);
                osc.stop(now + 0.02);
                break;

            case 'electronic':
                osc.type = 'square';
                osc.frequency.setValueAtTime(1500, now);
                envelope.gain.setValueAtTime(0.2, now);
                envelope.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
                osc.start(now);
                osc.stop(now + 0.1);
                break;

            case 'low-thud':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(150, now);
                osc.frequency.exponentialRampToValueAtTime(50, now + 0.1);
                envelope.gain.setValueAtTime(0.8, now);
                envelope.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
                osc.start(now);
                osc.stop(now + 0.15);
                break;

            default:
                osc.type = 'sine';
                osc.frequency.setValueAtTime(1000, now);
                envelope.gain.setValueAtTime(0.3, now);
                envelope.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
                osc.start(now);
                osc.stop(now + 0.1);
        }
    }

    speak(text) {
        if (!window.speechSynthesis) return;

        // Cancel previous speech to avoid queue buildup
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text.toString());

        // Find a natural-sounding voice (e.g., Google or Microsoft if available)
        const voices = window.speechSynthesis.getVoices();

        // Preferred voice patterns for "naturalness"
        const preferred = [
            'Google',
            'Microsoft Online',
            'Natural',
            'Samantha'
        ];

        let selectedVoice = null;
        for (const p of preferred) {
            selectedVoice = voices.find(v => v.name.includes(p) && v.lang.startsWith('en'));
            if (selectedVoice) break;
        }

        if (selectedVoice) {
            utterance.voice = selectedVoice;
        }

        utterance.rate = 1.2; // Slightly faster for responsiveness
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        window.speechSynthesis.speak(utterance);
    }
}

export const audioEngine = new AudioEngine();
