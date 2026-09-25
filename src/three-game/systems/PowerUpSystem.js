import { CONFIG } from "../config.js";

/**
 * Manages active power-up timers on the player.
 * Tracks which power-ups are currently active, when they expire,
 * and exposes aggregated state for collision / score calculations.
 */
export class PowerUpSystem {
  constructor(events, getNow = null) {
    this.events = events;
    this.active = new Map(); // type → expiry timestamp (ms)
    this.shieldActive = false;
    this._getNow = getNow ?? (() => Date.now());
  }

  /** Activate a power-up for its standard duration. */
  activate(type) {
    if (!CONFIG.powerUps.types[type]) return;

    // Shield is consumable — just set flag, it'll be consumed on crash.
    if (type === "shield") {
      if (this.shieldActive) return; // already have one.
      this.shieldActive = true;
      this.events.emit("powerup:activated", { type, remaining: CONFIG.powerUps.duration });
      return;
    }

    // Timed power-ups replace existing ones of the same type.
    const expiresAt = this._getNow() + CONFIG.powerUps.duration * 1000;
    this.active.set(type, expiresAt);
    this.events.emit("powerup:activated", { type, remaining: CONFIG.powerUps.duration });
  }

  /** Remove a power-up immediately (reset or manual). */
  remove(type) {
    if (type === "shield") {
      this.shieldActive = false;
    } else {
      this.active.delete(type);
    }
    this.events.emit("powerup:expired", { type });
  }

  /** Call every frame to check expirations. Returns expired types. */
  update(dt) {
    const now = this._getNow();
    const expired = [];
    for (const [type, expiresAt] of this.active) {
      if (now >= expiresAt) {
        expired.push(type);
      }
    }
    for (const type of expired) {
      this.active.delete(type);
      this.events.emit("powerup:expired", { type });
    }
    return expired;
  }

  has(type) {
    if (type === "shield") return this.shieldActive;
    return this.active.has(type);
  }

  /** Whether there's any active timed power-up. */
  hasAnyTimed() {
    return this.active.size > 0;
  }

  /** Coin value multiplier (2 if score2x active, 1 otherwise). */
  get coinMultiplier() {
    return this.has("score2x") ? 2 : 1;
  }

  /** Extra magnetic pickup radius if magnet is active. */
  get extraMagnetRadius() {
    return this.has("magnet") ? CONFIG.powerUps.magnetRadius : 0;
  }

  /** Consume the shield on collision (returns true if it was consumed). */
  consumeShield() {
    if (!this.shieldActive) return false;
    this.shieldActive = false;
    return true;
  }

  reset() {
    this.active.clear();
    this.shieldActive = false;
  }
}
