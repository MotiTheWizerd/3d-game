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

// Minimal stand-in for a THREE.Mesh — CollisionSystem only reads position + userData
function fakeObstacle(lane, height, z = 0) {
  return {
    position: { x: CONFIG.lanes[lane], y: height / 2, z },
    userData: { halfHeight: height / 2 },
  };
}

function fakeCoin(x, y, z) {
  return { position: { x, y, z } };
}

test("same-lane obstacle at ground level is a hit", () => {
  const player = fakePlayer(0, CONFIG.player.restY);
  assert.equal(sys.checkObstacleHit(player, [fakeObstacle(1, 1.0)]), true);
});

test("obstacle in a different lane is not a hit", () => {
  const player = fakePlayer(CONFIG.lanes[2], CONFIG.player.restY);
  assert.equal(sys.checkObstacleHit(player, [fakeObstacle(0, 1.0)]), false);
});

test("jumping clears a jumpable obstacle (height <= jumpableMaxHeight)", () => {
  const apexY = CONFIG.player.restY + (CONFIG.player.jumpVelocity ** 2) / (2 * -CONFIG.player.gravity);
  const player = fakePlayer(0, apexY);
  const jumpable = fakeObstacle(1, CONFIG.obstacles.jumpableMaxHeight);
  assert.equal(sys.checkObstacleHit(player, [jumpable]), false);
});

test("grounded player cannot pass a solid wall (height > jumpableMaxHeight) even mid-air", () => {
  const solidHeight = CONFIG.obstacles.heights.find((h) => h > CONFIG.obstacles.jumpableMaxHeight);
  const highPlayer = fakePlayer(0, 10); // arbitrarily high — walls ignore Y
  assert.equal(sys.checkObstacleHit(highPlayer, [fakeObstacle(1, solidHeight)]), true);
});

test("obstacle just outside Z reach is not a hit", () => {
  const farZ = CONFIG.obstacles.halfDepth + CONFIG.player.halfDepth + 1;
  const player = fakePlayer(0, CONFIG.player.restY);
  assert.equal(sys.checkObstacleHit(player, [fakeObstacle(1, 1.0, farZ)]), false);
});

test("no obstacles means no hit", () => {
  const player = fakePlayer(0, CONFIG.player.restY);
  assert.equal(sys.checkObstacleHit(player, []), false);
});

test("obstacle without userData.halfHeight falls back to default half-height", () => {
  const player = fakePlayer(0, CONFIG.player.restY);
  const bare = { position: { x: 0, y: 0.5, z: 0 }, userData: {} };
  assert.equal(sys.checkObstacleHit(player, [bare]), true);
});

test("collectCoins picks up every coin the player overlaps", () => {
  const player = fakePlayer(0, CONFIG.player.restY);
  const r = CONFIG.coins.radius + 0.15;
  const coins = [
    fakeCoin(0, CONFIG.coins.y, 0),        // hit
    fakeCoin(CONFIG.lanes[0], CONFIG.coins.y, 0), // different lane — miss
    fakeCoin(0, CONFIG.coins.y, 0.8),      // just inside Z reach — hit
  ];
  const collected = sys.collectCoins(player, coins);
  assert.deepEqual(collected.sort((a, b) => a - b), [0, 2]);
});

test("collectCoins returns indices in reverse order (safe for splicing)", () => {
  const player = fakePlayer(0, CONFIG.player.restY);
  const coins = [
    fakeCoin(0, CONFIG.coins.y, 0),
    fakeCoin(0, CONFIG.coins.y, 0.5),
    fakeCoin(0, CONFIG.coins.y, 0.9), // 0.45 + 0.5 = 0.95 max reach
  ];
  const collected = sys.collectCoins(player, coins);
  assert.deepEqual(collected, [2, 1, 0]);
});

test("collectCoins with nothing in range returns empty", () => {
  const player = fakePlayer(CONFIG.lanes[2], CONFIG.player.restY);
  const coins = [fakeCoin(CONFIG.lanes[0], CONFIG.coins.y, 0)];
  assert.deepEqual(sys.collectCoins(player, coins), []);
});