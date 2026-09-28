import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Game } from "../../src/three-game/game/Game.js";
import { EventBus } from "../../src/three-game/core/EventBus.js";
import { InputManager } from "../../src/three-game/core/InputManager.js";
import { CONFIG } from "../../src/three-game/config.js";

// ---- harness (same shape as pause.test.js) ---------------------------------

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

/** Put an active obstacle right on top of the player (its own lane, at z=0). */
function plantObstacleOnPlayer(game) {
  game.obstacles.spawnWave();
  const active = game.obstacles.getActive();
  const mesh = active[active.length - 1];
  // Plant on the player's CURRENT lane (it starts centre) — lanes[2] is the
  // right lane, which never overlaps a centre-lane player.
  mesh.position.set(game.player.position.x, mesh.position.y, 0);
  return mesh;
}

test("shield absorbs a crash — the run continues and the shield is spent", () => {
  const game = makeGame();
  game.startRun();
  game.powerUpSystem.activate("shield");

  const mesh = plantObstacleOnPlayer(game);
  game.update(1 / 60);

  assert.equal(game.state, "playing");
  assert.equal(game.powerUpSystem.shieldActive, false, "shield consumed");
  assert.equal(game.obstacles.getActive().includes(mesh), false, "obstacle smashed");
});

test("without a shield the same crash still ends the run", () => {
  const game = makeGame();
  game.startRun();
  plantObstacleOnPlayer(game);
  game.update(1 / 60);
  assert.equal(game.state, "gameover");
});

test("a spent shield does not absorb a second crash", () => {
  const game = makeGame();
  game.startRun();
  game.powerUpSystem.activate("shield");

  plantObstacleOnPlayer(game);
  game.update(1 / 60); // absorbed

  plantObstacleOnPlayer(game);
  game.update(1 / 60); // second crash — no shield left
  assert.equal(game.state, "gameover");
});
