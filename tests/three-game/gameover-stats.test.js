import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { EventBus } from "../../src/three-game/core/EventBus.js";
import { InputManager } from "../../src/three-game/core/InputManager.js";
import { Game } from "../../src/three-game/game/Game.js";
import { HUD } from "../../src/three-game/ui/HUD.js";
import { ScoreSystem } from "../../src/three-game/systems/ScoreSystem.js";

// ---- minimal fake DOM (same shape as hud-dom.test.js) -----------------------
// Covers exactly the DOM surface HUD.js touches.

class FakeElement {
  constructor(tag = "div") {
    this.tagName = tag.toUpperCase();
    this.id = "";
    this.__classes = [];
    this.children = [];
    this.parentNode = null;
    this.textContent = "";
    this.hidden = false;
    this.style = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.blurred = false;
  }

  get className() {
    return this.__classes.join(" ");
  }
  set className(v) {
    this.__classes = v ? v.split(/\s+/) : [];
  }
  get classList() {
    const self = this;
    return {
      add: (...cls) => {
        for (const c of cls) if (!self.__classes.includes(c)) self.__classes.push(c);
      },
      remove: (...cls) => {
        self.__classes = self.__classes.filter((c) => !cls.includes(c));
      },
      toggle: (cls, force) => {
        const has = self.__classes.includes(cls);
        const want = force === undefined ? !has : !!force;
        if (want && !has) self.__classes.push(cls);
        if (!want && has) self.classList.remove(cls);
        return want;
      },
      contains: (cls) => self.__classes.includes(cls),
    };
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }

  appendChild(el) {
    el.parentNode = this;
    this.children.push(el);
    return el;
  }

  // HUD only queries the overlay for ".overlay-card".
  querySelector(selector) {
    const cls = selector.startsWith(".") ? selector.slice(1) : null;
    for (const child of this.children) {
      if (cls && child.__classes.includes(cls)) return child;
      const hit = child.querySelector(selector);
      if (hit) return hit;
    }
    return null;
  }

  blur() {
    this.blurred = true;
  }
}

// Build the DOM exactly as index.html lays it out.
function buildDocument() {
  const el = (id, tag = "div") => {
    const e = new FakeElement(tag);
    e.id = id;
    return e;
  };
  const doc = {
    body: new FakeElement("body"),
    byId: {},
    getElementById(id) {
      return doc.byId[id] ?? null;
    },
    createElement(tag) {
      return new FakeElement(tag);
    },
  };

  const overlay = el("overlay");
  const card = new FakeElement("div");
  card.__classes = ["overlay-card"];
  overlay.appendChild(card);

  for (const [id, tag] of [
    ["overlay-title", "h1"],
    ["overlay-message", "p"],
    ["overlay-button", "button"],
    ["overlay-restart", "button"],
    ["overlay-best", "p"],
    ["overlay-stats", "div"],
    ["stat-distance", "span"],
    ["stat-coins", "span"],
    ["stat-smashes", "span"],
    ["stat-time", "span"],
    ["hud-score", "span"],
    ["hud-best", "span"],
    ["hud-coins", "span"],
    ["hud-mute", "button"],
    ["hud-pause", "button"],
    ["hud-dash", "div"],
    ["hud-dash-fill", "div"],
    ["hud-powerups", "div"],
  ]) {
    const node = el(id, tag);
    doc.byId[id] = node;
    if (id.startsWith("overlay")) overlay.appendChild(node);
  }
  doc.byId["overlay"] = overlay;
  return doc;
}

function makeHud() {
  globalThis.document = buildDocument();
  return new HUD(new EventBus());
}

// ---- recording HUD + Game harness (same shape as shield-crash.test.js) ------

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
  return new Game({ engine, events, input: makeInput(), hud });
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

// ---- ScoreSystem -------------------------------------------------------------

test("addSmash counts obstacles smashed and reset clears the count", () => {
  const score = new ScoreSystem(new EventBus());
  score.addSmash();
  score.addSmash();
  score.addSmash();
  assert.equal(score.smashes, 3);
  score.reset();
  assert.equal(score.smashes, 0);
});

// ---- HUD stat sheet ----------------------------------------------------------

test("showGameOver fills and reveals the stat sheet", () => {
  const hud = makeHud();
  hud.showGameOver(1234, 999, false, {
    distance: 187,
    coins: 23,
    smashes: 4,
    time: 11.7,
  });

  assert.equal(hud.statsEl.hidden, false);
  assert.equal(hud.statEls.distance.textContent, "187 m");
  assert.equal(hud.statEls.coins.textContent, "23");
  assert.equal(hud.statEls.smashes.textContent, "4");
  assert.equal(hud.statEls.time.textContent, "11.7s");
});

test("showGameOver without stats keeps the sheet hidden", () => {
  const hud = makeHud();
  hud.showGameOver(10, 4242, false);
  assert.equal(hud.statsEl.hidden, true);
});

test("showReady and showPaused hide a stale stat sheet", () => {
  const hud = makeHud();
  hud.showGameOver(10, 10, false, { distance: 5, coins: 0, smashes: 0, time: 1 });
  assert.equal(hud.statsEl.hidden, false);

  hud.showReady(10);
  assert.equal(hud.statsEl.hidden, true, "ready screen hides the sheet");

  hud.showGameOver(10, 10, false, { distance: 5, coins: 0, smashes: 0, time: 1 });
  hud.showPaused(10);
  assert.equal(hud.statsEl.hidden, true, "pause screen hides the sheet");
});

test("a DOM without the stats markup never crashes the HUD", () => {
  globalThis.document = buildDocument();
  // Strip the stat-sheet ids: an older index.html must still work.
  for (const id of [
    "overlay-stats",
    "stat-distance",
    "stat-coins",
    "stat-smashes",
    "stat-time",
  ]) {
    delete globalThis.document.byId[id];
  }
  const hud = new HUD(new EventBus());
  hud.showGameOver(10, 10, false, { distance: 5, coins: 0, smashes: 0, time: 1 });
  assert.equal(hud.statsEl, null);
});

// ---- Game → HUD stats plumbing -----------------------------------------------

test("endRun hands the HUD a full stat sheet", () => {
  const hud = makeRecordingHud();
  const game = makeGame(hud);
  game.startRun();

  for (let i = 0; i < 30; i++) game.update(1 / 60);
  game.endRun();

  assert.equal(hud.calls.length, 1);
  const call = hud.calls[0];
  assert.equal(call.isNewBest, true, "first finished run is a new best");
  assert.ok(call.stats.distance > 0, "distance accumulated");
  assert.ok(call.stats.distance <= 100, "distance stays sane for half a second");
  assert.equal(call.stats.coins, 0);
  assert.equal(call.stats.smashes, 0);
  assert.ok(call.stats.time > 0 && call.stats.time <= 1);
  assert.equal(call.score, game.score.score);
});

test("a shield-absorbed crash shows up as a smash on the sheet", () => {
  const hud = makeRecordingHud();
  const game = makeGame(hud);
  game.startRun();
  game.powerUpSystem.activate("shield");

  plantObstacleOnPlayer(game);
  game.update(1 / 60); // absorbed — obstacle smashed, run continues

  plantObstacleOnPlayer(game);
  game.update(1 / 60); // no shield left — run ends

  assert.equal(game.state, "gameover");
  const stats = hud.calls[0].stats;
  assert.equal(stats.smashes, 1);
});