import { test } from "node:test";
import assert from "node:assert/strict";
import { EventBus } from "../../src/three-game/core/EventBus.js";
import { HUD } from "../../src/three-game/ui/HUD.js";

// ---- Minimal fake DOM ------------------------------------------------------
// Covers exactly the DOM surface HUD.js touches: getElementById, createElement,
// classList, attributes, listeners, style.width, appendChild/removeChild, blur.

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
  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }
  click() {
    for (const fn of [...(this.listeners.get("click") ?? [])]) fn({});
  }

  appendChild(el) {
    el.parentNode = this;
    this.children.push(el);
    return el;
  }
  removeChild(el) {
    this.children = this.children.filter((c) => c !== el);
    el.parentNode = null;
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
    ["hud-level", "div"],
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
  const events = new EventBus();
  const hud = new HUD(events);
  return { hud, events, document: globalThis.document };
}

// ---- Pause overlay ---------------------------------------------------------

test("showPaused shows the pause card and puts is-paused on the body", () => {
  const { hud } = makeHud();
  hud.showPaused(120);

  assert.equal(hud.titleEl.textContent, "Paused");
  assert.equal(hud.messageEl.textContent, "Score 120 — the track will wait.");
  assert.equal(hud.buttonEl.textContent, "Resume");
  assert.ok(hud.overlay.classList.contains("visible"));
  assert.ok(hud.restartEl.classList.contains("visible"), "restart button shown while paused");
  assert.ok(globalThis.document.body.classList.contains("is-paused"));
});

test("hide removes the overlay, restart button and body is-paused", () => {
  const { hud } = makeHud();
  hud.showPaused(50);
  hud.hide();

  assert.ok(!hud.overlay.classList.contains("visible"));
  assert.ok(!hud.restartEl.classList.contains("visible"));
  assert.ok(!globalThis.document.body.classList.contains("is-paused"));
});

// ---- ⏸ / ▶ swap ---------------------------------------------------------------

test("state:changed swaps the pause glyph both ways", () => {
  const { hud, events } = makeHud();

  events.emit("state:changed", "paused");
  assert.equal(hud.pauseEl.textContent, "▶");
  assert.equal(hud.pauseEl.title, "Resume run");
  assert.equal(hud.pauseEl.getAttribute("aria-label"), "Resume run");
  assert.ok(hud.pauseEl.classList.contains("is-resume"));

  events.emit("state:changed", "running");
  assert.equal(hud.pauseEl.textContent, "⏸");
  assert.equal(hud.pauseEl.title, "Pause run");
  assert.ok(!hud.pauseEl.classList.contains("is-resume"));
});

test("the pause button click fires onPause and blurs itself", () => {
  const { hud } = makeHud();
  let clicks = 0;
  hud.onPause = () => clicks++;

  hud.pauseEl.click();
  hud.pauseEl.click();
  assert.equal(clicks, 2);
  assert.ok(hud.pauseEl.blurred, "button blurs so Space can't re-trigger it");
});

test("setPauseButtonVisible(false) hides the button, true shows it again", () => {
  const { hud } = makeHud();
  hud.setPauseButtonVisible(false);
  assert.ok(hud.pauseEl.classList.contains("hidden"));
  hud.setPauseButtonVisible(true);
  assert.ok(!hud.pauseEl.classList.contains("hidden"));
});

// ---- Mute mirror ---------------------------------------------------------------

test("the mute button requests a toggle and mirrors AudioManager state", () => {
  const { hud, events } = makeHud();
  let requested = 0;
  events.on("audio:toggle-requested", () => requested++);

  hud.muteEl.click();
  assert.equal(requested, 1);
  assert.ok(hud.muteEl.blurred);

  events.emit("audio:muted-changed", { muted: true });
  assert.equal(hud.muteEl.textContent, "🔇");
  assert.equal(hud.muteEl.getAttribute("aria-pressed"), "true");

  events.emit("audio:muted-changed", { muted: false });
  assert.equal(hud.muteEl.textContent, "🔊");
  assert.equal(hud.muteEl.getAttribute("aria-pressed"), "false");
});

