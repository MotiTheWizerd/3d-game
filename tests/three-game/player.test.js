import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Player } from "../../src/three-game/game/Player.js";
import { CONFIG } from "../../src/three-game/config.js";

function makePlayer() {
  const scene = new THREE.Scene();
  return new Player(scene);
}

// Queue of booleans per action; each consume() pops in order
function makeInput({ left = false, right = false, jump = false } = {}) {
  const flags = { left: [left], right: [right], jump: [jump] };
  return { consume: (k) => flags[k].shift() ?? false };
}

test("starts in the middle lane at rest height", () => {
  const player = makePlayer();
  assert.equal(player.laneIndex, 1);
  assert.equal(player.position.x, CONFIG.lanes[1]);
  assert.equal(player.position.y, CONFIG.player.restY);
  assert.equal(player.grounded, true);
});

test("left input moves one lane left", () => {
  const player = makePlayer();
  player.handleInput(makeInput({ left: true }));
  assert.equal(player.laneIndex, 0);
});

test("right input moves one lane right", () => {
  const player = makePlayer();
  player.handleInput(makeInput({ right: true }));
  assert.equal(player.laneIndex, 2);
});

test("lane index clamps at both edges (no flying off the track)", () => {
  const player = makePlayer();
  player.handleInput(makeInput({ left: true }));
  player.handleInput(makeInput({ left: true }));
  assert.equal(player.laneIndex, 0);
  player.handleInput(makeInput({ right: true }));
  player.handleInput(makeInput({ right: true }));
  player.handleInput(makeInput({ right: true }));
  assert.equal(player.laneIndex, 2);
});

test("update eases position.x toward the target lane, never overshooting", () => {
  const player = makePlayer();
  player.handleInput(makeInput({ left: true }));
  assert.ok(Math.abs(player.position.x - CONFIG.lanes[0]) > 1e-6, "should not teleport");
  let prev = player.position.x;
  for (let i = 0; i < 400 && Math.abs(player.position.x - CONFIG.lanes[0]) > 1e-3; i++) {
    player.update(0.016);
    const target = CONFIG.lanes[0];
    const movedToward = Math.abs(player.position.x - target) < Math.abs(prev - target);
    assert.ok(movedToward, "x must move monotonically toward the lane");
    prev = player.position.x;
  }
  assert.ok(Math.abs(player.position.x - CONFIG.lanes[0]) <= 1e-3, "must eventually settle");
});

test("jump: leaves ground, rises, then lands back at restY", () => {
  const player = makePlayer();
  player.handleInput(makeInput({ jump: true }));
  assert.equal(player.grounded, false);
  assert.equal(player.velocityY, CONFIG.player.jumpVelocity);

  let maxY = player.position.y;
  let steps = 0;
  while (!player.grounded && steps < 500) {
    player.update(0.016);
    maxY = Math.max(maxY, player.position.y);
    steps++;
  }
  assert.ok(player.grounded, "must land again");
  assert.equal(player.position.y, CONFIG.player.restY);
  assert.equal(player.velocityY, 0);
  // apex = restY + v² / 2g
  const expectedApex = CONFIG.player.restY + (CONFIG.player.jumpVelocity ** 2) / (2 * -CONFIG.player.gravity);
  // discrete dt=0.016 integration peaks ~0.11 below the continuous apex — allow for it
  assert.ok(maxY > expectedApex - 0.15 && maxY <= expectedApex,
    `apex ${maxY.toFixed(3)} within ${expectedApex.toFixed(3)}`);
});

test("no double jump while airborne", () => {
  const player = makePlayer();
  player.handleInput(makeInput({ jump: true }));
  const v = player.velocityY;
  player.handleInput(makeInput({ jump: true }));
  assert.equal(player.velocityY, v, "airborne jump input must be ignored");
});

test("inactive player ignores all input", () => {
  const player = makePlayer();
  player.setActive(false);
  player.handleInput(makeInput({ left: true, jump: true }));
  assert.equal(player.laneIndex, 1);
  assert.equal(player.grounded, true);
});

test("getBounds matches CONFIG half-extents around current position", () => {
  const player = makePlayer();
  player.mesh.position.set(1.5, 2.5, -3);
  const b = player.getBounds();
  const hw = CONFIG.player.halfWidth, hh = CONFIG.player.halfHeight, hd = CONFIG.player.halfDepth;
  assert.deepEqual(
    [b.minX, b.maxX, b.minY, b.maxY, b.minZ, b.maxZ],
    [1.5 - hw, 1.5 + hw, 2.5 - hh, 2.5 + hh, -3 - hd, -3 + hd]
  );
});

