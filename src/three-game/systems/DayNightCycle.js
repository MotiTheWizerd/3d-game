import { CONFIG } from "../config.js";

/**
 * Day/night cycle — the sky clock.
 *
 * Owns TIME and LOOK, never meshes: `update(dt)` advances `phase` (0..1,
 * one full day = CONFIG.dayNight.cycleSeconds of run time), then interpolates
 * the palette between CONFIG.dayNight.keyframes into a plain-data `state`
 * (hex colors + intensities). World.applyCycle paints that state onto the
 * scene. When phase crosses a keyframe boundary, `daynight:phase` carries the
 * new segment's snapshot to the HUD.
 *
 * Headless-safe: no THREE, no DOM, no timers — plain math on plain data, so
 * the whole cycle is testable without a renderer.
 *
 * Layout: each keyframe marks the START of its segment (at: 0 = dawn begins).
 * A segment lerps from its keyframe's look toward the next keyframe's look,
 * wrapping around at 1.0. A frame that crosses more than one boundary (a huge
 * dt) announces only the final segment — irrelevant in practice, since the
 * engine clamps dt at 0.05s.
 */

const RGB_FIELDS = ["sky", "fog", "hemiSky", "hemiGround", "dirColor"];
const NUM_FIELDS = ["fogNear", "fogFar", "hemi", "dir", "rim", "edgeGlow", "night"];

/** 0xRRGGBB -> [r, g, b] in 0..1 */
function rgbOf(hex) {
  return [
    ((hex >> 16) & 255) / 255,
    ((hex >> 8) & 255) / 255,
    (hex & 255) / 255,
  ];
}

/** [r, g, b] in 0..1 -> 0xRRGGBB, clamped to the byte grid */
function hexOf(rgb) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return (c(rgb[0]) << 16) | (c(rgb[1]) << 8) | c(rgb[2]);
}

export class DayNightCycle {
  constructor(events = null) {
    this.events = events;
    this.keys = CONFIG.dayNight.keyframes.map((k) => ({
      at: k.at,
      name: k.name,
      glyph: k.glyph ?? "",
      ...Object.fromEntries(RGB_FIELDS.map((f) => [f, rgbOf(k[f])])),
      ...Object.fromEntries(NUM_FIELDS.map((f) => [f, k[f]])),
    }));
    this.reset();
  }

  reset() {
    this.phase = ((CONFIG.dayNight.startPhase % 1) + 1) % 1;
    this.lastSegment = this.segmentIndexAt(this.phase);
    this.state = this.snapshot();
  }

  /** Index of the segment `phase` sits in: the last key with at <= phase. */
  segmentIndexAt(phase) {
    for (let i = this.keys.length - 1; i >= 0; i--) {
      if (this.keys[i].at <= phase) return i;
    }
    return 0;
  }

  update(dt) {
    if (!(dt > 0)) return;
    this.phase = (this.phase + dt / CONFIG.dayNight.cycleSeconds) % 1;

    const next = this.segmentIndexAt(this.phase);
    if (next !== this.lastSegment) {
      this.lastSegment = next;
      this.state = this.snapshot();
      this.events?.emit("daynight:phase", this.state);
      return;
    }
    this.state = this.snapshot();
  }

  /** The look at the current phase: keyframe i's values lerped toward i+1. */
  snapshot() {
    const i = this.segmentIndexAt(this.phase);
    const a = this.keys[i];
    const b = this.keys[(i + 1) % this.keys.length];
    const span = (i + 1 < this.keys.length ? b.at : b.at + 1) - a.at;
    const t = Math.min(1, Math.max(0, (this.phase - a.at) / (span || 1)));

    const lerp = (x, y) => x + (y - x) * t;
    const state = { phase: this.phase, name: a.name, glyph: a.glyph };
    for (const f of NUM_FIELDS) state[f] = lerp(a[f], b[f]);
    for (const f of RGB_FIELDS) {
      state[f] = hexOf([lerp(a[f][0], b[f][0]), lerp(a[f][1], b[f][1]), lerp(a[f][2], b[f][2])]);
    }
    return state;
  }
}
