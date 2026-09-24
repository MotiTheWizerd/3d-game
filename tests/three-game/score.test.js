import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { ScoreSystem } from "../../src/three-game/systems/ScoreSystem.js";
import { CONFIG } from "../../src/three-game/config.js";

// Minimal localStorage stub so tests don't depend on Node's webstorage flags
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

// Records every score:changed emit so assertions can inspect the event stream
function makeBus() {
  const bus = { log: [], emit(name, payload) { this.log.push({ name, payload }); } };
  return bus;
}

beforeEach(() => {
  store.clear();
});

test("starts at zero with no saved best", () => {
  const bus = makeBus();
  const score = new ScoreSystem(bus);
  assert.equal(score.distance, 0);
  assert.equal(score.coins, 0);
  assert.equal(score.best, 0);
});

test("addDistance accumulates scaled by distanceScale", () => {
  const score = new ScoreSystem(makeBus());
  score.addDistance(10);
  score.addDistance(5.7);
  assert.ok(Math.abs(score.distance - (10 + 5.7) * CONFIG.score.distanceScale) < 1e-9);
  assert.equal(score.score, Math.floor(score.distance));
});

test("addCoin adds coin value to score", () => {
  const score = new ScoreSystem(makeBus());
  score.addDistance(3.2);
  score.addCoin();
  score.addCoin();
  assert.equal(score.score, 3 + 2 * CONFIG.coins.value);
});

test("score publishes score:changed on every mutation", () => {
  const bus = makeBus();
  const score = new ScoreSystem(bus);
  assert.equal(bus.log.length, 0);
  score.addDistance(1);
  score.addCoin();
  score.reset();
  assert.equal(bus.log.length, 3);
  for (const entry of bus.log) {
    assert.equal(entry.name, "score:changed");
    assert.equal(typeof entry.payload.score, "number");
  }
});

test("reset returns distance and coins to zero but keeps best", () => {
  const score = new ScoreSystem(makeBus());
  score.addDistance(50);
  score.addCoin();
  score.finalize();
  score.reset();
  assert.equal(score.distance, 0);
  assert.equal(score.coins, 0);
  assert.ok(score.best > 0);
});

test("finalize keeps best unchanged when score is lower", () => {
  const score = new ScoreSystem(makeBus());
  score.addDistance(100);
  score.finalize();
  const bestAfterHigh = score.best;
  score.reset();
  score.addDistance(10);
  score.finalize();
  assert.equal(score.best, bestAfterHigh);
});

test("finalize persists new best and a fresh instance loads it", () => {
  const first = new ScoreSystem(makeBus());
  first.addDistance(80);
  first.addCoin();
  const finalScore = first.finalize();
  assert.equal(finalScore, first.score);
  assert.equal(store.get(CONFIG.score.bestKey), String(first.score));

  const second = new ScoreSystem(makeBus());
  assert.equal(second.best, first.score);
});

test("publish reports best as max(saved best, current score)", () => {
  const bus = makeBus();
  const score = new ScoreSystem(bus);
  score.best = 1000; // simulate a previously saved higher best
  score.addDistance(5);
  const payload = bus.log.at(-1).payload;
  assert.equal(payload.best, 1000);
});

test("corrupt localStorage values are treated as 0", () => {
  store.set(CONFIG.score.bestKey, "not-a-number");
  const score = new ScoreSystem(makeBus());
  assert.equal(score.best, 0);
});