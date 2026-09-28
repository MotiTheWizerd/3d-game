import { CONFIG } from "../config.js";

/**
 * Camera juice — event-driven, like every other system.
 *   player:crashed -> trauma shake (offset scales with trauma^2)
 *   player:dashed  -> FOV punch, eased back exponentially
 *   level:changed  -> FOV punch too (level-up kick)
 *
 * The game camera is otherwise static, so the base position/quaternion/fov
 * are captured at construction and restored whenever idle. Shake offsets
 * use sin/cos of accumulated time (deterministic — testable, no RNG).
 *
 * Headless-safe: pure math on plain THREE objects.
 */
export class CameraFX {
  constructor(camera, events = null) {
    this.camera = camera;
    this.basePosition = camera.position.clone();
    this.baseQuaternion = camera.quaternion.clone();
    this.baseFov = camera.fov;

    this.trauma = 0;
    this.fovBoost = 0;
    this.time = 0;

    this.subscriptions = events
      ? [
          events.on("player:crashed", () => this.addShake(1)),
          events.on("player:dashed", () => this.punchFov()),
          events.on("level:changed", () => this.punchFov()),
        ]
      : [];
  }

  get shaking() {
    return this.trauma > 0;
  }

  addShake(amount) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  punchFov() {
    this.fovBoost = CONFIG.fx.camera.fovPunch;
  }

  update(dt) {
    const cfg = CONFIG.fx.camera;
    this.time += dt;
    this.trauma = Math.max(0, this.trauma - dt * cfg.shakeDecay);
    this.fovBoost = Math.max(
      0,
      this.fovBoost * Math.exp(-cfg.fovDecay * dt) - 1e-4
    );

    if (this.trauma === 0 && this.fovBoost === 0) {
      this.restoreBase();
      return;
    }

    const s = this.trauma * this.trauma;
    const t = this.time * cfg.shakeFrequency;
    const { shakeMaxOffset, shakeMaxRoll } = cfg;
    this.camera.position.set(
      this.basePosition.x + Math.sin(t) * s * shakeMaxOffset,
      this.basePosition.y + Math.cos(t * 1.7) * s * shakeMaxOffset,
      this.basePosition.z + Math.sin(t * 1.3) * s * shakeMaxOffset * 0.6
    );
    this.camera.quaternion.copy(this.baseQuaternion);
    this.camera.rotateZ(Math.sin(t * 2.1) * s * shakeMaxRoll);
    this.camera.fov = this.baseFov + this.fovBoost;
    this.camera.updateProjectionMatrix();
  }

  restoreBase() {
    this.camera.position.copy(this.basePosition);
    this.camera.quaternion.copy(this.baseQuaternion);
    if (this.camera.fov !== this.baseFov) {
      this.camera.fov = this.baseFov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Snap back to base (new run). */
  reset() {
    this.trauma = 0;
    this.fovBoost = 0;
    this.restoreBase();
  }

  destroy() {
    for (const off of this.subscriptions) off();
    this.subscriptions.length = 0;
  }
}