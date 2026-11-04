export type Sfx = 'hoe' | 'water' | 'plant' | 'harvest' | 'coin' | 'fail' | 'ui' | 'sleep' | 'cast' | 'bite' | 'catch';

// Local synthesized placeholders: no downloaded audio or external service.
class AudioManager {
  private context?: AudioContext;
  private master?: GainNode;
  private rain?: AudioBufferSourceNode;
  private rainWanted = false;
  private muted = false;
  private volume = 1;
  private last = new Map<Sfx, number>();

  get settings() { return { muted: this.muted, volume: this.volume }; }
  setVolume(value: number): boolean {
    if (!Number.isFinite(value)) return false;
    this.volume = Math.max(0, Math.min(1, value));
    this.sync();
    return this.saveSettings();
  }
  setMuted(value: boolean): boolean {
    this.muted = value;
    this.sync();
    window.dispatchEvent(new CustomEvent('farm-mute', { detail: this.muted }));
    return this.saveSettings();
  }
  private saveSettings(): boolean {
    try { localStorage.setItem('my-farm-game:audio:v1', JSON.stringify(this.settings)); return true; }
    catch { return false; }
  }

  install(): () => void {
    try {
      const saved = JSON.parse(localStorage.getItem('my-farm-game:audio:v1') ?? 'null');
      if (typeof saved?.muted === 'boolean') this.muted = saved.muted;
      if (typeof saved?.volume === 'number' && Number.isFinite(saved.volume)) this.volume = Math.max(0, Math.min(1, saved.volume));
    } catch { /* Keep defaults when settings storage is unavailable. */ }
    const unlock = () => {
      try {
        if (!this.context) {
          this.context = new AudioContext();
          this.master = this.context.createGain();
          this.master.connect(this.context.destination);
        }
        void this.context.resume().then(() => this.sync()).catch(() => {});
      } catch { /* Unsupported audio must not interrupt gameplay. */ }
    };
    const key = (e: KeyboardEvent) => {
      unlock();
      if ((e.code === 'Digit0' || e.code === 'Numpad0') && !e.repeat && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (!(e.target instanceof HTMLInputElement)) this.setMuted(!this.muted);
      }
    };
    const visibility = () => this.sync();
    window.addEventListener('keydown', key, true);
    window.addEventListener('pointerdown', unlock, true);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('pointerdown', unlock, true);
      document.removeEventListener('visibilitychange', visibility);
      this.setRain(false);
      void this.context?.close();
      this.context = undefined;
      this.master = undefined;
      this.last.clear();
    };
  }

  private sync() {
    if (!this.context || !this.master) return;
    this.master.gain.setTargetAtTime(this.muted || document.hidden ? 0 : 0.35 * this.volume, this.context.currentTime, 0.02);
    if (this.rainWanted && !this.rain && this.context.state === 'running') {
      this.rain = this.noise(2, 0.03, true);
    }
  }

  setRain(value: boolean) {
    if (this.rainWanted === value) return;
    this.rainWanted = value;
    if (!value && this.rain) { this.rain.stop(); this.rain = undefined; }
    this.sync();
  }

  private noise(seconds: number, volume: number, loop = false) {
    const ctx = this.context!;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * (loop ? 1 : 1 - i / samples.length);
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = loop ? 1800 : 1000;
    const gain = ctx.createGain(); gain.gain.value = volume;
    source.buffer = buffer; source.loop = loop;
    source.connect(filter); filter.connect(gain); gain.connect(this.master!);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
    source.start();
    return source;
  }

  play(key: Sfx) {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running' || this.muted || document.hidden) return;
    const now = ctx.currentTime;
    if (now - (this.last.get(key) ?? -Infinity) < (key === 'fail' ? 0.25 : 0.08)) return;
    this.last.set(key, now);
    if (key === 'hoe' || key === 'water') this.noise(key === 'hoe' ? 0.12 : 0.35, 0.3);
    const notes: Record<Sfx, number[]> = {
      cast: [300, 180], bite: [1100, 1500], catch: [523, 784, 1046],
      hoe: [110], water: [420, 560], plant: [330, 440], harvest: [523, 784],
      coin: [1046, 1318], fail: [180, 140], ui: [660], sleep: [523, 659, 784, 523],
    };
    const duration = key === 'sleep' ? 0.3 : 0.09;
    notes[key].forEach((frequency, i) => {
      const start = now + i * duration;
      const oscillator = ctx.createOscillator(), gain = ctx.createGain();
      oscillator.type = key === 'fail' ? 'triangle' : 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.22, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      oscillator.connect(gain); gain.connect(this.master!);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(start); oscillator.stop(start + duration + 0.01);
    });
  }
}
export const audio = new AudioManager();

