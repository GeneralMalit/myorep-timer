class AudioEngine {
    constructor() {
        this.audioCtx = null;
        this.voices = [];
        this.selectedVoice = null;
        this.unlocked = false;
        this.preferredPatterns = ['Google US English', 'Microsoft Aria Online', 'Natural', 'Samantha', 'Google', 'Microsoft'];

        if (typeof window !== 'undefined' && window.speechSynthesis) {
            const loadVoices = () => {
                this.voices = window.speechSynthesis.getVoices();
                console.log(`[AudioEngine] Voices loaded: ${this.voices.length}`);
                this.findPreferredVoice();
            };

            if (window.speechSynthesis.onvoiceschanged !== undefined) {
                window.speechSynthesis.onvoiceschanged = loadVoices;
            }
            loadVoices();
        }
    }

    findPreferredVoice() {
        if (this.voices.length === 0) return;

        for (const pattern of this.preferredPatterns) {
            const voice = this.voices.find(v => v.name.includes(pattern) && v.lang.startsWith('en'));
            if (voice) {
                this.selectedVoice = voice;
                console.log(`[AudioEngine] Preferred voice selected: ${voice.name}`);
                return;
            }
        }

        this.selectedVoice = this.voices.find(v => v.lang.startsWith('en')) || this.voices[0];
        console.log(`[AudioEngine] Fallback voice selected: ${this.selectedVoice ? this.selectedVoice.name : 'None'}`);
    }

    init() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            console.log("[AudioEngine] AudioContext initialized");
        }
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }

        if (!this.unlocked && window.speechSynthesis) {
            console.log("[AudioEngine] Unlocking SpeechSynthesis...");
            const silent = new SpeechSynthesisUtterance(' ');
            silent.volume = 0;
            window.speechSynthesis.speak(silent);
            this.unlocked = true;
            this.voices = window.speechSynthesis.getVoices();
            this.findPreferredVoice();
        }
    }

    playTick(type = 'woodblock') {
        this.init();
        if (!this.audioCtx) return;

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
                osc.stop(now + 0.15);
        }
    }

    speak(text) {
        const msg = text.toString();

        // Check if we have voices available
        if (this.voices.length === 0) {
            this.voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
        }

        // If no voices (Brave issue), use tone fallback immediately
        if (this.voices.length === 0) {
            console.warn("[AudioEngine] No TTS voices, using tone fallback for:", msg);
            this.speakWithTones(text);
            return;
        }

        if (!window.speechSynthesis) {
            this.speakWithTones(text);
            return;
        }

        console.log(`[AudioEngine] Speaking: "${msg}"`);
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(msg);

        if (this.selectedVoice) {
            utterance.voice = this.selectedVoice;
        }

        utterance.rate = 1.15;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        // If speech fails, fall back to tones
        utterance.onerror = (e) => {
            console.error("[AudioEngine] Speech error, using tone fallback:", e);
            this.speakWithTones(text);
        };

        window.speechSynthesis.speak(utterance);
    }

    // Fallback: Generate distinct tones when TTS unavailable
    speakWithTones(text) {
        this.init();
        if (!this.audioCtx) return;

        const num = parseInt(text, 10);

        // Word patterns - different melodies for different words
        const wordPatterns = {
            'Ready': [400, 500, 600],
            'Go': [800, 1000],
            'Rest': [300, 400],
            'Start': [500, 700, 900],
            'Complete': [600, 800, 1000, 1200]
        };

        if (wordPatterns[text]) {
            this.playToneSequence(wordPatterns[text]);
            return;
        }

        // Numbers: different pitch for each
        if (!isNaN(num) && num >= 0 && num <= 60) {
            const baseFreq = 300;
            const freq = baseFreq + (num * 15);
            this.playTone(freq, 0.15);

            // Extra beep for last 3 seconds
            if (num <= 3 && num > 0) {
                setTimeout(() => this.playTone(freq + 200, 0.1), 100);
            }
        }
    }

    playTone(frequency, duration) {
        if (!this.audioCtx) return;

        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(frequency, this.audioCtx.currentTime);

        gain.gain.setValueAtTime(0.5, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + duration);

        osc.start(this.audioCtx.currentTime);
        osc.stop(this.audioCtx.currentTime + duration);
    }

    playToneSequence(frequencies) {
        frequencies.forEach((freq, i) => {
            setTimeout(() => this.playTone(freq, 0.12), i * 120);
        });
    }
}

export const audioEngine = new AudioEngine();
