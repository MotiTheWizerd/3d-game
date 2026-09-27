import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Game } from "../../src/three-game/game/Game.js";
import { EventBus } from "../../src/three-game/core/EventBus.js";
import { InputManager } from "../../src/three-game/core/InputManager.js";

// Focus-loss hygiene: a key that is still logically "down" when the player
// leaves the window used to stay down forever, because the browser never sends
// the keyup. `held` is also the auto-repeat guard, so the dead key took the
// action with it — the bug behind "I alt-tabbed and now the game ignores me".

// ---- harness ---------------------------------------------------------------

/** Target that records every listener so attach/detach can be asserted. */
function makeTarget() {
  return {
    listeners: {},
    addEventListener(type, fn) {
      const list = (this.listeners[type] ||= []);
      // A real EventTarget ignores a duplicate (type, handler) pair; the fake
      // must too, or "re-attach is safe" tests the fake instead of the code.
      if (!list.includes(fn)) list.push(fn);
    },
    removeEventListener(type, fn) {
      const list = this.listeners[type] || [];
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    },
    fire(type, event = {}) {
      for (const fn of [...(this.listeners[type] || [])]) fn(event);
    },
    count(type) {
      return (this.listeners[type] || []).length;
    },
  };
}

function makeInput(target = makeTarget()) {
  const input = new InputManager(target);
  input.target = target;
  input.press = (code) => {
    input.onKeyDown({ code, preventDefault() {} });
    input.onKeyUp({ code });
  };
  return input;
}

function makeGame(input) {
  const engine = {
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(60, 1, 0.1, 300),
  };
  const hud = {
    showReady() {},
    showPaused() {},
    showGameOver() {},
    hide() {},
  };
  const game = new Game({ engine, events: new EventBus(), input, hud });
  return game;
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

/**
 * Simulate the exact broken state: key goes down, one frame is simulated (so
 * the press itself is consumed like any real press), then focus vanishes and
 * the keyup never arrives. `held` is now stuck with no queued press.
 */
function holdForever(input, code) {
  input.onKeyDown({ code, preventDefault() {} }); // deliberately never released
  input.endFrame(); // that press lands and drains, as it would in a live frame
}

// ---- the leak itself -------------------------------------------------------

test("a key held across focus loss is pressable again after blur", () => {
  const input = makeInput();
  holdForever(input, "ArrowRight");
  assert.equal(input.isDown("right"), true, "keydown landed");

  input.onBlur(); // as if the window lost focus; no keyup ever arrives
  assert.equal(input.isDown("right"), false, "blur must forget the key");

  input.press("ArrowRight");
  assert.equal(input.consume("right"), true, "the next real press is not swallowed");
});

test("without the blur fix the held key stays dead (the bug, pinned)", () => {
  const input = makeInput();
  holdForever(input, "ArrowRight");
  input.press("ArrowRight"); // keydown+keyup while still "held" -> invisible
  assert.equal(input.consume("right"), false, "this is the leak, pre-fix shape");
  input.onBlur();
  input.press("ArrowRight");
  assert.equal(input.consume("right"), true, "and this is it fixed");
});

test("blur releases every held action at once", () => {
  const input = makeInput();
  holdForever(input, "ArrowLeft");
  holdForever(input, "Space");
  holdForever(input, "ShiftLeft");
  assert.equal(input.held.size, 3);
  input.onBlur();
  assert.equal(input.held.size, 0);
});

test("blur never invents a press", () => {
  const input = makeInput();
  holdForever(input, "ArrowRight");
  input.onBlur();
  assert.equal(input.justPressed.size, 0, "releasing must not queue a lane change");
});

test("blur clears held without touching an already-queued press", () => {
  const input = makeInput();
  input.press("ArrowRight"); // a real, completed press this frame
  input.onBlur();
  assert.equal(input.consume("right"), true, "a press in flight survives the reset");
});

// ---- wiring ----------------------------------------------------------------

test("attach listens for blur and detach stops", () => {
  const target = makeTarget();
  const input = makeInput(target);
  input.attach();
  assert.equal(target.count("blur"), 1);
  holdForever(input, "ArrowRight");
  target.fire("blur");
  assert.equal(input.isDown("right"), false, "the real event path works");

  input.attach(); // re-attach keeps exactly one listener per event
  assert.equal(target.count("blur"), 1);

  input.detach();
  assert.equal(target.count("blur"), 0);
  assert.equal(target.count("keydown"), 0);
});

test("blur before attach is a no-op, not a crash", () => {
  const input = makeInput();
  assert.doesNotThrow(() => input.onBlur());
});

test("a stuck held key does not block the pause key", () => {
  const input = makeInput();
  holdForever(input, "ArrowRight");
  input.press("KeyP");
  assert.equal(input.consume("pause"), true, "pause was never the broken key");
  input.onBlur();
  input.press("ArrowRight");
  assert.equal(input.consume("right"), true);
});

// ---- the tab-switch route (visibilitychange, which blur can be skipped for) --

test("hiding the tab drops held keys along with pausing the run", () => {
  const input = makeInput();
  const game = makeGame(input);
  game.requestStart();
  game.update(1 / 60);
  holdForever(input, "ArrowRight");

  const doc = makeDoc();
  game.attachVisibility(doc);
  doc.hidden = true;
  doc.handler();

  assert.equal(game.state, "paused", "auto-pause still happens");
  assert.equal(input.isDown("right"), false, "and the key comes back next time");
});

test("coming back to the tab does not release keys the player is legitimately riding", () => {
  const input = makeInput();
  const game = makeGame(input);
  game.requestStart();
  const doc = makeDoc();
  game.attachVisibility(doc);
  doc.hidden = true;
  doc.handler();
  input.onKeyDown({ code: "ArrowRight", preventDefault() {} }); // held while hidden
  doc.hidden = false;
  doc.handler(); // return: releaseAll is for leaving, not for coming back
  assert.equal(input.isDown("right"), true);
});
