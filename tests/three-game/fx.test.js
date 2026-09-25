import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { ParticleSystem } from "../../src/three-game/systems/ParticleSystem.js";
import { CameraFX } from "../../src/three-game/systems/CameraFX.js";
import { EventBus } from "../../src/three-game/core/EventBus.js";
import { CONFIG } from "../../src/three-game/config.js";

const ORIGIN = new THREE.Vector3(0, 1.1, 0);

function makeCamera() {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 300);
  camera.position.set(0, 5.2, 9);
  camera.lookAt(0, 1, -8);
  return camera;
}

function makeSystem(events = null) {
  return new ParticleSystem(new THREE.Scene(), events);
}

function settle(system, seconds, dt = 0.016) {
  for (let t = 0; t < seconds; t += dt) system.update(dt);
}

// ---- ParticleSystem ------------------------------------------------------

test("burst spawns exactly the preset count of live particles", () => {
  const fx = makeSystem();
  fx.burst(ORIGIN, CONFIG.fx.particles.coin);
  assert.equal(fx.aliveCount, CONFIG.fx.particles.coin.count);
});

test("particles fade: color channels shrink as life runs out", () => {
  const fx = makeSystem();
  fx.burst(ORIGIN, CONFIG.fx.particles.coin);
  fx.update(1e-4); // attribute colors are written on the first update
  const startR = fx.colors[0];
  const baseR = ((CONFIG.fx.particles.coin.colors[0] >> 16) & 255) / 255;
  assert.ok(Math.abs(startR - baseR) < 0.01, "fresh particle near full color");
  settle(fx, CONFIG.fx.particles.coin.life * 0.5);
  assert.ok(fx.colors[0] < startR - 0.3, "r channel must fade with life");
  assert.ok(fx.aliveCount > 0, "still alive at half-life");
});

test("particles eventually die and park off-screen", () => {
  const fx = makeSystem();
  fx.burst(ORIGIN, CONFIG.fx.particles.coin);
  settle(fx, CONFIG.fx.particles.coin.life * 2);
  assert.equal(fx.aliveCount, 0);
  assert.equal(fx.positions[1], -9999, "dead slot parked off-screen");
  assert.equal(fx.sizes[0], 0);
});

test("gravity pulls particles downward", () => {
  const fx = makeSystem();
  const flat = { ...CONFIG.fx.particles.coin, count: 1, upBias: 0, speed: 0 };
  fx.burst(ORIGIN, flat);
  const y0 = fx.positions[1];
  fx.update(0.1);
  assert.ok(fx.positions[1] < y0, "y must fall under gravity");
});

test("pool caps at CONFIG.fx.particles.max without throwing", () => {
  const fx = makeSystem();
  fx.burst(ORIGIN, { ...CONFIG.fx.particles.crash, count: 5000 });
  assert.equal(fx.aliveCount, CONFIG.fx.particles.max);
  fx.burst(ORIGIN, { ...CONFIG.fx.particles.crash, count: 5000 });
  assert.equal(fx.aliveCount, CONFIG.fx.particles.max, "no growth past cap");
});

test("coin:collected event spawns a burst at the payload position", () => {
  const events = new EventBus();
  const fx = makeSystem(events);
  events.emit("coin:collected", { position: new THREE.Vector3(2.5, 1.1, -3) });
  assert.ok(fx.aliveCount > 0);
  const foundNear = [fx.positions[0], fx.positions[1], fx.positions[2]];
  assert.ok(Math.abs(foundNear[0] - 2.5) < 0.5, "first particle near coin x");
});

test("old-style null payloads don't crash the particle system", () => {
  const events = new EventBus();
  const fx = makeSystem(events);
  events.emit("coin:collected", null);
  events.emit("obstacle:smashed", null);
  events.emit("player:crashed", null);
  assert.equal(fx.aliveCount, 0);
});

test("obstacle:smashed and player:crashed each spawn their own burst", () => {
  const events = new EventBus();
  const fx = makeSystem(events);
  events.emit("obstacle:smashed", { position: ORIGIN.clone() });
  const afterSmash = fx.aliveCount;
  assert.equal(afterSmash, CONFIG.fx.particles.smash.count);
  events.emit("player:crashed", { position: ORIGIN.clone() });
  assert.equal(
    fx.aliveCount,
    afterSmash + CONFIG.fx.particles.crash.count
  );
});

test("dash trail emits on interval, not every call", () => {
  const fx = makeSystem();
  const interval = CONFIG.fx.particles.trail.emitInterval;
  fx.trail(ORIGIN, 20, interval);
  fx.update(1e-4);
  const first = fx.aliveCount;
  assert.equal(first, CONFIG.fx.particles.trail.count);
  fx.trail(ORIGIN, 20, 0.001); // below interval — no new particles
  assert.equal(fx.aliveCount, first);
  settle(fx, CONFIG.fx.particles.trail.life * 2);
  assert.equal(fx.aliveCount, 0, "trail particles expire");
});

