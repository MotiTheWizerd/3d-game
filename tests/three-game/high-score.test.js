import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Game } from "../../src/three-game/game/Game.js";
import { EventBus } from "../../src/three-game/core/EventBus.js";
import { InputManager } from "../../src/three-game/core/InputManager.js";
import { CONFIG } from "../../src/three-game/config.js";

// Minimal localStorage stub so tests don't depend on Node's webstorage flags.
const backing = new Map();
globalThis.localStorage = {
  getItem: (k) => (backing.has(k) ? backing.get(k) : null),
  setItem: (k, v) => backing.set(k, String(v)),
  removeItem: (k) => backing.delete(k),
};

function makeInput() {
  const target = {
    addEventListener() {},
    removeEventListener() {},
  };
  return new InputManager(target);
}

function makeHud() {
  return {
    calls: [],
    onButton: null,
    onRestart: null,
    showReady(best) {
      this.calls.push(["ready", best]);
    },
    showGameOver(score, best, isNewBest) {
      this.calls.push(["gameover", score, best, isNewBest]);
    },
    showPaused() {},
    hide() {},
    last() {
      return this.calls[this.calls.length - 1];
    },
  };
}

function makeGame() {
  const events = new EventBus();
  const engine = {
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(60, 1, 0.1, 300),
  };
  const hud = makeHud();
  const game = new Game({ engine, events, input: makeInput(), hud });
  return { game, events, hud };
}

function savedBest() {
  return backing.get(CONFIG.score.bestKey) ?? null;
}

test("beating the saved best flags isNewBest to the HUD and persists", () => {
  backing.delete(CONFIG.score.bestKey);
  const { game, hud } = makeGame();
  game.requestStart();
  game.score.distance = 4242;
  game.endRun();

  assert.deepEqual(hud.last(), ["gameover", 4242, 4242, true]);
  assert.equal(savedBest(), "4242");
});

test("a lower score does not flag a new best and keeps the saved value", () => {
  backing.set(CONFIG.score.bestKey, "9000");
  const { game, hud } = makeGame();
  game.requestStart();
  game.endRun();

  const [tag, score, best, isNewBest] = hud.last();
  assert.equal(tag, "gameover");
  assert.ok(score < 9000);
  assert.equal(best, 9000);
  assert.equal(isNewBest, false);
  assert.equal(savedBest(), "9000");
});

test("a fresh Game loads the saved best into the start overlay", () => {
  backing.set(CONFIG.score.bestKey, "777");
  const { hud } = makeGame();
  assert.deepEqual(hud.calls[0], ["ready", 777]);
});

test("a zero-score run never counts as a new best", () => {
  backing.delete(CONFIG.score.bestKey);
  const { game, hud } = makeGame();
  game.requestStart();
  game.endRun();

  const [, , , isNewBest] = hud.last();
  assert.equal(isNewBest, false);
  assert.equal(savedBest(), null);
});
