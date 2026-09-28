import * as THREE from "three";
import { CONFIG } from "../config.js";

/** Discrete presses of a lane action this frame — 1 for a keyboard tap. */
function laneSteps(input, action) {
  if (typeof input.consumeCount === "function") return input.consumeCount(action);
  return input.consume(action) ? 1 : 0;
}

export class Player {
  constructor(scene, events = null) {
    this.scene = scene;
    this.events = events;
    this.laneIndex = 1;
    this.velocityY = 0;
    this.grounded = true;
    this.airJumps = 0;
    this.active = true;
    this.dashTimer = 0;
    this._magnetRadius = 0;

    const colors = CONFIG.colors;
    const geometry = new THREE.BoxGeometry(0.9, 1.1, 0.9);
    const material = new THREE.MeshStandardMaterial({
      color: colors.player,
      emissive: colors.playerEmissive,
      emissiveIntensity: 0.6,
      roughness: 0.35,
      metalness: 0.45,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.castShadow = true;
    this.mesh.position.set(CONFIG.lanes[this.laneIndex], CONFIG.player.restY, 0);
    this.scene.add(this.mesh);

    this.glow = new THREE.PointLight(colors.player, 8, 10);
    this.mesh.add(this.glow);
  }

  get position() {
    return this.mesh.position;
  }

  get dashing() {
    return this.dashTimer > 0;
  }

  /** Extra magnetic pickup radius (set by PowerUpSystem each frame). */
  set magnetRadius(val) {
    this._magnetRadius = val ?? 0;
  }

  get magnetRadius() {
    return this._magnetRadius;
  }

  /** Called by the Game when a dash is triggered — the Player owns the feel. */
  startDash(duration) {
    this.dashTimer = duration;
  }

  handleInput(input) {
    if (!this.active) return;

    // Lane changes are counted, not boolean: a keyboard tap is one step, a
    // fast touch flick can queue several in the same frame.
    const left = laneSteps(input, "left");
    if (left > 0) this.stepLane(-left);
    const right = laneSteps(input, "right");
    if (right > 0) this.stepLane(right);
    if (!input.consume("jump")) return;

    if (this.grounded) {
      this.velocityY = CONFIG.player.jumpVelocity;
      this.grounded = false;
      this.airJumps = 1;
      this.events?.emit("player:jumped", null);
    } else if (this.airJumps > 0) {
      // Double jump: only near the apex, when vertical speed is still small.
      if (Math.abs(this.velocityY) <= CONFIG.player.doubleJumpWindow) {
        this.velocityY = CONFIG.player.doubleJumpVelocity;
        this.airJumps = 0;
        this.events?.emit("player:doubleJumped", null);
      } else {
        input.press?.("jump"); // rising/falling fast: put the press back
      }
    }
  }

  /** Move N lanes in one frame, one tick per lane, clamped to the track. */
  stepLane(steps) {
    const dir = Math.sign(steps);
    for (let i = 0; i < Math.abs(steps); i++) {
      const next = this.laneIndex + dir;
      if (next < 0 || next > CONFIG.lanes.length - 1) break;
      this.laneIndex = next;
      this.events?.emit("player:lane", this.laneIndex);
    }
  }

  update(dt) {
    const targetX = CONFIG.lanes[this.laneIndex];
    const blend = 1 - Math.exp(-CONFIG.laneChangeSpeed * dt);
    this.mesh.position.x += (targetX - this.mesh.position.x) * blend;

    if (!this.grounded) {
      this.velocityY += CONFIG.player.gravity * dt;
      this.mesh.position.y += this.velocityY * dt;

      if (this.mesh.position.y <= CONFIG.player.restY) {
        this.mesh.position.y = CONFIG.player.restY;
        this.velocityY = 0;
        this.grounded = true;
        this.airJumps = 0;
      }
    }

    if (this.dashTimer > 0) {
      this.dashTimer = Math.max(0, this.dashTimer - dt);
    }

    // Dash visual: brighter body + hotter glow, eased in/out with the timer.
    const targetEmissive = this.dashing ? 1.6 : 0.6;
    const targetGlow = this.dashing ? 18 : 8;
    this.mesh.material.emissiveIntensity = THREE.MathUtils.lerp(
      this.mesh.material.emissiveIntensity,
      targetEmissive,
      0.25
    );
    this.glow.intensity = THREE.MathUtils.lerp(this.glow.intensity, targetGlow, 0.25);

    const lean = (targetX - this.mesh.position.x) * 0.35;
    this.mesh.rotation.z = THREE.MathUtils.lerp(this.mesh.rotation.z, -lean, 0.2);
    this.mesh.rotation.x = THREE.MathUtils.lerp(
      this.mesh.rotation.x,
      this.grounded ? 0 : -0.25,
      0.15
    );
  }

  getBounds() {
    const p = this.mesh.position;
    const extra = this._magnetRadius ?? 0;
    return {
      minX: p.x - CONFIG.player.halfWidth - extra,
      maxX: p.x + CONFIG.player.halfWidth + extra,
      minY: p.y - CONFIG.player.halfHeight,
      maxY: p.y + CONFIG.player.halfHeight,
      minZ: p.z - CONFIG.player.halfDepth - extra * 0.5,
      maxZ: p.z + CONFIG.player.halfDepth + extra * 0.5,
    };
  }

  reset() {
    this.laneIndex = 1;
    this.velocityY = 0;
    this.grounded = true;
    this.airJumps = 0;
    this.active = true;
    this.dashTimer = 0;
    this._magnetRadius = 0;
    this.mesh.material.emissiveIntensity = 0.6;
    this.glow.intensity = 8;
    this.mesh.position.set(CONFIG.lanes[this.laneIndex], CONFIG.player.restY, 0);
    this.mesh.rotation.set(0, 0, 0);
  }

  setActive(active) {
    this.active = active;
    this.mesh.material.emissiveIntensity = active ? 0.6 : 0.15;
  }
}
