import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { World } from "../../src/three-game/game/World.js";
import { CONFIG } from "../../src/three-game/config.js";

function makeWorld() {
  return new World(new THREE.Scene());
}

test("builds dashCount dashes on each side (2 lanes worth)", () => {
  const world = makeWorld();
  assert.equal(world.dashes.length, CONFIG.world.dashCount * 2);
});

test("dashes start behind the player at fixed spacing and remember baseZ", () => {
  const world = makeWorld();
  const laneA = world.dashes.slice(0, CONFIG.world.dashCount);
  for (const [i, dash] of laneA.entries()) {
    assert.ok(Math.abs(dash.position.z - (-i * CONFIG.world.dashSpacing)) < 1e-9);
    assert.equal(dash.userData.baseZ, dash.position.z);
  }
});

test("update scrolls dashes forward by speed*dt", () => {
  const world = makeWorld();
  const before = world.dashes.map((d) => d.position.z);
  world.update(0.5, 20); // travel = 10
  for (const [i, dash] of world.dashes.entries()) {
    assert.ok(Math.abs(dash.position.z - (before[i] + 10)) < 1e-9);
  }
});

test("dashes wrap around instead of running away forever", () => {
  const world = makeWorld();
  // park every dash just under the recycle line, then take a big step
  for (const dash of world.dashes) dash.position.z = CONFIG.world.recycleZ - 1;
  world.update(1, 30); // travel 30 -> z = 45 > recycleZ -> wrap by total length
  const total = CONFIG.world.dashCount * CONFIG.world.dashSpacing;
  for (const dash of world.dashes) {
    assert.ok(dash.position.z <= CONFIG.world.recycleZ, "must wrap past recycleZ");
    assert.ok(Math.abs(dash.position.z - (CONFIG.world.recycleZ - 1 + 30 - total)) < 1e-9);
  }
});

test("reset puts every dash back at its original z", () => {
  const world = makeWorld();
  world.update(2, 40);
  world.reset();
  for (const dash of world.dashes) {
    assert.equal(dash.position.z, dash.userData.baseZ);
  }
});

test("scene contains lights after build (hemi + directional + rim)", () => {
  const world = makeWorld();
  const lights = world.scene.children.filter((o) => o.isLight);
  assert.equal(lights.length, 3);
  assert.ok(world.rim.isPointLight);
});