test("dash: inactive until started, expires after duration, timer never negative", () => {
  const player = makePlayer();
  assert.equal(player.dashing, false);

  player.startDash(CONFIG.dash.duration);
  assert.equal(player.dashing, true);
  assert.equal(player.dashTimer, CONFIG.dash.duration);

  // step until well past the duration (fp margin: 0.1 sums land just under 1.2)
  const steps = Math.ceil(CONFIG.dash.duration / 0.1) + 3;
  for (let i = 0; i < steps; i++) player.update(0.1);
  assert.equal(player.dashing, false, "dash must expire");
  assert.equal(player.dashTimer, 0, "timer clamps at zero, never negative");
});

test("dash: body brightens while dashing and eases back after", () => {
  const player = makePlayer();
  const restEmissive = player.mesh.material.emissiveIntensity;

  player.startDash(CONFIG.dash.duration);
  player.update(0.05);
  assert.ok(
    player.mesh.material.emissiveIntensity > restEmissive,
    `emissive ${player.mesh.material.emissiveIntensity} above rest ${restEmissive}`
  );
  assert.ok(player.glow.intensity > 8, "glow runs hotter while dashing");

  for (let i = 0; i < 200; i++) player.update(0.016); // well past expiry
  assert.ok(
    Math.abs(player.mesh.material.emissiveIntensity - 0.6) < 0.05,
    `emissive settles at 0.6, got ${player.mesh.material.emissiveIntensity}`
  );
});

test("reset clears dash state and visuals", () => {
  const player = makePlayer();
  player.startDash(CONFIG.dash.duration);
  player.update(0.05);
  player.reset();
  assert.equal(player.dashing, false);
  assert.equal(player.dashTimer, 0);
  assert.equal(player.mesh.material.emissiveIntensity, 0.6);
  assert.equal(player.glow.intensity, 8);
});

test("reset returns player to middle lane, grounded, zeroed rotation", () => {
  const player = makePlayer();
  player.handleInput(makeInput({ left: true, jump: true }));
  player.update(0.1);
  player.reset();
  assert.equal(player.laneIndex, 1);
  assert.equal(player.grounded, true);
  assert.equal(player.velocityY, 0);
  assert.equal(player.active, true);
  assert.equal(player.position.x, CONFIG.lanes[1]);
  assert.equal(player.position.y, CONFIG.player.restY);
  assert.equal(player.mesh.rotation.x, 0);
  assert.equal(player.mesh.rotation.z, 0);
});
// ---- double jump ---------------------------------------------------------

function makeFancyInput() {
  const queue = { jump: [] };
  return {
    consume: (k) => queue[k]?.shift() ?? false,
    consumeCount: (k) => (queue[k]?.shift() ? 1 : 0),
    press: (k) => queue[k]?.push(true),
  };
}

test("a second jump press at the apex boosts higher (double jump)", () => {
  const player = makePlayer();
  const input = makeFancyInput();
  input.press("jump");
  player.handleInput(input); // grounded jump
  assert.equal(player.grounded, false);
  // fall back to near the apex
  player.velocityY = 1.0;
  player.handleInput({ consume: () => true, press: input.press });
  assert.equal(player.velocityY, CONFIG.player.doubleJumpVelocity);
  assert.equal(player.grounded, false);
});

test("double jump does not fire while rising fast (outside the apex window)", () => {
  const player = makePlayer();
  player.velocityY = CONFIG.player.jumpVelocity; // just left the ground
  player.grounded = false;
  player.airJumps = 1;
  player.handleInput({ consume: () => true });
  assert.equal(player.velocityY, CONFIG.player.jumpVelocity); // unchanged
});

test("only one air jump per flight", () => {
  const player = makePlayer();
  player.velocityY = 0.5;
  player.grounded = false;
  player.handleInput({ consume: () => true }); // first air jump
  player.velocityY = 0.5; // still near apex somehow
  player.handleInput({ consume: () => true }); // should be ignored
  assert.equal(player.velocityY, 0.5);
});

test("landing resets the double jump for the next hop", () => {
  const player = makePlayer();
  player.grounded = false;
  player.airJumps = 0;
  player.position.y = CONFIG.player.restY + 1;
  player.velocityY = -5;
  player.update(0.2); // falls and lands
  assert.equal(player.grounded, true);
  player.velocityY = 1.0;
  player.handleInput({ consume: () => true });
  assert.equal(player.velocityY, CONFIG.player.jumpVelocity);
  assert.equal(player.airJumps, 1);
});

