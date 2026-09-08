export type SoundKey = "failed" | "rifle" | "cannon" | "artillery" | "missile" | "jet" | "prop" | "blast" | "confirm" | "upgrade" | "alarm";

/** Procedural, sample-free battlefield Foley. A single output bus limits the
 * entire mix; weapon events have stereo position, pitch variation and room tails. */
export class BattleAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private dry: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private sources = new Set<AudioScheduledSourceNode>();
  private voices = 0;
  private lastPlayed = new Map<SoundKey, number>();
  private enabled = true;
  private volume = .65;

  setEnabled(value: boolean) { this.enabled = value; this.updateGain(); }
  setVolume(value: number) { this.volume = Math.max(0, Math.min(1, value)); this.updateGain(); }
  private updateGain() {
    if (this.master && this.context) this.master.gain.setTargetAtTime(this.enabled ? this.volume : 0, this.context.currentTime, .015);
  }

  unlock() {
    if (!this.enabled) return;
    if (!this.context) {
      const Constructor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Constructor) return;
      try { this.context = new Constructor(); } catch { return; }
      const ctx = this.context;
      this.master = ctx.createGain(); this.master.gain.value = this.volume;
      this.dry = ctx.createGain(); this.dry.gain.value = .8;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -14; limiter.knee.value = 10; limiter.ratio.value = 12;
      limiter.attack.value = .002; limiter.release.value = .18;
      this.dry.connect(limiter); limiter.connect(this.master); this.master.connect(ctx.destination);
      this.reverb = ctx.createConvolver();
      const impulse = ctx.createBuffer(2, Math.ceil(ctx.sampleRate * 1.35), ctx.sampleRate);
      for (let channel = 0; channel < 2; channel++) {
        const data = impulse.getChannelData(channel);
        for (let i = 0; i < data.length; i++) {
          const t = i / ctx.sampleRate;
          data[i] = t < .045 ? 0 : (Math.random() * 2 - 1) * Math.exp(-t * 5.5) * .22;
        }
      }
      this.reverb.buffer = impulse;
      const wet = ctx.createGain(); wet.gain.value = .24;
      this.reverb.connect(wet); wet.connect(limiter);
      this.noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
      const samples = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    }
    if (this.context.state === "suspended") void this.context.resume().catch(() => {});
  }

  play(kind: SoundKey, worldX = 500) {
    if (!this.enabled || this.volume === 0) return;
    this.unlock();
    const ctx = this.context;
    if (!ctx || ctx.state !== "running" || !this.dry || !this.reverb || !this.noiseBuffer) return;
    const now = ctx.currentTime;
    const ui = ["confirm", "upgrade", "alarm", "failed"].includes(kind);
    if (!ui && (this.voices >= 24 || now - (this.lastPlayed.get(kind) ?? -10) < (kind === "rifle" ? .045 : .065))) return;
    this.lastPlayed.set(kind, now); this.voices++;
    const gain = ctx.createGain(); gain.gain.value = ui ? .55 : .9;
    const pan = ctx.createStereoPanner();
    const initialPan = ui ? 0 : Math.max(-.85, Math.min(.85, worldX / 500 - 1));
    pan.pan.setValueAtTime(initialPan, now);
    gain.connect(pan); pan.connect(this.dry); if (!ui) pan.connect(this.reverb);
    const variation = .92 + Math.random() * .16;
    let pending = 0;
    const connectSource = (source: AudioScheduledSourceNode, nodes: AudioNode[], begins: number, ends: number) => {
      pending++; this.sources.add(source);
      source.onended = () => {
        this.sources.delete(source); source.disconnect(); nodes.forEach(n => n.disconnect());
        if (--pending === 0) { gain.disconnect(); pan.disconnect(); this.voices = Math.max(0, this.voices - 1); }
      };
      source.start(begins); source.stop(ends);
    };
    const envelope = (duration: number, volume: number, delay: number, attack: number) => {
      const env = ctx.createGain(), start = now + delay;
      env.gain.setValueAtTime(.0001, start);
      env.gain.exponentialRampToValueAtTime(volume, start + Math.min(duration / 3, attack));
      env.gain.exponentialRampToValueAtTime(.0001, start + duration); env.connect(gain);
      return env;
    };
    const tone = (start: number, end: number, duration: number, volume: number, delay = 0, type: OscillatorType = "sine", attack = .003) => {
      const source = ctx.createOscillator(), env = envelope(duration, volume, delay, attack);
      source.type = type; source.frequency.setValueAtTime(start * variation, now + delay);
      source.frequency.exponentialRampToValueAtTime(Math.max(20, end * variation), now + delay + duration);
      source.connect(env); connectSource(source, [env], now + delay, now + delay + duration);
    };
    const noise = (duration: number, volume: number, frequency: number, end: number, delay = 0, type: BiquadFilterType = "lowpass", attack = .003) => {
      const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), env = envelope(duration, volume, delay, attack);
      source.buffer = this.noiseBuffer; source.playbackRate.value = variation;
      filter.type = type; filter.Q.value = type === "bandpass" ? .9 : .7;
      filter.frequency.setValueAtTime(frequency * variation, now + delay);
      filter.frequency.exponentialRampToValueAtTime(Math.max(25, end), now + delay + duration);
      source.connect(filter); filter.connect(env); connectSource(source, [filter, env], now + delay, now + delay + duration);
    };
    if (kind === "rifle") {
      for (let i = 0; i < 3; i++) {
        const delay = i * .063;
        noise(.04, .17 / (1 + i * .2), 6200, 1600, delay, "highpass");
        tone(240, 70, .07, .1, delay, "triangle");
        noise(.025, .05, 2800, 1300, delay + .03, "bandpass");
      }
      noise(.35, .035, 1200, 150, .08);
    } else if (["cannon", "artillery", "blast"].includes(kind)) {
      const artillery = kind === "artillery", length = artillery ? 1.35 : .85;
      noise(.045, .24, 6500, 900, 0, "highpass");
      noise(length, .34, 1700, 55, .015);
      tone(artillery ? 115 : 155, 27, length, .34);
      tone(58, 23, length * 1.25, .11, .05, "triangle");
      for (let i = 0; i < 5; i++) noise(.09, .04, 2400, 800, .12 + i * .067, "bandpass");
      if (artillery) { noise(.6, .055, 630, 90, .32); tone(68, 29, .55, .04, .35); }
    } else if (kind === "missile") {
      noise(.05, .12, 4500, 1000, 0, "highpass");
      noise(.65, .19, 900, 3600, .015, "bandpass", .08);
      tone(150, 430, .5, .055, .01, "sawtooth", .05);
      noise(.65, .07, 2200, 350, .3, "bandpass");
      pan.pan.linearRampToValueAtTime(initialPan * .6, now + .8);
    } else if (kind === "jet") {
      noise(1.5, .15, 320, 2400, 0, "bandpass", .2);
      noise(1.5, .065, 1800, 5000, .05, "highpass", .25);
      tone(90, 240, 1.25, .065, 0, "sawtooth", .16);
      tone(680, 260, 1.45, .033, .1, "sine", .2);
      pan.pan.linearRampToValueAtTime(-initialPan, now + 1.4);
    } else if (kind === "prop") {
      noise(1.2, .09, 350, 650, 0, "bandpass", .12);
      for (let i = 0; i < 14; i++) { noise(.06, .07, 340, 180, i * .075); tone(90, 57, .06, .045, i * .075, "triangle"); }
    } else if (kind === "upgrade") {
      [440, 554, 659, 880].forEach((f, i) => tone(f, f, .18, .08, i * .07));
      noise(.15, .04, 3000, 600, 0, "bandpass");
    } else if (kind === "confirm") {
      tone(660, 660, .09, .08); tone(990, 990, .13, .05, .06);
      noise(.018, .04, 1700, 1700, 0, "bandpass");
    } else if (kind === "alarm") {
      for (let i = 0; i < 3; i++) tone(490, 340, .17, .12, i * .2, "triangle");
    } else {
      tone(170, 76, .18, .12, 0, "triangle"); noise(.12, .045, 780, 150, 0, "bandpass");
    }
  }

  dispose() {
    this.sources.forEach(source => { try { source.stop(); } catch { /* Already ended. */ } });
    this.sources.clear();
    if (this.context) void this.context.close().catch(() => {});
    this.context = null; this.master = null; this.dry = null; this.reverb = null; this.noiseBuffer = null;
    this.voices = 0; this.lastPlayed.clear();
  }
}
