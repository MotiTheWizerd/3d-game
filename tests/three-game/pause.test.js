import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Game } from "../../src/three-game/game/Game.js";
import { EventBus } from "../../src/three-game/core/EventBus.js";
import { InputManager } from "../../src/three-game/core/InputManager.js";
import { CONFIG } from "../../src/three-game/config.js";

// ---- harness ---------------------------------------------------------------

/** Real InputManager driven by synthetic keydowns (no window needed). */
function makeInput() {
  const target = {
    addEventListener() {},
    removeEventListener() {},
  };
  const input = new InputManager(target);
  // A "press" is a full tap: keydown then keyup. InputManager suppresses key
  // auto-repeat via `held`, so a bare keydown that is never released makes the
  // *next* press of the same key invisible — real keyboards always let go.
  input.press = (code) => {
    input.onKeyDown({ code, preventDefault() {} });
    input.onKeyUp({ code });
  };
  return input;
}

function makeHud() {
  const hud = {
    calls: [],
    onButton: null,
    onRestart: null,
    showReady(best) {
      this.calls.push(["ready", best]);
    },
    showGameOver(score, best) {
      this.calls.push(["gameover", score, best]);
    },
    showPaused(score) {
      this.calls.push(["paused", score]);
    },
    hide() {
      this.calls.push(["hide"]);
    },
    last() {
      return this.calls[this.calls.length - 1];
    },
  };
  return hud;
}

function makeGame() {
  const events = new EventBus();
  const engine = {
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(60, 1, 0.1, 300),
  };
  const input = makeInput();
  const hud = makeHud();
  const game = new Game({ engine, events, input, hud });
  return { game, events, input, hud, engine };
}

/** Count calls on a method without changing behaviour. */
function spy(obj, name) {
  const original = obj[name].bind(obj);
  const counter = { calls: 0 };
  obj[name] = (...args) => {
    counter.calls += 1;
    return original(...args);
  };
  return counter;
}

function makeDoc() {
  return {
    hidden: false,
    handler: null,
    addEventListener(_type, fn) {
      this.handler = fn;
    },
    removeEventListener(_type, fn) {
      if (this.handler === fn) this.handler = null;
    },
  };
}

/** Get a game into PLAYING with some run time on the clock. */
function startRun(game, input, frames = 5) {
  input.press("Space");
  for (let i = 0; i < frames; i++) game.update(1 / 60);
  return game;
}

// ---- state machine ---------------------------------------------------------

test("P pauses a live run", () => {
  const { game, input } = makeGame();
  startRun(game, input);
  input.press("KeyP");
  game.update(1 / 60);
  assert.equal(game.state, "paused");
  assert.equal(game.paused, true);
});

test("Escape pauses a live run too", () => {
  const { game, input } = makeGame();
  startRun(game, input);
  input.press("Escape");
  game.update(1 / 60);
  assert.equal(game.state, "paused");
});

test("P again resumes", () => {
  const { game, input } = makeGame();
  startRun(game, input);
  input.press("KeyP");
  game.update(1 / 60);
  input.press("KeyP");
  game.update(1 / 60);
  assert.equal(game.state, "playing");
  assert.equal(game.paused, false);
});

test("pause() refuses when nothing is running", () => {
  const { game } = makeGame();
  assert.equal(game.state, "ready");
  assert.equal(game.pause(), false);
});

test("resume() refuses when not paused", () => {
  const { game } = makeGame();
  game.requestStart();
  assert.equal(game.resume(), false);
});

test("pause() refuses on the game-over screen", () => {
  const { game } = makeGame();
  game.requestStart();
  game.endRun();
  assert.equal(game.state, "gameover");
  assert.equal(game.pause(), false);
});

test("endRun() is a no-op while paused", () => {
  const { game, input } = makeGame();
  startRun(game, input);
  game.pause();
  game.endRun();
  assert.equal(game.state, "paused", "a paused run cannot die");
});

test("togglePause goes both ways", () => {
  const { game, input } = makeGame();
  game.requestStart();
  assert.equal(game.togglePause(), true);
  assert.equal(game.state, "paused");
  assert.equal(game.togglePause(), true);
  assert.equal(game.state, "playing");
});

