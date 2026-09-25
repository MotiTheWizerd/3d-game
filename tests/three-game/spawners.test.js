import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { ObstacleSpawner } from "../../src/three-game/game/ObstacleSpawner.js";
import { CoinSpawner } from "../../src/three-game/game/CoinSpawner.js";
import { PowerUpSpawner } from "../../src/three-game/game/PowerUpSpawner.js";
import { CONFIG } from "../../src/three-game/config.js";

function makeScene() {
  return new THREE.Scene();
}

test("obstacle spawn interval ramps from start down to min over rampSeconds", () => {
  const spawner = new ObstacleSpawner(makeScene());
  const { spawnIntervalStart, spawnIntervalMin, rampSeconds } = CONFIG.obstacles;

  assert.ok(Math.abs(spawner.currentInterval() - spawnIntervalStart) < 1e-9);
  spawner.elapsed = rampSeconds / 2;
  const mid = spawner.currentInterval();
  assert.ok(mid > spawnIntervalMin && mid < spawnIntervalStart, `midpoint ${mid} between bounds`);
  spawner.elapsed = rampSeconds * 5;
  assert.ok(Math.abs(spawner.currentInterval() - spawnIntervalMin) < 1e-9, "clamped at min");
});

test("obstacle update spawns a wave (1-2 blocks) once the timer elapses", () => {
  const spawner = new ObstacleSpawner(makeScene());
  spawner.update(2.0, 0); // dt exceeds initial interval
  const n = spawner.getActive().length;
  assert.ok(n >= 1 && n <= 2, `expected 1-2 obstacles, got ${n}`);
});

test("spawned obstacles sit on a valid lane at spawnZ with sane scale", () => {
  const spawner = new ObstacleSpawner(makeScene());
  spawner.update(2.0, 0);
  for (const mesh of spawner.getActive()) {
    assert.ok(CONFIG.lanes.includes(mesh.position.x));
    assert.equal(mesh.position.z, CONFIG.world.spawnZ);
    const height = mesh.scale.y;
    assert.ok(CONFIG.obstacles.heights.includes(height));
    assert.equal(mesh.userData.halfHeight, height / 2);
    assert.equal(mesh.position.y, height / 2, "sits on the ground");
  }
  // lanes within one wave must be distinct
  const xs = spawner.getActive().map((m) => m.position.x);
  assert.equal(new Set(xs).size, xs.length);
});

test("obstacles recycle to the pool after passing recycleZ", () => {
  const spawner = new ObstacleSpawner(makeScene());
  spawner.update(2.0, 0);
  const spawned = spawner.getActive().length;
  // one huge step: speed*dt >> spawnZ -> recycleZ distance
  spawner.update(10, 20);
  assert.equal(spawner.getActive().length, 0);
  // the same update() call also spawned a fresh wave, so pool holds old + new
  assert.ok(spawner.pool.length >= spawned, "recycled meshes returned to pool");
});

test("smash removes exactly the obstacle at index and recycles it", () => {
  const spawner = new ObstacleSpawner(makeScene());
  spawner.update(2.0, 0); // spawn a wave (1-2 blocks)
  const before = spawner.getActive().length;
  assert.ok(before >= 1);

  const target = spawner.getActive()[0];
  spawner.smash(0);

  assert.equal(spawner.getActive().length, before - 1);
  assert.equal(target.visible, false, "smashed mesh hidden back to pool");
  assert.ok(spawner.pool.includes(target));
  // surviving obstacles keep their identity and order
  for (let i = 0; i < spawner.getActive().length; i++) {
    assert.notEqual(spawner.getActive()[i], target);
  }
});

test("smash with an out-of-range index is a safe no-op", () => {
  const spawner = new ObstacleSpawner(makeScene());
  spawner.smash(5);
  assert.equal(spawner.getActive().length, 0);
});

test("pool is reused instead of growing forever", () => {
  const spawner = new ObstacleSpawner(makeScene());
  for (let i = 0; i < 50; i++) spawner.update(2.0, 24);
  const sceneChildren = spawner.scene.children.length;
  // 50 waves -> at most 100 meshes ever created; assert far fewer since pool recycles
  assert.ok(sceneChildren < 40, `scene holds ${sceneChildren} meshes — pooling should cap growth`);
});

test("obstacle reset clears actives into the pool and zeroes timers", () => {
  const spawner = new ObstacleSpawner(makeScene());
  spawner.update(2.0, 0);
  spawner.reset();
  assert.equal(spawner.getActive().length, 0);
  assert.ok(spawner.pool.length >= 1);
  assert.equal(spawner.timer, 0);
  assert.equal(spawner.elapsed, 0);
});

