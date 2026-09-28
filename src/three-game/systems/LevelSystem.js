import { CONFIG } from "../config.js";

/**
 * Difficulty ramp — discrete levels riding ON TOP of the continuous ramp
 * (ObstacleSpawner already lerps its spawn interval; Game already accelerates
 * speed). What was missing was *composition*: from second zero a wave could
 * jam two lanes and raise unjumpable walls. Levels gate that:
 *
 *   level 1  single-lane waves, everything jumpable — a warm-up
 *   level 2+ two-lane jams unlock
 *   level 3+ solid 2.6 walls unlock
 *   ...      chances keep hardening up to maxLevel
 *
 * Each crossing emits `level:changed { level, previous }` exactly once —
 * the HUD toast, audio fanfare and camera kick all subscribe; nothing polls.
 *
 * Ticks only while the run is live (Game calls this in PLAYING), so a paused
 * run never bleeds levels. Headless-safe: no THREE, no DOM.
 */
export class LevelSystem {
  constructor(events = null) {
    this.events = events;
    this.reset();
  }

  reset() {
    this.elapsed = 0;
    this.level = 1;
  }

  update(dt) {
    this.elapsed += dt;
    const next = Math.min(
      CONFIG.difficulty.maxLevel,
      1 + Math.floor(this.elapsed / CONFIG.difficulty.levelSeconds)
    );
    if (next === this.level) return;
    const previous = this.level;
    this.level = next;
    this.events?.emit("level:changed", { level: this.level, previous });
  }

  /** Wave-composition knobs for the current level (ObstacleSpawner reads this). */
  get profile() {
    const levels = CONFIG.difficulty.levels;
    return levels[Math.min(this.level, levels.length) - 1];
  }
}