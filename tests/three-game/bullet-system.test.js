import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { BulletSystem } from "../../src/three-game/systems/BulletSystem.js";
import { CONFIG } from "../../src/three-game/config.js";

function makeSystem() {
  return new BulletSystem(new THREE.Scene());
}

test("fire spawns a bolt at the given position", () => {
  const bullets = makeSystem();
  bullets.fire(0.5, CONFIG.powerUps.gun.muzzleY, -1);
  assert.equal(bullets.getActive().length, 1);
  const bolt = bullets.getActive()[0];
  assert.equal(bolt.position.x, 0.5);
  assert.equal(bolt.position.y, CONFIG.powerUps.gun.muzzleY);
  assert.equal(bolt.position.z, -1);
});

test("bolts fly down-range (-z) at bulletSpeed", () => {
  const bullets = makeSystem();
  bullets.fire(0, 0.8, 0);
  const dt = 1 / 60;
  bullets.update(dt);
  const bolt = bullets.getActive()[0];
  assert.ok(bolt.position.z < 0, "bolt must move toward oncoming obstacles");
  const expected = -CONFIG.powerUps.gun.bulletSpeed * dt;
  assert.ok(
    Math.abs(bolt.position.z - expected) < 1e-9,
    `moved exactly bulletSpeed*dt (${bolt.position.z} vs ${expected})`
  );
});

test("bolts despawn after travelling their range", () => {
  const bullets = makeSystem();
  bullets.fire(0, 0.8, 0);
  for (let i = 0; i < 600; i++) bullets.update(1 / 60); // 10s at 60fps
  assert.equal(bullets.getActive().length, 0, "long past range 120 by now");
});

test("pooled bolts are reused, not reallocated", () => {
  const bullets = makeSystem();
  bullets.fire(0, 0.8, 0);
  const first = bullets.getActive()[0];
  bullets.update(10); // flies out of range and returns to the pool
  assert.equal(bullets.getActive().length, 0);
  bullets.fire(1, 0.8, -2);
  assert.equal(bullets.getActive()[0], first, "same mesh back in service");
});

test("remove() recycles the bolt at the given index", () => {
  const bullets = makeSystem();
  bullets.fire(0, 0.8, 0);
  bullets.fire(1, 0.8, 0);
  const surviving = bullets.getActive()[1];
  bullets.remove(0);
  assert.equal(bullets.getActive().length, 1);
  assert.equal(bullets.getActive()[0], surviving);
});

test("remove() on a stale index is a safe no-op", () => {
  const bullets = makeSystem();
  bullets.fire(0, 0.8, 0);
  assert.doesNotThrow(() => bullets.remove(5));
  assert.equal(bullets.getActive().length, 1);
});

test("reset clears every bolt and they can fire again", () => {
  const bullets = makeSystem();
  bullets.fire(0, 0.8, 0);
  bullets.fire(1, 0.8, 0);
  bullets.reset();
  assert.equal(bullets.getActive().length, 0);
  bullets.fire(2, 0.8, 0);
  assert.equal(bullets.getActive().length, 1);
});

test("bolts carry the blaster skin from the pickup type entry", () => {
  const bullets = makeSystem();
  const skin = CONFIG.powerUps.types.gun;
  assert.equal(bullets.material.color.getHex(), skin.color);
  assert.equal(bullets.material.emissive.getHex(), skin.emissive);
});