// ---- the freeze ------------------------------------------------------------

test("the frame that pauses simulates nothing", () => {
  const { game, input } = makeGame();
  startRun(game, input, 10);
  const elapsedBefore = game.elapsed;
  const speedBefore = game.speed;
  input.press("KeyP");
  game.update(1 / 60);
  assert.equal(game.elapsed, elapsedBefore, "clock must not tick");
  assert.equal(game.speed, speedBefore, "difficulty must not creep");
});

test("paused frames do not advance the clock or the score", () => {
  const { game, input } = makeGame();
  startRun(game, input, 10);
  const score = game.score.score;
  const elapsed = game.elapsed;
  game.pause();
  for (let i = 0; i < 120; i++) game.update(1 / 60); // 2 wall-clock seconds
  assert.equal(game.elapsed, elapsed);
  assert.equal(game.score.score, score);
});

test("pause stops spawners, world, particles and camera shake", () => {
  const { game, input } = makeGame();
  startRun(game, input);
  const world = spy(game.world, "update");
  const obstacles = spy(game.obstacles, "update");
  const coins = spy(game.coins, "update");
  const powerUps = spy(game.powerUps, "update");
  const particles = spy(game.particles, "update");
  const cameraFX = spy(game.cameraFX, "update");
  game.pause();
  game.update(1 / 60);
  game.update(1 / 60);
  assert.equal(world.calls, 0);
  assert.equal(obstacles.calls, 0);
  assert.equal(coins.calls, 0);
  assert.equal(powerUps.calls, 0);
  assert.equal(particles.calls, 0);
  assert.equal(cameraFX.calls, 0);
});

test("obstacle meshes hold their positions across a long pause", () => {
  const { game, input } = makeGame();
  startRun(game, input, 30);
  game.pause();
  const before = game.obstacles.getActive().map((o) => o.position.z);
  for (let i = 0; i < 60; i++) game.update(1 / 60);
  const after = game.obstacles.getActive().map((o) => o.position.z);
  assert.deepEqual(after, before);
});

test("resume picks the clock back up with no time jump", () =>
  {
  const { game, input } = makeGame();
  startRun(game, input, 10);
  const elapsed = game.elapsed;
  game.pause();
  for (let i = 0; i < 300; i++) game.update(1 / 60); // 5s paused
  game.resume();
  game.update(1 / 60);
  assert.ok(
    Math.abs(game.elapsed - (elapsed + 1 / 60)) < 1e-9,
    "one frame of play after resume, not five seconds' worth"
  );
});

test("power-up timers are game-time and survive a pause", () => {
  const { game, input } = makeGame();
  startRun(game, input);
  game.powerUpSystem.activate("score2x");
  // The HUD mirror is refreshed inside update(); the system is the source.
  assert.equal(game.powerUpSystem.coinMultiplier, 2);
  game.pause();
  for (let i = 0; i < 600; i++) game.update(1 / 60); // 10s paused
  game.resume();
  game.update(1 / 60);
  assert.ok(
    game.powerUpSystem.has("score2x"),
    "a paused run cannot bleed its power-up away"
  );
});

// ---- input hygiene ---------------------------------------------------------

test("lane presses made while paused are dropped on resume", () => {
  const { game, input } = makeGame();
  startRun(game, input);
  game.pause();
  input.press("KeyA"); // left
  input.press("Space"); // jump
  game.update(1 / 60);
  assert.equal(game.player.laneIndex, 1, "no stale lane change");
  assert.equal(game.player.grounded, true, "no stale jump");
});

test("a paused run still answers the pause key", () => {
  const { game, input } = makeGame();
  startRun(game, input);
  game.pause();
  input.press("Escape");
  game.update(1 / 60);
  assert.equal(game.state, "playing");
});

// ---- HUD + buttons ---------------------------------------------------------

test("pause raises the paused screen with the live score", () => {
  const { game, input, hud } = makeGame();
  startRun(game, input, 20);
  game.pause();
  assert.deepEqual(hud.last(), ["paused", game.score.score]);
});

test("resume clears the overlay", () => {
  const { game, hud } = makeGame();
  game.requestStart();
  game.pause();
  game.resume();
  assert.deepEqual(hud.last(), ["hide"]);
});

