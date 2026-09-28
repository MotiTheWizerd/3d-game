import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { EventBus } from "../../src/three-game/core/EventBus.js";
import { InputManager } from "../../src/three-game/core/InputManager.js";
import { Game } from "../../src/three-game/game/Game.js";
import { LevelSystem } from "../../src/three-game/systems/LevelSystem.js";
import { ObstacleSpawner } from "../../src/three-game/game/ObstacleSpawner.js";
import { CONFIG } from "../../src/three-game/config.js";

// ---- Config sanity ------------------------------------------------------------

test("difficulty config: levels line up with the level clock", () => {
  const d = CONFIG.difficulty;
  assert.ok(d.levelSeconds > 0, "levelSeconds must be positive");
  assert.equal(d.levels.length, d.maxLevel, "one profile per level");

  // Level 1 is the warm-up: single lanes, everything jumpable.
  assert.equal(d.levels[0].doubleLaneChance, 0);
  assert.equal(d.levels[0].solidChance, 0);

  // The ramp only ever hardens, and every chance stays a valid probability.
  let prevDouble = -1;
  let prevSolid = -1;
  for (const { doubleLaneChance, solidChance } of d.levels) {
    assert.ok(
      doubleLaneChance >= prevDouble && solidChance >= prevSolid,
      "chances never soften as levels climb"
    );
    assert.ok(doubleLaneChance >= 0 && doubleLaneChance <= 1);
    assert.ok(solidChance >= 0 && solidChance <= 1);
    prevDouble = doubleLaneChance;
    prevSolid = solidChance;
  }
});

// ---- LevelSystem ---------------------------------------------------------------

test("starts at level 1 and the profile getter maps level -> config entry", () => {
  const ls = new LevelSystem(new EventBus());
  assert.equal(ls.level, 1);
  assert.equal(ls.elapsed, 0);
  assert.equal(ls.profile, CONFIG.difficulty.levels[0], "level 1 profile");

  ls.update(CONFIG.difficulty.levelSeconds);
  assert.equal(ls.profile, CONFIG.difficulty.levels[1], "level 2 profile");
});

test("no crossing before levelSeconds — then exactly one level:changed", () => {
  const events = new EventBus();
  const seen = [];
  events.on("level:changed", (e) => seen.push(e));
  const ls = new LevelSystem(events);

  ls.update(CONFIG.difficulty.levelSeconds - 0.1);
  assert.equal(ls.level, 1);
  assert.equal(seen.length, 0, "nothing emitted below the threshold");

  ls.update(0.2); // elapsed crosses levelSeconds
  assert.equal(ls.level, 2);
  assert.deepEqual(seen, [{ level: 2, previous: 1 }]);
});

test("successive crossings step the level; a huge dt clamps at maxLevel", () => {
  const events = new EventBus();
  const seen = [];
  events.on("level:changed", (e) => seen.push(e));
  const ls = new LevelSystem(events);
  const { levelSeconds, maxLevel } = CONFIG.difficulty;

  ls.update(levelSeconds); // -> 2
  ls.update(levelSeconds); // -> 3
  assert.equal(ls.level, 3);
  assert.deepEqual(seen, [
    { level: 2, previous: 1 },
    { level: 3, previous: 2 },
  ]);

  ls.update(1000); // far past the top — jumps straight to maxLevel
  assert.equal(ls.level, maxLevel);
  assert.equal(seen.length, 3, "one event for the jump to max");
  assert.deepEqual(seen[2], { level: maxLevel, previous: 3 });

  const after = seen.length;
  ls.update(500); // already at the cap — nothing more
  assert.equal(seen.length, after, "no events while clamped at maxLevel");
});

test("reset returns to level 1 with a zeroed clock", () => {
  const ls = new LevelSystem(new EventBus());
  ls.update(1000);
  assert.ok(ls.level > 1);

  ls.reset();
  assert.equal(ls.level, 1);
  assert.equal(ls.elapsed, 0);
  assert.equal(ls.profile, CONFIG.difficulty.levels[0]);
});

test("headless: a null event bus never crashes the tick", () => {
  const ls = new LevelSystem();
  ls.update(CONFIG.difficulty.levelSeconds + 1);
  assert.equal(ls.level, 2);
});

// ---- ObstacleSpawner + level profiles -------------------------------------------

// Jumpable heights straight from config (the spawner derives the same sets).
function jumpableHeights() {
  return CONFIG.obstacles.heights.filter(
    (h) => h <= CONFIG.obstacles.jumpableMaxHeight
  );
}