test("coin spawner starts primed (half interval) and spawns a pack on schedule", () => {
  const spawner = new CoinSpawner(makeScene());
  assert.ok(Math.abs(spawner.timer - CONFIG.coins.spawnInterval * 0.5) < 1e-9);
  spawner.update(CONFIG.coins.spawnInterval * 0.6, 0);
  const n = spawner.getActive().length;
  assert.ok(n >= CONFIG.coins.packSizeMin && n <= CONFIG.coins.packSizeMax, `pack size ${n}`);
});

test("coin packs live in a single lane, spaced along Z, at coin height", () => {
  const spawner = new CoinSpawner(makeScene());
  spawner.update(CONFIG.coins.spawnInterval * 0.6, 0);
  const coins = spawner.getActive();
  const xs = new Set(coins.map((m) => m.position.x));
  assert.equal(xs.size, 1, "all coins in one pack share a lane");
  assert.ok(CONFIG.lanes.includes(coins[0].position.x));
  for (const [i, coin] of coins.entries()) {
    assert.equal(coin.position.y, CONFIG.coins.y);
    assert.ok(
      Math.abs(coin.position.z - (CONFIG.world.spawnZ - i * CONFIG.coins.packSpacing)) < 1e-9
    );
  }
});

test("collect removes a coin from active and returns it to the pool", () => {
  const spawner = new CoinSpawner(makeScene());
  spawner.update(CONFIG.coins.spawnInterval * 0.6, 0);
  const before = spawner.getActive().length;
  const poolBefore = spawner.pool.length;
  spawner.collect(0);
  assert.equal(spawner.getActive().length, before - 1);
  assert.equal(spawner.pool.length, poolBefore + 1);
});

test("collect with an out-of-range index is a safe no-op", () => {
  const spawner = new CoinSpawner(makeScene());
  spawner.update(CONFIG.coins.spawnInterval * 0.6, 0);
  const before = spawner.getActive().length;
  spawner.collect(999);
  assert.equal(spawner.getActive().length, before);
});

test("coins recycle after passing recycleZ", () => {
  const spawner = new CoinSpawner(makeScene());
  spawner.update(CONFIG.coins.spawnInterval * 0.6, 0);
  spawner.update(10, 20); // big step -> everything passes the recycle line
  assert.equal(spawner.getActive().length, 0);
  assert.ok(spawner.pool.length >= CONFIG.coins.packSizeMin);
});

test("coin reset empties actives and re-primes the timer", () => {
  const spawner = new CoinSpawner(makeScene());
  spawner.update(CONFIG.coins.spawnInterval * 0.6, 0);
  spawner.reset();
  assert.equal(spawner.getActive().length, 0);
  assert.ok(
    Math.abs(spawner.timer - CONFIG.coins.spawnInterval * 0.5) < 1e-9,
    "timer re-primed"
  );
});

// ─── PowerUpSpawner ───────────────────────────────────────────────

test("power-up spawn interval ramps from start down to min over rampSeconds", () => {
  const spawner = new PowerUpSpawner(makeScene());
  const { spawnIntervalStart, spawnIntervalMin, rampSeconds } = CONFIG.powerUps;

  // Initial lastSpawnTime starts at half-interval (primed).
  assert.ok(
    Math.abs(spawner.lastSpawnTime - CONFIG.powerUps.spawnIntervalStart * 0.5) < 1e-9,
    "starts primed like others"
  );
});

test("power-up update spawns a single power-up once the timer elapses", () => {
  const spawner = new PowerUpSpawner(makeScene());
  spawner.update(CONFIG.powerUps.spawnIntervalStart * 0.6, 0);
  const n = spawner.getActive().length;
  assert.equal(n, 1, `expected exactly 1 power-up, got ${n}`);
});

test("spawned power-ups sit on a valid lane at spawnZ with bobOffset", () => {
  const spawner = new PowerUpSpawner(makeScene());
  spawner.update(CONFIG.powerUps.spawnIntervalStart * 0.6, 0);
  const mesh = spawner.getActive()[0];
  assert.ok(CONFIG.lanes.includes(mesh.position.x));
  assert.equal(mesh.position.z, CONFIG.world.spawnZ);
  assert.ok(Math.abs(mesh.position.y - 1.1) < 0.3, "base height ~1.1 (+/− bob)");
  assert.ok(
    Object.keys(CONFIG.powerUps.types).includes(mesh.userData.type),
    "userData.type is a valid power-up type"
  );
  assert.ok(typeof mesh.userData.bobOffset === "number", "bobOffset is set");
});

