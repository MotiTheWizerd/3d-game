import { test } from "node:test";
import assert from "node:assert/strict";
import { DayNightCycle } from "../../src/three-game/systems/DayNightCycle.js";
import { CONFIG } from "../../src/three-game/config.js";

// Minimal stand-in for the game's EventBus: the cycle only ever calls
// events.emit(name, payload), so a recorder is all the harness needs.
function makeEvents() {
  const emitted = [];
  return {
    emitted,
    on() {},
    emit(name, payload) {
      emitted.push({ name, payload });
    },
  };
}

function makeCycle() {
  const events = makeEvents();
  return { events, cycle: new DayNightCycle(events) };
}

test("starts at dawn on the configured start phase", () => {
  const { cycle } = makeCycle();
  assert.equal(cycle.phase, CONFIG.dayNight.startPhase);
  assert.equal(cycle.state.name, "dawn");
  assert.equal(cycle.state.glyph, "🌅");
  // At t=0 the look is exactly the first keyframe's.
  const dawn = CONFIG.dayNight.keyframes[0];
  assert.equal(cycle.state.fogFar, dawn.fogFar);
  assert.equal(cycle.state.night, dawn.night);
});

test("update advances phase by dt/cycleSeconds and repaints the snapshot", () => {
  const { cycle } = makeCycle();
  cycle.update(7.5); // 7.5/75 = 0.1 of a day
  assert.ok(Math.abs(cycle.phase - 0.1) < 1e-9);
  assert.equal(cycle.state.phase, cycle.phase);
});

test("mid-segment look lerps toward the next keyframe", () => {
  const { cycle } = makeCycle();
  cycle.update(2.8125); // phase 0.0375 = a quarter of the way dawn(0)→day(0.15)
  const s = cycle.state;
  const dawn = CONFIG.dayNight.keyframes[0];
  const day = CONFIG.dayNight.keyframes[1];
  assert.ok(Math.abs(s.fogFar - (dawn.fogFar + (day.fogFar - dawn.fogFar) * 0.25)) < 1e-9); // 105
  assert.ok(Math.abs(s.dir - (dawn.dir + (day.dir - dawn.dir) * 0.25)) < 1e-9);
  assert.ok(Math.abs(s.night - (dawn.night + (day.night - dawn.night) * 0.25)) < 1e-9);
  // Colors ride the same lerp (79.25, 79.75, 126.75 on the byte grid).
  assert.equal(s.sky, 0x4f507f);
});

test("crossing a keyframe boundary announces the new segment exactly once", () => {
  const { events, cycle } = makeCycle();
  cycle.update(12); // 0.16 of a day — past the day boundary at 0.15
  assert.equal(events.emitted.length, 1);
  const [first] = events.emitted;
  assert.equal(first.name, "daynight:phase");
  assert.equal(first.payload.name, "day");
  assert.equal(first.payload.glyph, "☀️");
  // Staying inside day emits nothing further.
  cycle.update(12); // 0.32 — still day
  assert.equal(events.emitted.length, 1);
});

test("crossing 1.0 wraps back to dawn and announces it", () => {
  const { events, cycle } = makeCycle();
  cycle.update(74.25); // 0.99 of a day — deep in night
  cycle.update(0.8); // 0.0107 of a day — across the wrap
  assert.ok(cycle.phase < 0.01, "phase wrapped below 1.0");
  assert.equal(cycle.state.name, "dawn");
  assert.equal(events.emitted.length, 2, "night on entry, dawn on wrap");
  const last = events.emitted.at(-1);
  assert.equal(last.name, "daynight:phase");
  assert.equal(last.payload.name, "dawn");
  assert.equal(last.payload.glyph, "🌅");
});

test("the night→dawn wrap segment lerps across the seam", () => {
  const { cycle } = makeCycle();
  cycle.phase = 0.825; // halfway through night(0.65)→dawn(0.65+0.35)
  const s = cycle.snapshot();
  const night = CONFIG.dayNight.keyframes[3];
  const dawn = CONFIG.dayNight.keyframes[0];
  assert.ok(Math.abs(s.fogFar - (night.fogFar + dawn.fogFar) / 2) < 1e-9); // 92.5
  assert.ok(Math.abs(s.dir - (night.dir + dawn.dir) / 2) < 1e-9);
  assert.ok(Math.abs(s.night - (night.night + dawn.night) / 2) < 1e-9); // 0.7
  assert.equal(s.name, "night"); // the segment we are inside
});

test("zero or negative dt is a no-op", () => {
  const { events, cycle } = makeCycle();
  cycle.update(0);
  cycle.update(-1);
  assert.equal(cycle.phase, 0);
  assert.equal(events.emitted.length, 0);
});

test("reset rewinds to the start phase and re-syncs the segment", () => {
  const { cycle } = makeCycle();
  cycle.update(74.25); // deep in night
  cycle.update(0.8); // wrapped into dawn
  cycle.reset();
  assert.equal(cycle.phase, CONFIG.dayNight.startPhase);
  assert.equal(cycle.state.name, "dawn");
  assert.ok(Math.abs(cycle.state.night - CONFIG.dayNight.keyframes[0].night) < 1e-9);
});

test("a null events bus never breaks boundary announcements", () => {
  const cycle = new DayNightCycle(null);
  cycle.update(12);
  assert.equal(cycle.state.name, "day");
});

test("config: keyframes start at 0, ascend, and carry a full palette", () => {
  const keys = CONFIG.dayNight.keyframes;
  assert.ok(keys.length >= 2);
  assert.equal(keys[0].at, 0);
  for (let i = 1; i < keys.length; i++) {
    assert.ok(keys[i].at > keys[i - 1].at, "keyframes must ascend");
  }
  const rgb = ["sky", "fog", "hemiSky", "hemiGround", "dirColor"];
  const num = ["fogNear", "fogFar", "hemi", "dir", "rim", "edgeGlow", "night"];
  for (const k of keys) {
    assert.equal(typeof k.name, "string");
    assert.ok(k.name.length > 0);
    for (const f of rgb) {
      assert.ok(Number.isInteger(k[f]) && k[f] >= 0 && k[f] <= 0xffffff, `${k.name}.${f} must be a hex int`);
    }
    for (const f of num) assert.equal(typeof k[f], "number");
  }
  assert.ok(CONFIG.dayNight.cycleSeconds > 0);
  assert.ok(CONFIG.dayNight.starCount > 0);
  assert.ok(CONFIG.dayNight.startPhase >= 0 && CONFIG.dayNight.startPhase < 1);
});