test("reset clears all particles mid-flight", () => {
  const fx = makeSystem();
  fx.burst(ORIGIN, CONFIG.fx.particles.crash);
  assert.equal(fx.aliveCount, CONFIG.fx.particles.crash.count);
  fx.reset();
  assert.equal(fx.aliveCount, 0, "alive count exactly zero, not negative");
  assert.equal(fx.positions[1], -9999);
});

test("destroy unsubscribes and detaches from the scene", () => {
  const events = new EventBus();
  const scene = new THREE.Scene();
  const fx = new ParticleSystem(scene, events);
  fx.destroy();
  events.emit("coin:collected", { position: ORIGIN.clone() });
  assert.equal(fx.aliveCount, 0, "no bursts after destroy");
  assert.equal(scene.children.length, 0, "points removed from scene");
});

test("headless-safe: constructed without an event bus", () => {
  const fx = makeSystem(null);
  fx.burst(ORIGIN, CONFIG.fx.particles.coin);
  settle(fx, 1);
  assert.equal(fx.aliveCount, 0);
});

// ---- CameraFX ------------------------------------------------------------

function makeFX(events = null) {
  return new CameraFX(makeCamera(), events);
}

function nearBase(fx, eps = 1e-6) {
  return fx.camera.position.distanceTo(fx.basePosition) < eps;
}

test("dash punch lifts fov above base, then eases back", () => {
  const events = new EventBus();
  const fx = makeFX(events);
  const base = fx.baseFov;
  events.emit("player:dashed", null);
  fx.update(0.016); // punch applies on the next rendered frame
  assert.ok(
    fx.camera.fov > base + CONFIG.fx.camera.fovPunch * 0.8,
    "fov lifted by most of the punch"
  );
  settle(fx, 2.5);
  assert.equal(fx.camera.fov, base, "fov fully recovered");
  assert.ok(nearBase(fx), "camera back at base position");
});

test("crash shakes the camera, then it settles exactly at base", () => {
  const events = new EventBus();
  const fx = makeFX(events);
  events.emit("player:crashed", null);
  fx.update(0.016); // offsets apply on the next rendered frame
  assert.ok(fx.shaking);
  assert.ok(!nearBase(fx), "camera offset while shaking");
  const roll = new THREE.Euler().setFromQuaternion(fx.camera.quaternion);
  assert.ok(Math.abs(roll.z) > 0, "roll applied during shake");
  settle(fx, 1.5);
  assert.ok(!fx.shaking, "trauma decayed to zero");
  assert.ok(nearBase(fx), "position restored");
  assert.equal(fx.camera.fov, fx.baseFov);
});

test("shake offset never exceeds shakeMaxOffset (trauma clamps at 1)", () => {
  const events = new EventBus();
  const fx = makeFX(events);
  events.emit("player:crashed", null);
  events.emit("player:crashed", null); // double crash same frame
  fx.update(0.016);
  const max = CONFIG.fx.camera.shakeMaxOffset;
  const d = fx.camera.position.distanceTo(fx.basePosition);
  assert.ok(d <= max * 2, `offset ${d} bounded`);
  assert.ok(fx.trauma <= 1);
});

test("update with no events keeps the camera untouched at base", () => {
  const fx = makeFX();
  settle(fx, 1);
  assert.ok(nearBase(fx));
  assert.equal(fx.camera.fov, fx.baseFov);
});

test("reset snaps back to base mid-shake (new run)", () => {
  const events = new EventBus();
  const fx = makeFX(events);
  events.emit("player:crashed", null);
  fx.update(0.016);
  fx.reset();
  assert.ok(nearBase(fx));
  assert.equal(fx.camera.fov, fx.baseFov);
  assert.ok(!fx.shaking);
});

test("destroy unsubscribes camera events", () => {
  const events = new EventBus();
  const fx = makeFX(events);
  fx.destroy();
  events.emit("player:crashed", null);
  events.emit("player:dashed", null);
  assert.ok(!fx.shaking);
  assert.equal(fx.fovBoost, 0);
});

// ---- config sanity -------------------------------------------------------

test("fx config: every preset stays within the pool and has colors", () => {
  const { particles, camera } = CONFIG.fx;
  for (const [name, preset] of Object.entries(particles)) {
    if (name === "max") continue;
    assert.ok(preset.count <= particles.max, `${name} fits the pool`);
    assert.ok(preset.life > 0, `${name} has positive life`);
    assert.ok(Array.isArray(preset.colors) && preset.colors.length > 0);
  }
  assert.ok(camera.fovPunch > 0);
  assert.ok(camera.shakeMaxOffset > 0);
  assert.ok(camera.shakeDecay > 0);
});