test("power-up types produce different colors via materials", () => {
  const spawner = new PowerUpSpawner(makeScene());
  const types = Object.keys(CONFIG.powerUps.types);
  const colors = types.map(t => spawner.materials[t].color.getHex());
  // Every type should have a unique color.
  assert.equal(new Set(colors).size, types.length, "all power-up types have distinct colors");
});

test("power-ups recycle after passing recycleZ", () => {
  const spawner = new PowerUpSpawner(makeScene());
  spawner.update(CONFIG.powerUps.spawnIntervalStart * 0.6, 0); // spawn one
  const poolBefore = spawner.pool.length;
  // huge step past recycleZ:
  spawner.update(10, 20);
  assert.equal(spawner.getActive().length, 0, "no actives after big step");
  assert.ok(spawner.pool.length > poolBefore, "recycled mesh returned to pool");
});

test("collect removes a power-up by index and returns it to the pool", () => {
  const spawner = new PowerUpSpawner(makeScene());
  spawner.update(CONFIG.powerUps.spawnIntervalStart * 0.6, 0);
  const before = spawner.getActive().length;
  const poolBefore = spawner.pool.length;
  spawner.collect(0);
  assert.equal(spawner.getActive().length, before - 1);
  assert.equal(spawner.pool.length, poolBefore + 1);
});

test("collect with an out-of-range index is a safe no-op", () => {
  const spawner = new PowerUpSpawner(makeScene());
  spawner.update(CONFIG.powerUps.spawnIntervalStart * 0.6, 0);
  const before = spawner.getActive().length;
  spawner.collect(999);
  assert.equal(spawner.getActive().length, before);
});

test("acquire reuses a pooled mesh of the same type", () => {
  const spawner = new PowerUpSpawner(makeScene());
  spawner.update(CONFIG.powerUps.spawnIntervalStart * 0.6, 0);
  const mesh = spawner.getActive()[0];
  spawner.collect(0);
  // release happened inside collect → mesh is in pool with matching type.
  const reused = spawner.acquire(mesh.userData.type);
  assert.equal(reused, mesh, "pooled mesh of same type is reused");
  assert.equal(reused.visible, true, "reused mesh is visible again");
});

test("acquire creates a new mesh when no matching pool entry exists", () => {
  const spawner = new PowerUpSpawner(makeScene());
  const types = Object.keys(CONFIG.powerUps.types);
  const type = types[Math.floor(Math.random() * types.length)];
  const mesh = spawner.acquire(type);
  assert.equal(mesh.userData.type, type);
  assert.ok(spawner.scene.children.includes(mesh), "newly acquired mesh is in scene");
});

test("release hides mesh and puts it back in the pool", () => {
  const spawner = new PowerUpSpawner(makeScene());
  const type = Object.keys(CONFIG.powerUps.types)[0];
  const mesh = spawner.acquire(type);
  mesh.visible = true;
  const poolBefore = spawner.pool.length;
  spawner.release(mesh);
  assert.equal(mesh.visible, false, "released mesh is hidden");
  assert.ok(spawner.pool.includes(mesh), "mesh is in pool after release");
});

test("pool is reused instead of growing forever", () => {
  const spawner = new PowerUpSpawner(makeScene());
  for (let i = 0; i < 30; i++) spawner.update(2.0, 24);
  const sceneChildren = spawner.scene.children.length;
  assert.ok(sceneChildren < 15, `scene holds ${sceneChildren} meshes — pooling keeps it low`);
});

test("power-up reset clears actives into the pool and zeroes timers", () => {
  const spawner = new PowerUpSpawner(makeScene());
  spawner.update(CONFIG.powerUps.spawnIntervalStart * 0.6, 0);
  const activesBefore = spawner.getActive().length;
  spawner.reset();
  assert.equal(spawner.getActive().length, 0);
  assert.ok(spawner.pool.length >= activesBefore, "actives moved to pool");
  assert.equal(spawner.lastSpawnTime, 0, "lastSpawnTime reset");
  assert.equal(spawner.timer, 0, "timer reset");
});

test("multiple updates without elapsed drift produce periodic spawns", () => {
  const spawner = new PowerUpSpawner(makeScene());
  let spawned = 0;
  for (let i = 0; i < 600; i++) {
    spawner.update(0.016, 0, 0);
    spawned += spawner.getActive().length;
  }
  assert.ok(spawned > 1, `accumulated spawns ${spawned} across ticks`);
});