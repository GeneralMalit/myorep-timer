export class AudioEngine {
    private audioCtx: AudioContext | null = null;
    private voices: SpeechSynthesisVoice[] = [];
    private selectedVoice: SpeechSynthesisVoice | null = null;
    private scheduledTickNodes: Array<{ oscillator: OscillatorNode; envelope: GainNode }> = [];
    private unlocked = false;
    private preferredPatterns = ['Google US English', 'Microsoft Aria Online', 'Natural', 'Samantha', 'Google', 'Microsoft'];
    private readonly defaultLang = 'en-US';

    private get speech(): SpeechSynthesis | null {
        if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
            return null;
        }

        return window.speechSynthesis;
    }

    private get AudioContextCtor(): typeof AudioContext | null {
        if (typeof window === 'undefined') {
            return null;
        }

        return window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ?? null;
    }

    private isDocumentHidden(): boolean {
        if (typeof document === 'undefined') {
            return false;
        }

        return document.hidden || document.visibilityState === 'hidden';
    }

    constructor() {
        if (this.speech) {
            const loadVoices = () => {
                this.voices = this.speech?.getVoices() ?? [];
                console.log(`[AudioEngine] Voices loaded: ${this.voices.length}`);
                this.findPreferredVoice();
            };

            if (this.speech.onvoiceschanged !== undefined) {
                this.speech.onvoiceschanged = loadVoices;
            }
            loadVoices();
        }
    }

    private findPreferredVoice() {
        if (this.voices.length === 0) {
            console.log("[AudioEngine] No voices loaded yet, waiting...");
            return;
        }

        for (const pattern of this.preferredPatterns) {
            const voice = this.voices.find(v => v.name.includes(pattern) && (v.lang.startsWith('en') || v.lang.startsWith('EN')));
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
        if (this.isDocumentHidden()) {
            return;
        }

        const audioContextCtor = this.AudioContextCtor;
        if (!this.audioCtx && audioContextCtor) {
            try {
                this.audioCtx = new audioContextCtor();
                console.log("[AudioEngine] AudioContext initialized");
            } catch (error) {
                console.error("[AudioEngine] AudioContext failed to initialize:", error);
            }
        }

        if (this.audioCtx?.state === 'suspended') {
            void this.audioCtx.resume().catch((error) => {
                console.error("[AudioEngine] AudioContext resume failed:", error);
            });
        }

        if (!this.unlocked && this.audioCtx) {
            try {
                // Warm the context with a near-silent buffer so iOS WebViews treat the
                // gesture that called init() as real playback.
                const buffer = this.audioCtx.createBuffer(1, 1, 22050);
                const source = this.audioCtx.createBufferSource();
                const gain = this.audioCtx.createGain();
                gain.gain.value = 0.0001;
                source.buffer = buffer;
                source.connect(gain);
                gain.connect(this.audioCtx.destination);
                source.start(0);
            } catch (error) {
                console.error("[AudioEngine] Audio warmup failed:", error);
            }
        }

        if (!this.unlocked && this.speech) {
            console.log("[AudioEngine] Unlocking SpeechSynthesis...");
            const silent = new SpeechSynthesisUtterance(' ');
            silent.lang = this.defaultLang;
            silent.volume = 0.001; // Tiny volume to satisfy browser user activation checks
            this.speech.cancel();
            this.speech.speak(silent);
            this.unlocked = true;
            this.voices = this.speech.getVoices();
            this.findPreferredVoice();
        } else if (this.audioCtx) {
            this.unlocked = true;
        }
    }

    playTick(type: string = 'woodblock') {
        if (this.isDocumentHidden()) return;

        this.init();
        if (!this.audioCtx) return;

        this.scheduleTickAt(type, this.audioCtx.currentTime);
    }

    scheduleTickSequence(type: string = 'woodblock', offsetsSeconds: number[]) {
        if (this.isDocumentHidden()) return;

        this.init();
        if (!this.audioCtx) return;

        this.cancelScheduledTicks();
        const now = this.audioCtx.currentTime;

        for (const offset of offsetsSeconds) {
            if (!Number.isFinite(offset) || offset < 0) {
                continue;
            }

            this.scheduledTickNodes.push(this.scheduleTickAt(type, now + offset));
        }
    }

    cancelScheduledTicks() {
        for (const node of this.scheduledTickNodes) {
            try {
                node.oscillator.stop();
            } catch {
                // Already-started or already-stopped nodes can throw in some browsers.
            }

            try {
                node.oscillator.disconnect();
                node.envelope.disconnect();
            } catch {
                // Disconnect is best-effort cleanup.
            }
        }

        this.scheduledTickNodes = [];
    }

    private scheduleTickAt(type: string, startTime: number): { oscillator: OscillatorNode; envelope: GainNode } {
        if (!this.audioCtx) {
            throw new Error('AudioContext is not initialized.');
        }

        const osc = this.audioCtx.createOscillator();
        const envelope = this.audioCtx.createGain();

        osc.connect(envelope);
        envelope.connect(this.audioCtx.destination);

        switch (type) {
            case 'woodblock':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(1200, startTime);
                osc.frequency.exponentialRampToValueAtTime(800, startTime + 0.05);
                envelope.gain.setValueAtTime(0.5, startTime);
                envelope.gain.exponentialRampToValueAtTime(0.01, startTime + 0.05);
                osc.start(startTime);
                osc.stop(startTime + 0.05);
                break;
            case 'mechanical':
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(800, startTime);
                envelope.gain.setValueAtTime(0.3, startTime);
                envelope.gain.linearRampToValueAtTime(0, startTime + 0.02);
                osc.start(startTime);
                osc.stop(startTime + 0.02);
                break;
            case 'electronic':
                osc.type = 'square';
                osc.frequency.setValueAtTime(1500, startTime);
                envelope.gain.setValueAtTime(0.2, startTime);
                envelope.gain.exponentialRampToValueAtTime(0.01, startTime + 0.1);
                osc.start(startTime);
                osc.stop(startTime + 0.1);
                break;
            case 'low-thud':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(150, startTime);
                osc.frequency.exponentialRampToValueAtTime(50, startTime + 0.1);
                envelope.gain.setValueAtTime(0.8, startTime);
                envelope.gain.exponentialRampToValueAtTime(0.01, startTime + 0.15);
                osc.start(startTime);
                osc.stop(startTime + 0.15);
                break;
            default:
                osc.type = 'sine';
                osc.frequency.setValueAtTime(1000, startTime);
                envelope.gain.setValueAtTime(0.3, startTime);
                envelope.gain.exponentialRampToValueAtTime(0.01, startTime + 0.1);
                osc.start(startTime);
                osc.stop(startTime + 0.15);
        }

        return { oscillator: osc, envelope };
    }

    cancelSpeech() {
        if (!this.speech) return;

        try {
            this.speech.cancel();
        } catch (error) {
            console.error("[AudioEngine] Speech cancellation failed:", error);
        }
    }

    speak(text: string | number) {
        if (!this.speech || this.isDocumentHidden()) return;

        this.init();
        const msg = text.toString();

        if (this.voices.length === 0) {
            this.voices = this.speech.getVoices();
            this.findPreferredVoice();
        }

        console.log(`[AudioEngine] Requesting speech: "${msg}"`);

        if (this.speech.speaking || this.speech.pending) {
            this.speech.cancel();
        }

        const utterance = new SpeechSynthesisUtterance(msg);

        // If still no voice, wait for onvoiceschanged or try one last time
        if (!this.selectedVoice) {
            this.voices = this.speech.getVoices();
            this.findPreferredVoice();
        }

        if (this.selectedVoice) {
            utterance.voice = this.selectedVoice;
            utterance.lang = this.selectedVoice.lang || this.defaultLang;
        }

        utterance.lang = utterance.lang || this.defaultLang;
        utterance.rate = /iP(hone|ad|od)/i.test(typeof navigator === 'undefined' ? '' : navigator.userAgent) ? 1.05 : 1.15;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        utterance.onerror = (e) => {
            if (e.error === 'canceled' || e.error === 'interrupted') {
                return;
            }
            console.error("[AudioEngine] Speech error:", e);
        };

        try {
            this.speech.speak(utterance);
        } catch (error) {
            console.error("[AudioEngine] Speech dispatch failed:", error);
        }
    }

    speakWithTones(_text: string) {
        // Disabled synthesizer sounds as per user request
        return;
    }

}

export const audioEngine = new AudioEngine();