test("warm-up profile: every wave is single-lane and jumpable", () => {
  const scene = new THREE.Scene();
  const spawner = new ObstacleSpawner(scene, new LevelSystem(new EventBus()));
  const jumpable = jumpableHeights();

  for (let wave = 0; wave < 20; wave++) {
    const before = spawner.getActive().length;
    spawner.update(2.0, 0); // dt exceeds the initial interval -> one wave
    const fresh = spawner.getActive().slice(before);

    assert.equal(fresh.length, 1, `wave ${wave} blocks a single lane`);
    assert.ok(
      jumpable.includes(fresh[0].scale.y),
      `wave ${wave} height ${fresh[0].scale.y} must be jumpable in the warm-up`
    );
  }
});

test("max-level profile: the chances gate two-lane jams and solid walls", () => {
  const scene = new THREE.Scene();
  const ls = new LevelSystem(new EventBus());
  ls.update(1000); // clamp to maxLevel
  const spawner = new ObstacleSpawner(scene, ls);
  const jumpable = jumpableHeights();

  const realRandom = Math.random;
  try {
    Math.random = () => 0.001; // below every chance in the top profile
    spawner.update(2.0, 0);
    const jam = spawner.getActive();
    assert.equal(jam.length, 2, "double-lane chance fired");
    for (const mesh of jam) {
      assert.equal(mesh.scale.y, 2.6, "solid-chance roll raised a 2.6 wall");
    }
    spawner.reset();

    Math.random = () => 0.99; // above every chance in the top profile
    spawner.update(2.0, 0);
    const tame = spawner.getActive();
    assert.equal(tame.length, 1, "high rolls calm the wave down");
    assert.ok(
      jumpable.includes(tame[0].scale.y),
      "no solid wall without a winning chance roll"
    );
  } finally {
    Math.random = realRandom;
  }
});

// ---- Game → LevelSystem plumbing (recording HUD, like gameover-stats.test.js) ----

function makeRecordingHud() {
  return {
    calls: [],
    showReady() {},
    showGameOver(score, best, isNewBest, stats) {
      this.calls.push({ score, best, isNewBest, stats });
    },
    showPaused() {},
    hide() {},
  };
}

function makeInput() {
  const target = {
    addEventListener() {},
    removeEventListener() {},
  };
  return new InputManager(target);
}

function makeGame(hud = makeRecordingHud()) {
  const events = new EventBus();
  const engine = {
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(60, 1, 0.1, 300),
  };
  const game = new Game({ engine, events, input: makeInput(), hud });
  // Long sims must not end the run: mute wave spawning so nothing can crash
  // the player. The level clock itself doesn't care.
  game.obstacles.spawnWave = () => {};
  return { game, events };
}

function simulate(game, seconds, step = 0.5) {
  const steps = Math.round(seconds / step);
  for (let i = 0; i < steps; i++) game.update(step);
}

test("a live run climbs levels and announces each crossing once", () => {
  const { game, events } = makeGame();
  const seen = [];
  events.on("level:changed", (e) => seen.push(e));
  game.startRun();

  simulate(game, 24); // just under levelSeconds
  assert.equal(game.difficulty.level, 1);
  assert.equal(seen.length, 0, "no crossing before levelSeconds");

  simulate(game, 3); // 27s total — crosses into level 2
  assert.equal(game.difficulty.level, 2);
  assert.deepEqual(seen, [{ level: 2, previous: 1 }]);
});

test("a paused run never levels — the clock waits for you", () => {
  const { game, events } = makeGame();
  const seen = [];
  events.on("level:changed", (e) => seen.push(e));
  game.startRun();

  simulate(game, 10);
  game.pause();
  assert.equal(game.state, "paused");

  simulate(game, 40); // 40s of wall time — nothing may tick
  assert.equal(game.difficulty.level, 1);
  assert.equal(seen.length, 0);

  game.resume();
  simulate(game, 20); // elapsed 10 + 20 = 30s — crosses now
  assert.equal(game.difficulty.level, 2);
  assert.deepEqual(seen, [{ level: 2, previous: 1 }]);
});

test("startRun resets the difficulty back to level 1", () => {
  const { game } = makeGame();
  game.startRun();
  simulate(game, 30);
  assert.equal(game.difficulty.level, 2);

  game.startRun();
  assert.equal(game.difficulty.level, 1);
  assert.equal(game.difficulty.elapsed, 0);
});