// ---- Score / dash ---------------------------------------------------------------

test("score:changed updates the three stats and dash fill tracks energy", () => {
  const { hud, events } = makeHud();

  events.emit("score:changed", { score: 42, coins: 7, best: 999 });
  assert.equal(hud.scoreEl.textContent, "42");
  assert.equal(hud.coinsEl.textContent, "7");
  assert.equal(hud.bestEl.textContent, "999");

  events.emit("dash:energy-changed", 0.5);
  assert.equal(hud.dashFillEl.style.width, "50%");
  assert.ok(!hud.dashEl.classList.contains("ready"));

  events.emit("dash:energy-changed", 1);
  assert.equal(hud.dashFillEl.style.width, "100%");
  assert.ok(hud.dashEl.classList.contains("ready"));
});

// ---- Game over / start overlay ----------------------------------------------------

test("showGameOver renders the NEW BEST celebration only when it is one", () => {
  const { hud } = makeHud();
  hud.showGameOver(4242, 4242, true);
  assert.equal(hud.titleEl.textContent, "\u{1F3C6} New Best!");
  assert.equal(hud.messageEl.textContent, "Score 4242 · Best 4242");
  assert.ok(hud.cardEl.classList.contains("is-new-best"));

  hud.showGameOver(10, 4242, false);
  assert.equal(hud.titleEl.textContent, "Run Over");
  assert.ok(!hud.cardEl.classList.contains("is-new-best"));
});

test("showReady shows the best line only once a best exists", () => {
  const { hud } = makeHud();
  hud.showReady(777);
  assert.equal(hud.bestLineEl.textContent, "Best 777");
  assert.equal(hud.bestLineEl.hidden, false);

  hud.showReady(0);
  assert.equal(hud.bestLineEl.hidden, true);
});

// ---- Power-up badges -----------------------------------------------------------------

test("powerup badges appear on collect and fade out on expiry", () => {
  const { hud, events } = makeHud();

  events.emit("powerup:collected", { type: "shield" });
  assert.equal(hud.powerupEl.children.length, 1);
  const badge = hud.powerupEl.children[0];
  assert.ok(badge.classList.contains("active"));
  assert.equal(badge.style.opacity, "1");

  // Collecting the same type again reuses the badge instead of stacking.
  events.emit("powerup:collected", { type: "shield" });
  assert.equal(hud.powerupEl.children.length, 1);

  events.emit("powerup:expired", { type: "shield" });
  assert.ok(!badge.classList.contains("active"));
  assert.equal(badge.style.opacity, "0");
  assert.equal(hud.powerupEl.children.length, 1, "removed only after the 300ms fade");

// ---- Level toast -----------------------------------------------------------------

test("level:changed flashes the LEVEL N toast", () => {
  const { hud, events } = makeHud();

  events.emit("level:changed", { level: 2, previous: 1 });
  assert.equal(hud.levelEl.textContent, "LEVEL 2");
  assert.ok(hud.levelEl.classList.contains("visible"));

  events.emit("level:changed", { level: 3, previous: 2 });
  assert.equal(hud.levelEl.textContent, "LEVEL 3", "toast reuses the one element");
});

test("hide clears a stale level toast with the overlay", () => {
  const { hud, events } = makeHud();

  events.emit("level:changed", { level: 3, previous: 2 });
  assert.ok(hud.levelEl.classList.contains("visible"));

  hud.hide();
  assert.ok(!hud.levelEl.classList.contains("visible"), "toast cleared");
});

test("a DOM without the level markup never crashes the HUD", () => {
  globalThis.document = buildDocument();
  delete globalThis.document.byId["hud-level"];
  const events = new EventBus();
  const hud = new HUD(events);

  events.emit("level:changed", { level: 2, previous: 1 });
  hud.hide();
  assert.equal(hud.levelEl, null);
});
});