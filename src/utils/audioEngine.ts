export class AudioEngine {
    private audioCtx: AudioContext | null = null;
    private voices: SpeechSynthesisVoice[] = [];
    private selectedVoice: SpeechSynthesisVoice | null = null;
    private unlocked = false;
    private preferredPatterns = ['Google US English', 'Microsoft Aria Online', 'Natural', 'Samantha', 'Google', 'Microsoft'];

    constructor() {
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
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            console.log("[AudioEngine] AudioContext initialized");
        }
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }

        if (!this.unlocked && window.speechSynthesis) {
            console.log("[AudioEngine] Unlocking SpeechSynthesis...");
            const silent = new SpeechSynthesisUtterance(' ');
            silent.volume = 0.001; // Tiny volume to satisfy browser user activation checks
            window.speechSynthesis.speak(silent);
            this.unlocked = true;
            this.voices = window.speechSynthesis.getVoices();
            this.findPreferredVoice();
        }
    }

    playTick(type: string = 'woodblock') {
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

    speak(text: string | number) {
        if (!window.speechSynthesis) return;
        const msg = text.toString();

        if (this.voices.length === 0) {
            this.voices = window.speechSynthesis.getVoices();
            this.findPreferredVoice();
        }

        console.log(`[AudioEngine] Requesting speech: "${msg}"`);

        if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
            window.speechSynthesis.cancel();
        }

        const utterance = new SpeechSynthesisUtterance(msg);

        // If still no voice, wait for onvoiceschanged or try one last time
        if (!this.selectedVoice) {
            this.voices = window.speechSynthesis.getVoices();
            this.findPreferredVoice();
        }

        if (this.selectedVoice) {
            utterance.voice = this.selectedVoice;
        }

        utterance.rate = 1.15;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        utterance.onerror = (e) => {
            console.error("[AudioEngine] Speech error:", e);
        };

        window.speechSynthesis.speak(utterance);
    }

    speakWithTones(_text: string) {
        // Disabled synthesizer sounds as per user request
        return;
    }

}

export const audioEngine = new AudioEngine();
