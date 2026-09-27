import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Game } from "../../src/three-game/game/Game.js";
import { EventBus } from "../../src/three-game/core/EventBus.js";
import { InputManager } from "../../src/three-game/core/InputManager.js";
import { TouchControls } from "../../src/three-game/core/TouchControls.js";
import { CONFIG } from "../../src/three-game/config.js";

// ---- harness ---------------------------------------------------------------

const ORIGIN = { x: 200, y: 400 };
const THRESHOLD = () => CONFIG.touch.swipeThreshold;

/** Records listeners so we can fire synthetic touches at a fake mount. */
function makeTarget() {
  const handlers = new Map(); // type -> [{ fn, options }]
  return {
    handlers,
    addEventListener(type, fn, options) {
      if (!handlers.has(type)) handlers.set(type, []);
      handlers.get(type).push({ fn, options });
    },
    removeEventListener(type, fn) {
      handlers.set(
        type,
        (handlers.get(type) ?? []).filter((h) => h.fn !== fn)
      );
    },
    emit(type, event) {
      for (const h of handlers.get(type) ?? []) h.fn(event);
      return event;
    },
    count(type) {
      return (handlers.get(type) ?? []).length;
    },
    optionsFor(type) {
      return handlers.get(type)?.[0]?.options;
    },
  };
}

function finger(identifier, x, y) {
  return { identifier, clientX: x, clientY: y };
}

/**
 * Shape of a real TouchEvent: `touches` is every finger down after this change,
 * `changedTouches` is the finger(s) this event is about.
 */
