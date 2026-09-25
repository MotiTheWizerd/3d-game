import * as THREE from "three";
import { CONFIG } from "../config.js";

/**
 * Pooled GPU particles — no assets, one THREE.Points draw call for the
 * whole system. Slots live in flat Float32Arrays; dead slots are parked
 * off-screen with zero size/color.
 *
 * Event-driven like AudioManager: the game emits, this listens.
 *   coin:collected    { position } -> gold sparkle burst
 *   obstacle:smashed  { position } -> orange shrapnel burst
 *   player:crashed    { position } -> big red explosion
 *
 * The dash trail is a direct call (trail()) from the Game loop because it
 * needs the player's live position every frame.
 *
 * Fade trick: additive blending makes black invisible, so particles fade
 * by scaling their color toward zero as life runs out — no alpha buffer.
 *
 * Headless-safe: constructing allocates buffers only; nothing renders
 * until the browser draw loop touches it.
 */
const OFFSCREEN_Y = -9999;
const tmpOrigin = new THREE.Vector3();

export class ParticleSystem {
  constructor(scene, events = null) {
    this.scene = scene;
    this.max = CONFIG.fx.particles.max;
    this.count = 0; // live particles
    this.nextSlot = 0; // rotating cursor for free-slot search
    this.trailTimer = 0;

    // Per-slot state (flat arrays, index i / i*3).
    this.positions = new Float32Array(this.max * 3);
    this.colors = new Float32Array(this.max * 3);
    this.baseColors = new Float32Array(this.max * 3);
    this.sizes = new Float32Array(this.max);
    this.velocities = new Float32Array(this.max * 3);
    this.lives = new Float32Array(this.max);
    this.maxLives = new Float32Array(this.max);
    this.gravities = new Float32Array(this.max);
    this.drags = new Float32Array(this.max);

    for (let i = 0; i < this.max; i++) {
      this.positions[i * 3 + 1] = OFFSCREEN_Y;
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.positions, 3).setUsage(
        THREE.DynamicDrawUsage
      )
    );
    this.geometry.setAttribute(
      "aColor",
      new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage)
    );
    this.geometry.setAttribute(
      "aSize",
      new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage)
    );

    this.material = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute vec3 aColor;
        varying vec3 vColor;
        void main() {
          vColor = aColor;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (240.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        void main() {
          float m = smoothstep(0.5, 0.1, length(gl_PointCoord - vec2(0.5)));
          gl_FragColor = vec4(vColor, m);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);

    // Optional-chaining guards: legacy emits may pass null payloads.
    this.subscriptions = events
      ? [
          events.on("coin:collected", (payload) => {
            if (payload?.position) this.burst(payload.position, CONFIG.fx.particles.coin);
          }),
          events.on("obstacle:smashed", (payload) => {
            if (payload?.position) this.burst(payload.position, CONFIG.fx.particles.smash);
          }),
          events.on("player:crashed", (payload) => {
            if (payload?.position) this.burst(payload.position, CONFIG.fx.particles.crash);
          }),
        ]
      : [];
  }

  get aliveCount() {
    return this.count;
  }

  /** One-shot explosion at `origin` using a CONFIG.fx.particles preset. */
  burst(origin, preset) {
    for (let n = 0; n < preset.count; n++) this.spawn(origin, preset);
  }

  /**
   * Dash trail: called every frame while dashing. Emits in small ticks
   * (emitInterval) so the streak reads as ribbons, not a wall of dots.
   */
  trail(origin, speed, dt) {
    const preset = CONFIG.fx.particles.trail;
    this.trailTimer += dt;
    if (this.trailTimer < preset.emitInterval) return;
    this.trailTimer = 0;

    for (let n = 0; n < preset.count; n++) {
      const jitter = (Math.random() * 2 - 1) * 0.45;
      tmpOrigin.set(
        origin.x + jitter,
        origin.y + jitter * 0.4,
        origin.z + 0.55
      );
      const slot = this.findFreeSlot();
      if (slot < 0) return;
      this.initSlot(slot, tmpOrigin, preset);
      // Mostly backward drift (+z) so the streak peels off behind the runner.
      this.velocities[slot * 3] = jitter * 1.5;
      this.velocities[slot * 3 + 1] = 0.6 + Math.random() * 0.8;
      this.velocities[slot * 3 + 2] = speed * 0.3 + Math.random() * preset.speed;
    }
  }

  spawn(origin, preset) {
    const slot = this.findFreeSlot();
    if (slot < 0) return; // pool full — drop, never throw
    this.initSlot(slot, origin, preset);

    // Random direction on a unit sphere, speed variance, upward bias.
    const u = Math.random() * 2 - 1;
    const phi = Math.random() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    const speed =
      preset.speed * (1 - preset.speedVariance * Math.random());
    this.velocities[slot * 3] = r * Math.cos(phi) * speed;
    this.velocities[slot * 3 + 1] = u * speed + preset.upBias * speed;
    this.velocities[slot * 3 + 2] = r * Math.sin(phi) * speed;
  }

  findFreeSlot() {
    for (let n = 0; n < this.max; n++) {
      const i = (this.nextSlot + n) % this.max;
      if (this.lives[i] <= 0) {
        this.nextSlot = (i + 1) % this.max;
        return i;
      }
    }
    return -1;
  }

  initSlot(slot, origin, preset) {
    const i3 = slot * 3;
    this.positions[i3] = origin.x;
    this.positions[i3 + 1] = origin.y;
    this.positions[i3 + 2] = origin.z;

    const hex = preset.colors[slot % preset.colors.length];
    this.baseColors[i3] = ((hex >> 16) & 255) / 255;
    this.baseColors[i3 + 1] = ((hex >> 8) & 255) / 255;
    this.baseColors[i3 + 2] = (hex & 255) / 255;

    this.sizes[slot] = preset.size;
    this.lives[slot] = preset.life;
    this.maxLives[slot] = preset.life;
    this.gravities[slot] = preset.gravity;
    this.drags[slot] = preset.drag;
    this.count += 1;
  }

  update(dt) {
    if (this.count === 0) return;

    for (let i = 0; i < this.max; i++) {
      if (this.lives[i] <= 0) continue;
      this.lives[i] -= dt;
      if (this.lives[i] <= 0) {
        this.killSlot(i);
        continue;
      }
      const i3 = i * 3;
      if (this.drags[i] > 0) {
        const f = Math.max(0, 1 - this.drags[i] * dt);
        this.velocities[i3] *= f;
        this.velocities[i3 + 1] *= f;
        this.velocities[i3 + 2] *= f;
      }
      this.velocities[i3 + 1] += this.gravities[i] * dt;
      this.positions[i3] += this.velocities[i3] * dt;
      this.positions[i3 + 1] += this.velocities[i3 + 1] * dt;
      this.positions[i3 + 2] += this.velocities[i3 + 2] * dt;

      const fade = this.lives[i] / this.maxLives[i];
      this.colors[i3] = this.baseColors[i3] * fade;
      this.colors[i3 + 1] = this.baseColors[i3 + 1] * fade;
      this.colors[i3 + 2] = this.baseColors[i3 + 2] * fade;
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aColor.needsUpdate = true;
    this.geometry.attributes.aSize.needsUpdate = true;
  }

  killSlot(i) {
    this.lives[i] = 0;
    this.positions[i * 3 + 1] = OFFSCREEN_Y;
    this.colors[i * 3] = 0;
    this.colors[i * 3 + 1] = 0;
    this.colors[i * 3 + 2] = 0;
    this.sizes[i] = 0;
    this.count -= 1;
  }

  /** Clear everything (new run). Only touch live slots — killSlot decrements. */
  reset() {
    for (let i = 0; i < this.max; i++) {
      if (this.lives[i] > 0) this.killSlot(i);
    }
    this.trailTimer = 0;
  }

  /** Remove scene object and free GPU buffers (browser teardown). */
  dispose() {
    this.scene.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
  }

  /** Unsubscribe from the bus + dispose (tests / beforeunload). */
  destroy() {
    for (const off of this.subscriptions) off();
    this.subscriptions.length = 0;
    this.dispose();
  }
}