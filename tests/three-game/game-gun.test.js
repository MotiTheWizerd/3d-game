import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Game } from "../../src/three-game/game/Game.js";
import { EventBus } from "../../src/three-game/core/EventBus.js";
import { InputManager } from "../../src/three-game/core/InputManager.js";
import { CONFIG } from "../../src/three-game/config.js";

// ---- harness (same shape as shield-crash.test.js) ---------------------------

function makeInput() {
  const target = {
    addEventListener() {},
    removeEventListener() {},
  };
  return new InputManager(target);
}

function makeHud() {
  return {
    showReady() {},
    showGameOver() {},
    showPaused() {},
    hide() {},
  };
}

function makeGame() {
  const events = new EventBus();
  const engine = {
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(60, 1, 0.1, 300),
  };
  return new Game({ engine, events, input: makeInput(), hud: makeHud() });
}

/** Plant an active obstacle in the player's lane, `z` units down-range. */
function plantObstacleAt(game, z) {
  game.obstacles.spawnWave(); // level 1 profile: exactly one, jumpable
  const active = game.obstacles.getActive();
  const mesh = active[active.length - 1];
  mesh.position.set(game.player.position.x, mesh.position.y, z);
  return mesh;
}

test("an active gun auto-fires bolts on its cadence", () => {
  const game = makeGame();
  game.startRun();
  game.powerUpSystem.activate("gun");

  let fired = 0;
  game.events.on("gun:fired", () => fired++);

  // 20 frames = 0.333s at fireInterval 0.25 -> exactly two shots
  // (first immediate, second once the first cooldown elapses).
  for (let i = 0; i < 20; i++) game.update(1 / 60);
  assert.equal(fired, 2, "one shot at t=0, one after fireInterval");
  assert.equal(game.bullets.getActive().length, 2, "neither bolt hit anything yet");
});

test("no gun, no bolts — the trigger only answers an active blaster", () => {
  const game = makeGame();
  game.startRun();
  let fired = 0;
  game.events.on("gun:fired", () => fired++);
  for (let i = 0; i < 20; i++) game.update(1 / 60);
  assert.equal(fired, 0);
  assert.equal(game.bullets.getActive().length, 0);
});

test("bolts fire at chest height even while the player is mid-jump", () => {
  const game = makeGame();
  game.startRun();
  game.powerUpSystem.activate("gun");
  game.player.velocityY = 8; // rising
  game.update(1 / 60);
  const bolt = game.bullets.getActive()[0];
  assert.equal(bolt.position.y, CONFIG.powerUps.gun.muzzleY);
  assert.equal(bolt.position.x, game.player.position.x);
});

test("a bolt shatters an obstacle — bonus, smash count, event, run continues", () => {
  const game = makeGame();
  game.startRun();
  game.powerUpSystem.activate("gun");

  const mesh = plantObstacleAt(game, -5);
  const smashed = [];
  game.events.on("obstacle:smashed", (e) => smashed.push(e));
  const smashesBefore = game.score.smashes;

  for (let i = 0; i < 12; i++) game.update(1 / 60);

  assert.equal(game.state, "playing", "the bolt saved the run");
  assert.equal(game.obstacles.getActive().includes(mesh), false, "obstacle shot to pieces");
  assert.equal(smashed.length, 1, "exactly one smash event");
  assert.ok(smashed[0].position, "position payload survived mesh recycling");
  assert.equal(game.score.smashes, smashesBefore + 1, "counted as a smash");
  assert.ok(
    game.score.distance > CONFIG.powerUps.gun.smashBonus,
    "smash bonus landed (distance alone would be ~3 by now)"
  );
  assert.equal(
    game.bullets.getActive().length,
    0,
    "spent bolt removed, next shot not due within 12 frames"
  );
});

test("a bolt shatters an unjumpable solid wall — the whole appeal", () => {
  const game = makeGame();
  game.startRun();
  game.powerUpSystem.activate("gun");

  const mesh = plantObstacleAt(game, -5);
  // Turn it into a 2.6 solid wall: unjumpable, dodge-or-die without the gun.
  mesh.scale.y = 2.6;
  mesh.userData.halfHeight = 1.3;

  for (let i = 0; i < 12; i++) game.update(1 / 60);

  assert.equal(game.state, "playing");
  assert.equal(game.obstacles.getActive().includes(mesh), false, "wall blown open");
});

test("a spent gun stops firing — bolts in flight finish, then silence", () => {
  const game = makeGame();
  game.startRun();
  game.powerUpSystem.activate("gun");
  // Ghost keeps random lane traffic from ending the run during the long wait.
  game.powerUpSystem.activate("ghost");

  let fired = 0;
  game.events.on("gun:fired", () => fired++);
  for (let i = 0; i < 620; i++) game.update(1 / 60); // past the 10s duration
  assert.equal(game.powerUpSystem.isGun, false, "gun expired");

  const firedBefore = fired;
  for (let i = 0; i < 20; i++) game.update(1 / 60);
  assert.equal(fired, firedBefore, "no shots after expiry");
});

test("bolts are cleared when the run ends — no frozen tracers on the card", () => {
  const game = makeGame();
  game.startRun();
  game.powerUpSystem.activate("gun");
  game.update(1 / 60); // one bolt in flight
  assert.ok(game.bullets.getActive().length > 0);

  // Crash: obstacle just behind the player, overlapping their tail. It must
  // NOT be in front — the in-flight bolt would shoot it first and save you.
  game.obstacles.spawnWave();
  const active = game.obstacles.getActive();
  const mesh = active[active.length - 1];
  mesh.position.set(game.player.position.x, mesh.position.y, 1);
  game.update(1 / 60);

  assert.equal(game.state, "gameover");
  assert.equal(game.bullets.getActive().length, 0);
  assert.equal(game.gunCooldown, 0);
});

test("restart clears bolts and re-arms the trigger", () => {
  const game = makeGame();
  game.startRun();
  game.powerUpSystem.activate("gun");
  game.update(1 / 60);
  assert.ok(game.bullets.getActive().length > 0);

  game.startRun();
  assert.equal(game.bullets.getActive().length, 0);
  assert.equal(game.gunCooldown, 0);
  assert.equal(game.powerUpSystem.isGun, false, "restart wipes the pickup too");
});
