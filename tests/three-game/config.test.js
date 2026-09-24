import { test } from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../../src/three-game/config.js";

test("lanes: exactly 3, middle centered, symmetric", () => {
  assert.equal(CONFIG.lanes.length, 3);
  assert.equal(CONFIG.lanes[1], 0);
  assert.ok(Math.abs(CONFIG.lanes[0] + CONFIG.lanes[2]) < 1e-9);
  assert.ok(CONFIG.lanes[0] < CONFIG.lanes[1] < CONFIG.lanes[2]);
});

test("player physics constants are sane", () => {
  const p = CONFIG.player;
  assert.ok(p.jumpVelocity > 0, "jump velocity must push up");
  assert.ok(p.gravity < 0, "gravity must pull down");
  assert.ok(p.restY > 0);
  for (const half of ["halfWidth", "halfDepth", "halfHeight"]) {
    assert.ok(p[half] > 0, `${half} must be positive`);
  }
  // jump apex clears every jumpable obstacle
  const apex = p.restY + (p.jumpVelocity ** 2) / (2 * -p.gravity);
  assert.ok(apex > CONFIG.obstacles.jumpableMaxHeight + CONFIG.player.halfHeight,
    "player must clear jumpable obstacles at apex");
});

test("speed ramps from initial up to max", () => {
  assert.ok(CONFIG.speed.max > CONFIG.speed.initial);
  assert.ok(CONFIG.speed.acceleration > 0);
});

test("obstacle config: ramp + solid wall present", () => {
  const o = CONFIG.obstacles;
  assert.ok(o.spawnIntervalMin < o.spawnIntervalStart);
  assert.ok(o.rampSeconds > 0);
  const solid = o.heights.filter((h) => h > o.jumpableMaxHeight);
  assert.ok(solid.length > 0, "at least one height must be a solid (unjumpable) wall");
  const jumpable = o.heights.filter((h) => h <= o.jumpableMaxHeight);
  assert.ok(jumpable.length > 0, "at least one height must be jumpable");
});

test("coin config: pack bounds and spacing valid", () => {
  const c = CONFIG.coins;
  assert.ok(c.packSizeMin >= 1);
  assert.ok(c.packSizeMax >= c.packSizeMin);
  assert.ok(c.packSpacing > 0);
  assert.ok(c.value > 0);
  assert.ok(c.y > 0);
});

test("dash config: sane burst values", () => {
  const d = CONFIG.dash;
  assert.ok(d.duration > 0, "dash must last some time");
  assert.ok(d.speedMultiplier > 1, "dash must be faster than base speed");
  assert.ok(d.energyPerCoin > 0 && d.energyPerCoin <= 1, "coin energy is a fraction of the meter");
  assert.ok(d.smashBonus > 0, "smashing must reward points");
  // 1/energyPerCoin coins fill the meter — must be a sane count
  const coinsPerDash = 1 / d.energyPerCoin;
  assert.ok(coinsPerDash >= 2 && coinsPerDash <= 10, `coins per dash ${coinsPerDash} within reason`);
});

test("score best key is a non-empty string", () => {
  assert.equal(typeof CONFIG.score.bestKey, "string");
  assert.ok(CONFIG.score.bestKey.length > 0);
});