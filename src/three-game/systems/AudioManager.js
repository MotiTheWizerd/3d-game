import { CONFIG } from "../config.js";

const STEPS_PER_BAR = 16;
const midiToFreq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

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
 *   player:dashed    -> dash whoosh
 *   coin:collected   -> coin ping
 *   obstacle:smashed -> smash thud
 *   run:started      -> start jingle
 *   run:ended        -> crash (+ best-score chime when isNewBest)
 *   audio:toggle-requested -> flips mute (from HUD button)
 *
 * Music: a synthesized arp/bass loop (CONFIG.audio.music) starts on
 *   run:started and fades out on run:ended. A 25ms lookahead scheduler
 *   queues notes ~120ms ahead on the audio clock, so the loop survives
 *   tab throttling and never drifts.
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

    // Background music loop state (headless-safe: no context -> no timer).
    this.musicPlaying = false;
    this.musicStep = 0;
    this.nextNoteTime = 0;
    this.musicTimer = null;

    this.subscriptions = [
      this.events.on("player:jumped", () => this.playJump()),
      this.events.on("player:lane", () => this.playLane()),
      this.events.on("coin:collected", () => this.playCoin()),
      this.events.on("run:started", () => {
        this.playStart();
        this.startMusic();
      }),
      this.events.on("run:ended", ({ isNewBest } = {}) => {
        this.playCrash(isNewBest);
        this.stopMusic();
      }),
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
    this.stopMusic();
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

      // Music bus — separate gain so the loop can fade in/out on its own.
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = CONFIG.audio.music.volume;
      this.musicGain.connect(this.master);

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

  playDash() {
    if (!this.ensureContext() || this.muted) return;
    const t = this.ctx.currentTime;

    // Band-passed noise sweeping upward — the rush of air.
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(400, t);
    filter.frequency.exponentialRampToValueAtTime(2600, t + 0.3);
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.35, t + 0.05);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    noise.connect(filter).connect(noiseGain).connect(this.master);
    noise.start(t);
    noise.stop(t + 0.4);

    // Rising saw underneath — the "ignite".
    this.sweep({
      type: "sawtooth",
      from: 160,
      to: 520,
      duration: 0.25,
      volume: 0.18,
    });
  }

  playSmash() {
    if (!this.ensureContext() || this.muted) return;
    const t = this.ctx.currentTime;

    // Short bright noise burst — the shatter.
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 900;
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.3, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    noise.connect(filter).connect(noiseGain).connect(this.master);
    noise.start(t);
    noise.stop(t + 0.2);

    // Square drop — the punch.
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.14);
    oscGain.gain.setValueAtTime(0.3, t);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(oscGain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.2);
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

  // ---- background music loop --------------------------------------------

  /**
   * Start the loop. State is set before the context check so the flags
   * stay truthful even headless (no AudioContext -> no scheduler).
   */
  startMusic() {
    this.musicPlaying = true;
    this.musicStep = 0;
    if (!this.ensureContext()) return;

    const t = this.ctx.currentTime;
    this.nextNoteTime = t + 0.05;
    this.musicGain.gain.cancelScheduledValues(t);
    this.musicGain.gain.setValueAtTime(0.0001, t);
    this.musicGain.gain.setTargetAtTime(CONFIG.audio.music.volume, t, 0.25);
    if (!this.musicTimer) {
      this.musicTimer = setInterval(() => this.scheduleMusic(), 25);
    }
    this.scheduleMusic();
  }

  stopMusic() {
    this.musicPlaying = false;
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    if (this.ctx && this.musicGain) {
      const t = this.ctx.currentTime;
      this.musicGain.gain.cancelScheduledValues(t);
      this.musicGain.gain.setTargetAtTime(0.0001, t, 0.2);
    }
  }

  /** Lookahead scheduler: keeps ~120ms of loop queued on the audio clock. */
  scheduleMusic() {
    if (!this.ctx || !this.musicPlaying) return;
    const cfg = CONFIG.audio.music;
    const stepSeconds = 60 / cfg.tempo / 4;
    const totalSteps = STEPS_PER_BAR * cfg.chords.length;
    while (this.nextNoteTime < this.ctx.currentTime + 0.12) {
      this.scheduleMusicStep(this.musicStep, this.nextNoteTime);
      this.nextNoteTime += stepSeconds;
      this.musicStep = (this.musicStep + 1) % totalSteps;
    }
  }

  scheduleMusicStep(step, time) {
    const cfg = CONFIG.audio.music;
    const inBar = step % STEPS_PER_BAR;
    const chord = cfg.chords[Math.floor(step / STEPS_PER_BAR) % cfg.chords.length];

    // Bass: root on every quarter, octave accent picking up the groove.
    if (inBar % 4 === 0) {
      this.musicNote(time, midiToFreq(chord.root), 0.42, "sawtooth", cfg.bassVolume, 420);
    } else if (inBar === 7 || inBar === 15) {
      this.musicNote(time, midiToFreq(chord.root + 12), 0.16, "sawtooth", cfg.bassVolume * 0.8, 420);
    }

    // Arp: a 16th-note run cycling through the chord tones.
    const tone = chord.tones[cfg.arpOrder[inBar % cfg.arpOrder.length]];
    this.musicNote(time, midiToFreq(tone), 0.11, "square", cfg.arpVolume);

    // Closed hat on the off-beats for pulse.
    if (inBar % 4 === 2) this.musicHat(time);
  }

  musicNote(start, freq, duration, type, volume, filterFreq = 0) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    let tail = osc;
    if (filterFreq) {
      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = filterFreq;
      osc.connect(filter);
      tail = filter;
    }
    tail.connect(gain).connect(this.musicGain);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  musicHat(start) {
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 6000;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(CONFIG.audio.music.hatVolume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.04);
    noise.connect(filter).connect(gain).connect(this.musicGain);
    noise.start(start);
    noise.stop(start + 0.05);
  }
}