test("primary button resumes when paused", () => {
  const { game, hud } = makeGame();
  game.requestStart();
  game.pause();
  assert.equal(typeof hud.onButton, "function");
  hud.onButton();
  assert.equal(game.state, "playing");
});

test("primary button starts a run from the ready screen", () => {
  const { game, hud } = makeGame();
  hud.onButton();
  assert.equal(game.state, "playing");
});

test("restart button throws the paused run away and starts fresh", () => {
  const { game, input, hud } = makeGame();
  startRun(game, input, 30);
  game.score.addCoin();
  game.pause();
  hud.onRestart();
  assert.equal(game.state, "playing");
  assert.equal(game.elapsed, 0);
  assert.equal(game.score.score, 0);
});

test("restart is inert outside the pause screen", () => {
  const { game } = makeGame();
  game.requestStart();
  assert.equal(game.pressRestartButton(), false);
  assert.equal(game.state, "playing", "run kept going");
});

// ---- tab-switch auto-pause -------------------------------------------------

test("hiding the tab pauses a live run", () => {
  const { game, input } = makeGame();
  startRun(game, input);
  const doc = makeDoc();
  game.attachVisibility(doc);
  doc.hidden = true;
  doc.handler();
  assert.equal(game.state, "paused");
  game.detachVisibility();
});

test("auto-pause carries the hidden reason", () => {
  const { game, events } = makeGame();
  let reason = null;
  events.on("run:paused", (payload) => {
    reason = payload.reason;
  });
  game.requestStart();
  const doc = makeDoc();
  game.attachVisibility(doc);
  doc.hidden = true;
  doc.handler();
  assert.equal(reason, "hidden");
});

test("showing the tab again does NOT un-pause you", () => {
  const { game, input } = makeGame();
  startRun(game, input);
  const doc = makeDoc();
  game.attachVisibility(doc);
  doc.hidden = true;
  doc.handler();
  doc.hidden = false;
  doc.handler();
  assert.equal(game.state, "paused", "come back to the overlay, not to chaos");
});

test("tab-switch on the ready screen changes nothing", () => {
  const { game } = makeGame();
  const doc = makeDoc();
  game.attachVisibility(doc);
  doc.hidden = true;
  doc.handler();
  assert.equal(game.state, "ready");
});

test("auto-pause honours CONFIG.pause.autoOnHidden = false", () => {
  const { game, input } = makeGame();
  startRun(game, input);
  const doc = makeDoc();
  const original = CONFIG.pause.autoOnHidden;
  CONFIG.pause.autoOnHidden = false;
  game.attachVisibility(doc);
  doc.hidden = true;
  doc.handler();
  CONFIG.pause.autoOnHidden = original;
  assert.equal(game.state, "playing");
});

test("detachVisibility stops listening", () => {
  const { game, input } = makeGame();
  startRun(game, input);
  const doc = makeDoc();
  game.attachVisibility(doc);
  game.detachVisibility();
  assert.equal(doc.handler, null);
  doc.hidden = true;
  assert.doesNotThrow(() => game.detachVisibility(), "double detach is safe");
  assert.equal(game.state, "playing");
});

// ---- events ----------------------------------------------------------------

test("pause emits state:changed and run:paused", () => {
  const { game, events } = makeGame();
  const seen = [];
  events.on("state:changed", (s) => seen.push(s));
  events.on("run:paused", () => seen.push("paused-event"));
  game.requestStart();
  game.pause();
  assert.deepEqual(seen.slice(-3), ["playing", "paused", "paused-event"]);
});

test("resume emits state:changed and run:resumed", () => {
  const { game, events } = makeGame();
  let resumed = 0;
  events.on("run:resumed", () => {
    resumed += 1;
  });
  game.requestStart();
  game.pause();
  game.resume();
  assert.equal(resumed, 1);
  assert.equal(game.state, "playing");
});

test("starting a fresh run from the pause screen ends the pause cleanly", () => {
  const { game, events } = makeGame();
  const states = [];
  events.on("state:changed", (s) => states.push(s));
  game.requestStart();
  game.pause();
  game.pressRestartButton();
  assert.deepEqual(states, ["playing", "paused", "playing"]);
});