function touchEvent(type, touches, changedTouches) {
  return {
    type,
    touches,
    changedTouches: changedTouches ?? touches,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
}

function makeHud() {
  return {
    calls: [],
    onButton: null,
    onRestart: null,
    onPause: null,
    showReady() {},
    showGameOver() {},
    showPaused() {},
    hide() {},
  };
}

/**
 * A live Game plus TouchControls on a fake canvas mount, on a clock the test
 * owns. `queued()` reads the action queue without the game consuming it.
 */
function makeHarness() {
  const events = new EventBus();
  const engine = {
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(60, 1, 0.1, 300),
  };
  const keyboardTarget = { addEventListener() {}, removeEventListener() {} };
  const input = new InputManager(keyboardTarget);
  const hud = makeHud();
  const game = new Game({ engine, events, input, hud });

  const mount = makeTarget();
  let clock = 10_000;
  const touch = new TouchControls(input, mount, { events, now: () => clock });
  touch.attach();

  const api = {
    events,
    input,
    game,
    hud,
    mount,
    touch,
    /** How many presses of `action` are waiting for the game loop. */
    queued(action) {
      return input.justPressed.get(action) ?? 0;
    },
    drain(action) {
      return input.consumeCount(action);
    },
    frame(n = 1) {
      for (let i = 0; i < n; i++) game.update(1 / 60);
    },
    /** Get into PLAYING the way a phone user would: tap to start. */
    play() {
      api.tap();
      api.frame();
      assert.equal(game.state, "playing", "harness: tap starts the run");
    },
    advance(ms) {
      clock += ms;
    },
    at(x, y) {
      return { x: x ?? ORIGIN.x, y: y ?? ORIGIN.y };
    },
    down(x, y, id = 0) {
      const p = api.at(x, y);
      return mount.emit(
        "touchstart",
        touchEvent("touchstart", [finger(id, p.x, p.y)])
      );
    },
    move(x, y, id = 0, all = null) {
      clock += 8; // ~60Hz touchmove
      const p = api.at(x, y);
      const fingers = all ?? [finger(id, p.x, p.y)];
      return mount.emit("touchmove", touchEvent("touchmove", fingers));
    },
    up(x, y, id = 0, stillDown = []) {
      const p = api.at(x, y);
      clock += 40; // a real lift lands between move samples
      return mount.emit(
        "touchend",
        touchEvent("touchend", stillDown, [finger(id, p.x, p.y)])
      );
    },
    /** Swipe that ends still under the threshold: the lift decides. */
    tap(x, y, id = 0) {
      api.down(x, y, id);
      api.up(x, y, id);
    },
    hold(ms, x, y, id = 0) {
      api.down(x, y, id);
      api.advance(ms);
      api.up(x, y, id);
    },
    /** Horizontal flick, fired as it travels (what a real swipe looks like). */
    swipeX(dx, id = 0) {
      api.down();
      const steps = Math.max(1, Math.ceil(Math.abs(dx) / THRESHOLD()));
      for (let i = 1; i <= steps; i++) {
        api.move(ORIGIN.x + (dx * i) / steps, ORIGIN.y, id);
      }
      api.up(ORIGIN.x + dx, ORIGIN.y, id);
    },
    swipeY(dy, id = 0) {
      api.down();
      const steps = Math.max(1, Math.ceil(Math.abs(dy) / THRESHOLD()));
      for (let i = 1; i <= steps; i++) {
        api.move(ORIGIN.x, ORIGIN.y + (dy * i) / steps, id);
      }
      api.up(ORIGIN.x, ORIGIN.y + dy, id);
    },
  };
  return api;
}

function makeTouchOnly() {
  const fired = [];
  const input = {
    enabled: true,
    trigger(action) {
      if (!this.enabled) return false;
      fired.push(action);
      return true;
    },
  };
  const mount = makeTarget();
  let clock = 0;
  const touch = new TouchControls(input, mount, { now: () => clock });
  touch.attach();
  return {
    touch,
    mount,
    fired,
    clock: (ms) => {
      clock = ms;
    },
  };
}

// ---- swipes ----------------------------------------------------------------

test("swiping left queues a lane change left", () => {
  const h = makeHarness();
  h.play();
  h.swipeX(-THRESHOLD() * 1.5);
  assert.equal(h.drain("left"), 1);
});

test("swiping right queues a lane change right", () => {
  const h = makeHarness();
  h.play();
  h.swipeX(THRESHOLD() * 1.5);
  assert.equal(h.drain("right"), 1);
});

test("a fast flick pays out every lane it crosses, in one frame", () => {
  const h = makeHarness();
  h.play();
  assert.equal(h.game.player.laneIndex, 1);
  h.swipeX(THRESHOLD() * 2.4); // two lanes' worth, one gesture
  assert.equal(
    h.queued("right"),
    2,
    "both steps must survive the same frame, unlike a Set"
  );
  h.frame(); // the queue must still be full when the game reads it
  assert.equal(h.game.player.laneIndex, 2, "middle lane to right edge");
});

test("dragging back reverses the lane steps", () => {
  const h = makeHarness();
  h.play();
  h.down();
  h.move(ORIGIN.x + THRESHOLD() * 1.4, ORIGIN.y); // one lane out
  h.move(ORIGIN.x + THRESHOLD() * 0.4, ORIGIN.y); // dragged back
  h.up(ORIGIN.x + THRESHOLD() * 0.4, ORIGIN.y);
  assert.equal(h.drain("right"), 1);
  assert.equal(h.drain("left"), 1);
});

test("a swipe short of the threshold counts as a tap, not a lane change", () => {
  const h = makeHarness();
  h.play();
  h.swipeX(THRESHOLD() * 0.5); // 14px: past nothing, short of the 28px swipe
  assert.equal(h.drain("left"), 0);
  assert.equal(h.drain("right"), 0);
  assert.equal(h.drain("dash"), 1, "a short flick still dashes");
  h.frame();
  assert.equal(h.game.player.laneIndex, 1);
});

test("a horizontal swipe does not jump", () => {
  const h = makeHarness();
  h.play();
  h.swipeX(THRESHOLD() * 2, 0);
  h.swipeY(-THRESHOLD() * 2);
  assert.equal(h.drain("jump"), 1, "only the vertical gesture jumps");
});

test("swiping up jumps while a run is live", () => {
  const h = makeHarness();
  h.play();
  h.swipeY(-THRESHOLD() * 2);
  assert.equal(h.queued("jump"), 1);
  h.frame();
  assert.equal(h.game.player.grounded, false, "the player is airborne");
});

test("swiping down does nothing — no slide in this game", () => {
  const h = makeHarness();
  h.play();
  h.swipeY(THRESHOLD() * 3);
  assert.equal(h.drain("jump"), 0);
  assert.equal(h.drain("dash"), 0);
  assert.equal(h.drain("left"), 0);
  assert.equal(h.drain("right"), 0);
});

test("an upward swipe on the menu starts the run", () => {
  const h = makeHarness();
  assert.equal(h.game.state, "ready");
  h.swipeY(-THRESHOLD() * 2);
  assert.equal(h.queued("confirm"), 1);
  h.frame();
  assert.equal(h.game.state, "playing");
});

// ---- taps ------------------------------------------------------------------

test("tapping the track dashes when the meter is full", () => {
  const h = makeHarness();
  h.play();
  h.game.setDashEnergy(1);
  h.frame();
  h.tap();
  assert.equal(h.queued("dash"), 1);
  h.frame();
  assert.equal(h.game.player.dashing, true);
});

test("a tap on the menu starts the run instead of dashing", () => {
  const h = makeHarness();
  h.tap();
  assert.equal(h.queued("confirm"), 1);
  assert.equal(h.queued("dash"), 0);
  h.frame();
  assert.equal(h.game.state, "playing");
});

test("a tap after a crash restarts the run", () => {
  const h = makeHarness();
  h.play();
  h.game.endRun();
  assert.equal(h.game.state, "gameover");
  h.tap();
  h.frame();
  assert.equal(h.game.state, "playing", "tap again, like Subway Surfers");
});

test("a tap still counts when the finger drifts inside the slop", () => {
  const h = makeHarness();
  h.play();
  h.down();
  h.move(ORIGIN.x + CONFIG.touch.tapSlopPx - 4, ORIGIN.y - 3);
  h.up(ORIGIN.x + CONFIG.touch.tapSlopPx - 4, ORIGIN.y - 3);
  assert.equal(h.drain("dash"), 1);
});

test("moving past the tap slop but short of the swipe is a dead zone", () => {
  const h = makeHarness();
  h.play();
  const halfway = Math.round(
    (CONFIG.touch.tapSlopPx + CONFIG.touch.swipeThreshold) / 2
  );
  h.down();
  h.move(ORIGIN.x, ORIGIN.y - halfway);
  h.up(ORIGIN.x, ORIGIN.y - halfway);
  assert.ok(CONFIG.touch.tapSlopPx < halfway && halfway < THRESHOLD());
  assert.equal(h.drain("dash"), 0);
  assert.equal(h.drain("jump"), 0);
});

// ---- hold to pause ---------------------------------------------------------

test("holding a finger down pauses on lift", () => {
  const h = makeHarness();
  h.play();
  h.hold(CONFIG.touch.holdToPauseMs + 120);
  assert.equal(h.queued("pause"), 1);
  h.frame();
  assert.equal(h.game.state, "paused");
});

test("holding again while paused resumes the run", () => {
  const h = makeHarness();
  h.play();
  h.hold(CONFIG.touch.holdToPauseMs + 100);
  h.frame();
  assert.equal(h.game.state, "paused");
  h.hold(CONFIG.touch.holdToPauseMs + 100);
  h.frame();
  assert.equal(h.game.state, "playing");
});

test("a hold under the pause window is still just a tap", () => {
  const h = makeHarness();
  h.play();
  h.hold(CONFIG.touch.holdToPauseMs - 120);
  assert.equal(h.drain("pause"), 0);
  assert.equal(h.drain("dash"), 1);
});

test("a hold that drifted too far is neither tap nor pause", () => {
  const h = makeHarness();
  h.play();
  h.down();
  h.advance(CONFIG.touch.holdToPauseMs + 200);
  h.up(ORIGIN.x + CONFIG.touch.tapSlopPx * 4, ORIGIN.y);
  assert.equal(h.drain("pause"), 0);
  assert.equal(h.drain("dash"), 0);
});

// ---- touch discipline ------------------------------------------------------

test("touches are consumed so the page cannot scroll or zoom", () => {
  const h = makeHarness();
  const down = h.down();
  const move = h.move(ORIGIN.x - 80, ORIGIN.y);
  const up = h.up(ORIGIN.x - 80, ORIGIN.y);
  assert.equal(down.defaultPrevented, true);
  assert.equal(move.defaultPrevented, true);
  assert.equal(up.defaultPrevented, true);
});

test("touch listeners are non-passive, or preventDefault is ignored", () => {
  const h = makeHarness();
  for (const type of ["touchstart", "touchmove", "touchend"]) {
    assert.deepEqual(
      h.mount.optionsFor(type),
      { passive: false },
      `${type} must be cancelable`
    );
  }
});

test("a second finger voids the swipe in flight", () => {
  const h = makeHarness();
  h.play();
  h.down(ORIGIN.x, ORIGIN.y, 0);
  h.move(ORIGIN.x - THRESHOLD() * 0.9, ORIGIN.y, 0); // not yet a lane
  h.down(ORIGIN.x - 60, ORIGIN.y + 40, 1); // pinch arrives
  h.move(ORIGIN.x - THRESHOLD() * 3, ORIGIN.y, 0, [
    finger(0, ORIGIN.x - THRESHOLD() * 3, ORIGIN.y),
    finger(1, ORIGIN.x - 60, ORIGIN.y + 40),
  ]);
  h.up(ORIGIN.x - THRESHOLD() * 3, ORIGIN.y, 0, [finger(1, 10, 10)]);
  assert.equal(h.drain("left"), 0, "a pinch must not change lanes");
  assert.equal(h.drain("dash"), 0);
  assert.equal(h.touch.gesture, null);
});

test("the gesture owner is the finger that came down first", () => {
  const h = makeHarness();
  h.play();
  h.down(ORIGIN.x, ORIGIN.y, 3);
  h.move(ORIGIN.x - THRESHOLD() * 1.4, ORIGIN.y, 3);
  // A different finger lifts: the tracked gesture must survive it.
  h.mount.emit(
    "touchend",
    touchEvent("touchend", [finger(3, ORIGIN.x - THRESHOLD() * 1.4, ORIGIN.y)], [
      finger(9, ORIGIN.x, ORIGIN.y),
    ])
  );
  assert.notEqual(h.touch.gesture, null, "still tracking finger 3");
  h.up(ORIGIN.x - THRESHOLD() * 1.4, ORIGIN.y, 3);
  assert.equal(h.drain("left"), 1);
});

test("touchcancel drops the gesture without firing anything", () => {
  const h = makeHarness();
  h.play();
  h.down();
  h.move(ORIGIN.x - THRESHOLD() * 2, ORIGIN.y);
  h.drain("left"); // the swipe already paid out; now the system steals it
  h.down();
  h.mount.emit("touchcancel", touchEvent("touchcancel", []));
  assert.equal(h.touch.gesture, null);
  h.up(ORIGIN.x, ORIGIN.y); // the ghost lift must not fire a tap
  assert.equal(h.drain("dash"), 0);
});

test("detach stops listening, attach starts again", () => {
  const h = makeHarness();
  h.play();
  h.touch.detach();
  assert.equal(h.mount.count("touchstart"), 0);
  h.swipeX(-THRESHOLD() * 2);
  assert.equal(h.drain("left"), 0);
  h.touch.attach();
  h.swipeX(-THRESHOLD() * 1.4);
  assert.equal(h.drain("left"), 1);
});

test("disabled touch controls fire nothing", () => {
  const h = makeHarness();
  h.play();
  h.touch.enabled = false;
  h.swipeX(-THRESHOLD() * 2);
  h.tap();
  h.hold(CONFIG.touch.holdToPauseMs + 500);
  assert.equal(h.drain("left"), 0);
  assert.equal(h.drain("dash"), 0);
  assert.equal(h.drain("pause"), 0);
});

test("a gesture mid-run cannot reach a paused game", () => {
  const h = makeHarness();
  h.play();
  h.game.pause();
  h.swipeX(-THRESHOLD() * 2);
  h.tap();
  h.frame();
  assert.equal(h.game.player.laneIndex, 1, "the run stays where you left it");
  assert.equal(h.game.state, "paused");
});

// ---- the keyboard is still the keyboard ------------------------------------

test("a trigger does not occupy the held-key slot", () => {
  const h = makeHarness();
  h.play();
  h.touch.enabled = true;
  h.tap();
  assert.equal(h.input.held.size, 0, "phantom held keys swallow real presses");
  // A real Shift keypress right after a tap must still be visible.
  h.input.onKeyDown({ code: "ShiftLeft", preventDefault() {} });
  h.input.onKeyUp({ code: "ShiftLeft" });
  assert.equal(h.drain("dash"), 2, "the tap and the key both land");
});

test("the queue drains at the end of a frame, like keypresses", () => {
  const h = makeHarness();
  h.play();
  h.tap();
  assert.equal(h.queued("dash"), 1);
  h.frame();
  assert.equal(h.queued("dash"), 0, "nothing carries into the next frame");
});

test("trigger respects InputManager.enabled", () => {
  const { touch, mount, fired, clock } = makeTouchOnly();
  clock(0);
  touch.input.enabled = false;
  mount.emit("touchstart", touchEvent("touchstart", [finger(0, 10, 10)]));
  mount.emit("touchend", touchEvent("touchend", [], [finger(0, 10, 10)]));
  assert.deepEqual(fired, []);
});

// ---- config + wiring -------------------------------------------------------

test("CONFIG.touch exposes every gesture knob with sane values", () => {
  const cfg = CONFIG.touch;
  assert.ok(cfg.swipeThreshold > 10 && cfg.swipeThreshold < 80);
  assert.ok(cfg.tapSlopPx > 0 && cfg.tapSlopPx < cfg.swipeThreshold);
  assert.ok(cfg.holdToPauseMs > 200, "long enough not to catch a tap");
  assert.equal(typeof cfg.attachAlways, "boolean");
  assert.equal(typeof cfg.showPauseButton, "boolean");
});

test("the HUD pause button toggles the run both ways", () => {
  const h = makeHarness();
  assert.equal(typeof h.hud.onPause, "function", "Game wires it up");
  h.game.requestStart();
  assert.equal(h.hud.onPause(), true);
  assert.equal(h.game.state, "paused");
  assert.equal(h.hud.onPause(), true);
  assert.equal(h.game.state, "playing");
});

test("the pause button is inert on the menu screens", () => {
  const h = makeHarness();
  assert.equal(h.game.pressPauseButton(), false);
  assert.equal(h.game.state, "ready");
  h.game.requestStart();
  h.game.endRun();
  assert.equal(h.game.pressPauseButton(), false);
  assert.equal(h.game.state, "gameover");
});

// ---- Player lane maths -----------------------------------------------------

test("stepLane clamps a multi-lane flick at the edge of the track", () => {
  const h = makeHarness();
  h.play();
  h.game.player.stepLane(9);
  assert.equal(h.game.player.laneIndex, CONFIG.lanes.length - 1);
  h.game.player.stepLane(-9);
  assert.equal(h.game.player.laneIndex, 0);
});

test("each lane crossed on a flick ticks once for the audio", () => {
  const h = makeHarness();
  h.play();
  const lanes = [];
  h.events.on("player:lane", (index) => lanes.push(index));
  h.swipeX(THRESHOLD() * 2.4);
  h.frame();
  assert.deepEqual(lanes, [2], "one tick per lane actually moved");
});
