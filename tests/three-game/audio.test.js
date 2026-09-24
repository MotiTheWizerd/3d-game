import test from "node:test";
import assert from "node:assert/strict";

import { EventBus } from "../../src/three-game/core/EventBus.js";
import { AudioManager } from "../../src/three-game/systems/AudioManager.js";
import { CONFIG } from "../../src/three-game/config.js";

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
  };
}

/** Target double that records listeners so tests can fire DOM events. */
function fakeTarget() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
  };
}

test("config exposes audio tunables", () => {
  assert.equal(typeof CONFIG.audio.masterVolume, "number");
  assert.ok(CONFIG.audio.masterVolume > 0 && CONFIG.audio.masterVolume <= 1);
  assert.equal(typeof CONFIG.audio.mutedKey, "string");
  assert.ok(CONFIG.audio.mutedKey.length > 0);
});

test("subscribes to every game event it reacts to", () => {
  const events = new EventBus();
  const audio = new AudioManager(events, fakeStorage());

  const expected = [
    "player:jumped",
    "player:lane",
    "coin:collected",
    "run:started",
    "run:ended",
    "audio:toggle-requested",
  ];
  for (const name of expected) {
    assert.ok(events.listeners.get(name)?.size >= 1, `missing ${name}`);
  }

  audio.destroy();
});

test("starts unmuted and publishes initial mute state", () => {
  const events = new EventBus();
  const seen = [];
  events.on("audio:muted-changed", (payload) => seen.push(payload));

  const audio = new AudioManager(events, fakeStorage());
  assert.equal(audio.muted, false);

  audio.publishMuteState();
  assert.deepEqual(seen, [{ muted: false }]);

  audio.destroy();
});

test("toggleMute flips state, persists it, and emits", () => {
  const events = new EventBus();
  const storage = fakeStorage();
  const seen = [];
  events.on("audio:muted-changed", (payload) => seen.push(payload));

  const audio = new AudioManager(events, storage);
  audio.toggleMute();

  assert.equal(audio.muted, true);
  assert.equal(storage.getItem(CONFIG.audio.mutedKey), "1");
  assert.deepEqual(seen, [{ muted: true }]);

  audio.toggleMute();
  assert.equal(audio.muted, false);
  assert.equal(storage.getItem(CONFIG.audio.mutedKey), "0");
  assert.deepEqual(seen, [{ muted: true }, { muted: false }]);

  audio.destroy();
});

test("respects a persisted mute on construction", () => {
  const events = new EventBus();
  const audio = new AudioManager(
    events,
    fakeStorage({ [CONFIG.audio.mutedKey]: "1" })
  );
  assert.equal(audio.muted, true);
  audio.destroy();
});

test("the HUD toggle request flips mute through the bus", () => {
  const events = new EventBus();
  const audio = new AudioManager(events, fakeStorage());

  events.emit("audio:toggle-requested", null);
  assert.equal(audio.muted, true);

  events.emit("audio:toggle-requested", null);
  assert.equal(audio.muted, false);

  audio.destroy();
});

test("destroy() unsubscribes every handler", () => {
  const events = new EventBus();
  const audio = new AudioManager(events, fakeStorage());
  audio.destroy();

  events.emit("audio:toggle-requested", null);
  assert.equal(audio.muted, false); // no listener -> unchanged

  for (const set of events.listeners.values()) {
    assert.equal(set.size, 0);
  }
});

test("playing every sound headless is a safe no-op", () => {
  const events = new EventBus();
  const audio = new AudioManager(events, fakeStorage());

  // No window/AudioContext in Node — none of these may throw.
  audio.playJump();
  audio.playLane();
  audio.playCoin();
  audio.playStart();
  audio.playCrash();
  audio.playCrash(true);
  assert.equal(audio.ctx, null);

  // Same for firing the real game events end to end.
  events.emit("run:started", null);
  events.emit("player:jumped", null);
  events.emit("player:lane", 0);
  events.emit("coin:collected", null);
  events.emit("run:ended", { score: 10, best: 10, isNewBest: true });
  events.emit("run:ended", { score: 0, best: 0, isNewBest: false });
  assert.equal(audio.ctx, null);

  audio.destroy();
});

test("ensureContext returns null without a browser window", () => {
  const events = new EventBus();
  const audio = new AudioManager(events, fakeStorage());
  assert.equal(audio.ensureContext(), null);
  audio.destroy();
});

test("M key toggles mute when attached; other keys do not", () => {
  const events = new EventBus();
  const target = fakeTarget();
  const audio = new AudioManager(events, fakeStorage());

  audio.attach(target);
  assert.equal(audio.muted, false);

  target.listeners.get("keydown")({ code: "Space" });
  assert.equal(audio.muted, false);

  target.listeners.get("keydown")({ code: "KeyM" });
  assert.equal(audio.muted, true);

  target.listeners.get("keydown")({ code: "KeyM" });
  assert.equal(audio.muted, false);

  audio.detach();
  assert.equal(target.listeners.size, 0);
  audio.destroy();
});
