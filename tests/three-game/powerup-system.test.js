import { test } from "node:test";
import assert from "node:assert/strict";
import { PowerUpSystem } from "../../src/three-game/systems/PowerUpSystem.js";
import { CONFIG } from "../../src/three-game/config.js";

// Shared mock clock so all tests start at t=0.
let tick = 0;
const getNow = () => tick * 1000; // returns ms

const events = {
  handlers: [],
  on(event, fn) {
    this.handlers.push({ event, fn });
  },
  emit(event, data) {
    const fired = [];
    for (const h of this.handlers) {
      if (h.event === event) {
        fired.push(h.fn(data));
      }
    }
    return fired;
  },
};

function makeClock() {
  tick = 0;
}

test("activate sets shield flag", () => {
  makeClock();
  const sys = new PowerUpSystem(events, getNow);
  sys.activate("shield");
  assert.equal(sys.shieldActive, true);
});

test("activate does not stack shields", () => {
  makeClock();
  const sys = new PowerUpSystem(events, getNow);
  sys.activate("shield");
  sys.activate("shield");
  assert.equal(sys.has("shield"), true);
});

test("consumeShield returns true and clears flag", () => {
  makeClock();
  const sys = new PowerUpSystem(events, getNow);
  sys.activate("shield");
  assert.equal(sys.consumeShield(), true);
  assert.equal(sys.shieldActive, false);
});

test("consumeShield on non-shield returns false", () => {
  makeClock();
  const sys = new PowerUpSystem(events, getNow);
  assert.equal(sys.consumeShield(), false);
});

test("magnet adds extra pickup radius", () => {
  makeClock();
  const sys = new PowerUpSystem(events, getNow);
  assert.equal(sys.extraMagnetRadius, 0);
  sys.activate("magnet");
  assert.ok(sys.extraMagnetRadius > 0);
});

test("magnet is removed after duration", () => {
  makeClock();
  const sys = new PowerUpSystem(events, getNow);
  sys.activate("magnet");
  assert.ok(sys.has("magnet"));
  // Advance past default duration (10 seconds).
  tick = 11;
  sys.update(1);
  assert.equal(sys.has("magnet"), false);
});

test("score2x doubles coin multiplier", () => {
  makeClock();
  const sys = new PowerUpSystem(events, getNow);
  assert.equal(sys.coinMultiplier, 1);
  sys.activate("score2x");
  assert.equal(sys.coinMultiplier, 2);
});

test("score2x multiplier expires correctly", () => {
  makeClock();
  const sys = new PowerUpSystem(events, getNow);
  sys.activate("score2x");
  assert.equal(sys.coinMultiplier, 2);
  tick = 11;
  sys.update(1);
  assert.equal(sys.coinMultiplier, 1);
});

test("reset clears all state", () => {
  makeClock();
  const sys = new PowerUpSystem(events, getNow);
  sys.activate("shield");
  sys.activate("score2x");
  sys.reset();
  assert.equal(sys.shieldActive, false);
  assert.equal(sys.coinMultiplier, 1);
  assert.equal(sys.extraMagnetRadius, 0);
});

test("collecting an unknown type is a safe no-op", () => {
  makeClock();
  const sys = new PowerUpSystem(events, getNow);
  assert.doesNotThrow(() => sys.activate("nonexistent"));
});

test("shield survives expiry checks (no timer)", () => {
  makeClock();
  const sys = new PowerUpSystem(events, getNow);
  sys.activate("shield");
  tick = 30; // way past any timed power-up would expire
  sys.update(1);
  assert.equal(sys.shieldActive, true); // shield doesn't have a timer
});

test("multiple types active simultaneously", () => {
  makeClock();
  const sys = new PowerUpSystem(events, getNow);
  sys.activate("shield");
  sys.activate("magnet");
  sys.activate("score2x");
  assert.ok(sys.has("shield"));
  assert.ok(sys.has("magnet"));
  assert.ok(sys.has("score2x"));
  assert.equal(sys.coinMultiplier, 2);
  assert.ok(sys.extraMagnetRadius > 0);
});

test("slowmo halves-then-some world speed via speedFactor while active", () => {
  makeClock();
  const sys = new PowerUpSystem(events, getNow);
  assert.equal(sys.speedFactor, 1); // inactive → no slowdown.
  sys.activate("slowmo");
  assert.equal(sys.speedFactor, CONFIG.powerUps.slowmoFactor);
  // Expire it.
  tick = CONFIG.powerUps.duration + 1;
  sys.update(0);
  assert.equal(sys.speedFactor, 1);
});

test("ghost phases through obstacles while active", () => {
  makeClock();
  const sys = new PowerUpSystem(events, getNow);
  assert.equal(sys.isGhost, false);
  sys.activate("ghost");
  assert.equal(sys.isGhost, true);
  tick = CONFIG.powerUps.duration + 1;
  sys.update(0);
  assert.equal(sys.isGhost, false);
});