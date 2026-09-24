import { CONFIG } from "../config.js";

/**
 * Synthesized sound effects via WebAudio — no audio assets.
 *
 * Fully event-driven: the game emits, this module listens, so nothing
 * else needs to know audio exists. Safe to construct headless (Node
 * tests): nothing browser-specific happens until a sound plays.
 *
 * Events consumed:
 *   player:jumped    -> jump blip
 *   player:lane      -> lane tick
 *   coin:collected   -> coin ping
 *   run:started      -> start jingle
 *   run:ended        -> crash (+ best-score chime when isNewBest)
 *   audio:toggle-requested -> flips mute (from HUD button)
 *
 * Events produced:
 *   audio:muted-changed { muted }
 */
export class AudioManager {
  constructor(events, storage = null) {
    this.events = events;
    this.storage =
      storage ?? (typeof localStorage !== "undefined" ? localStorage : null);

    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
    this.muted = this.loadMuted();

    this.subscriptions = [
      this.events.on("player:jumped", () => this.playJump()),
      this.events.on("player:lane", () => this.playLane()),
      this.events.on("coin:collected", () => this.playCoin()),
      this.events.on("run:started", () => this.playStart()),
      this.events.on("run:ended", ({ isNewBest } = {}) =>
        this.playCrash(isNewBest)
      ),
      this.events.on("audio:toggle-requested", () => this.toggleMute()),
    ];
  }

  // ---- mute state -------------------------------------------------------

  loadMuted() {
    try {
      return this.storage?.getItem(CONFIG.audio.mutedKey) === "1";
    } catch {
      return false;
    }
  }

  saveMuted() {
    try {
      this.storage?.setItem(CONFIG.audio.mutedKey, this.muted ? "1" : "0");
    } catch {
      // storage unavailable (private mode, etc.) — mute just won't persist
    }
  }

  publishMuteState() {
    this.events.emit("audio:muted-changed", { muted: this.muted });
  }

  toggleMute() {
    this.muted = !this.muted;
    this.saveMuted();
    // Un-muting mid-run should also wake a suspended context up.
    this.ensureContext();
    if (this.master) {
      this.master.gain.setTargetAtTime(
        this.muted ? 0 : CONFIG.audio.masterVolume,
        this.ctx.currentTime,
        0.02
      );
    }
    this.publishMuteState();
  }

  // ---- browser wiring ---------------------------------------------------

  /** Listen for the "M" mute shortcut. Call once from the browser bootstrap. */
  attach(target = window) {
    this.target = target;
    this.onKeyDown = (event) => {
      if (event.code === "KeyM") this.toggleMute();
    };
    target.addEventListener("keydown", this.onKeyDown);
  }

  detach() {
    this.target?.removeEventListener("keydown", this.onKeyDown);
    this.target = null;
  }

  /** Remove every bus subscription (for teardown/tests). */
  destroy() {
    for (const off of this.subscriptions) off();
    this.subscriptions = [];
    this.detach();
  }

  // ---- audio context ----------------------------------------------------

  /**
   * Lazily create the AudioContext on first use — browsers only allow
   * audio after a user gesture, and the first sound always follows one
   * (start click / keypress), so creating + resuming here is allowed.
   */
  ensureContext() {
    if (!this.ctx) {
      const Ctx =
        typeof window !== "undefined"
          ? window.AudioContext || window.webkitAudioContext
          : null;
      if (!Ctx) return null;

      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : CONFIG.audio.masterVolume;
      this.master.connect(this.ctx.destination);
      this.noiseBuffer = this.createNoiseBuffer();
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  }

  createNoiseBuffer() {
    const length = Math.floor(this.ctx.sampleRate * 0.5);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  // ---- one-shot helpers -------------------------------------------------

  /** Fixed-pitch note with fast attack + exponential decay. */
  note(start, freq, duration, type, volume) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(this.master);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  /** Pitch sweep (the workhorse for jump/lanes). */
  sweep({ type, from, to, duration, volume, attack = 0.02 }) {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + duration);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration + 0.08);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.1);
  }

  // ---- sounds -----------------------------------------------------------

  playJump() {
    if (!this.ensureContext() || this.muted) return;
    this.sweep({
      type: "triangle",
      from: 280,
      to: 720,
      duration: 0.14,
      volume: 0.4,
    });
  }

  playLane() {
    if (!this.ensureContext() || this.muted) return;
    this.sweep({
      type: "square",
      from: 520,
      to: 330,
      duration: 0.06,
      volume: 0.12,
    });
  }

  playCoin() {
    if (!this.ensureContext() || this.muted) return;
    // Classic two-note arcade ping: B5 -> E6.
    const t = this.ctx.currentTime;
    this.note(t, 987.77, 0.09, "square", 0.25);
    this.note(t + 0.085, 1318.51, 0.24, "square", 0.25);
  }

  playStart() {
    if (!this.ensureContext() || this.muted) return;
    const t = this.ctx.currentTime;
    this.note(t, 440.0, 0.08, "triangle", 0.3);
    this.note(t + 0.07, 554.37, 0.08, "triangle", 0.3);
    this.note(t + 0.14, 659.25, 0.2, "triangle", 0.3);
  }

  playCrash(withBestChime = false) {
    if (!this.ensureContext() || this.muted) return;
    const t = this.ctx.currentTime;

    // Noise burst through a closing lowpass — the "impact".
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1400, t);
    filter.frequency.exponentialRampToValueAtTime(100, t + 0.45);
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.5, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    noise.connect(filter).connect(noiseGain).connect(this.master);
    noise.start(t);
    noise.stop(t + 0.5);

    // Saw dropping two octaves — the "thud".
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.4);
    oscGain.gain.setValueAtTime(0.4, t);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    osc.connect(oscGain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.5);

    // Little victory arpeggio once the dust settles.
    if (withBestChime) {
      const base = t + 0.55;
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        this.note(base + i * 0.09, freq, i === 3 ? 0.4 : 0.15, "sine", 0.25);
      });
    }
  }
}
