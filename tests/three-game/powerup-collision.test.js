import { test } from "node:test";
import assert from "node:assert/strict";
import { CollisionSystem } from "../../src/three-game/systems/CollisionSystem.js";
import { CONFIG } from "../../src/three-game/config.js";

const sys = new CollisionSystem();

function fakePlayer(x, y, z = 0) {
  const hw = CONFIG.player.halfWidth;
  const hh = CONFIG.player.halfHeight;
  const hd = CONFIG.player.halfDepth;
  return {
    getBounds: () => ({
      minX: x - hw, maxX: x + hw,
      minY: y - hh, maxY: y + hh,
      minZ: z - hd, maxZ: z + hd,
    }),
  };
}

function fakePowerUp(type, lane, z = 0) {
  const hs = CONFIG.powerUps.types[type]?.halfSize ?? 0.5;
  return {
    position: { x: CONFIG.lanes[lane], y: 1.1, z },
    userData: { type },
    _halfSize: hs, // not used — bounds function reads config
  };
}

test("collectPowerUps picks up power-up in same lane at player Z", () => {
  const player = fakePlayer(0, CONFIG.player.restY);
  const pus = [fakePowerUp("shield", 1)];
  const collected = sys.collectPowerUps(player, pus);
  assert.deepEqual(collected, [0]);
});

test("collectPowerUps misses power-up in different lane", () => {
  const player = fakePlayer(CONFIG.lanes[1], CONFIG.player.restY);
  const pus = [fakePowerUp("magnet", 0)];
  const collected = sys.collectPowerUps(player, pus);
  assert.deepEqual(collected, []);
});

test("collectPowerUps misses far-away Z power-up", () => {
  const player = fakePlayer(0, CONFIG.player.restY);
  const pus = [fakePowerUp("score2x", 1, 5)]; // halfSize ~0.5, player reach ~1
  const collected = sys.collectPowerUps(player, pus);
  assert.deepEqual(collected, []);
});

test("collectPowerUps returns indices in reverse order", () => {
  const player = fakePlayer(0, CONFIG.player.restY);
  const pus = [
    fakePowerUp("shield", 1, 0),
    fakePowerUp("magnet", 1, 0.3),
    fakePowerUp("score2x", 1, 0.6), // ~boundary of reach
  ];
  const collected = sys.collectPowerUps(player, pus);
  assert.ok(collected.length >= 1);
  assert.equal(collected[0], Math.max(...collected)); // last index first
});

test("collectPowerUps with no power-ups returns empty", () => {
  const player = fakePlayer(0, CONFIG.player.restY);
  const collected = sys.collectPowerUps(player, []);
  assert.deepEqual(collected, []);
});

test("collectPowerUps handles unknown type (missing config)", () => {
  const player = fakePlayer(0, CONFIG.player.restY);
  const pus = [{ position: { x: 0, y: 1.1, z: 0 }, userData: { type: "???" }}];
  assert.doesNotThrow(() => sys.collectPowerUps(player, pus));
});
