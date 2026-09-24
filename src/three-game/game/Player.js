import * as THREE from "three";
import { CONFIG } from "../config.js";

export class Player {
  constructor(scene, events = null) {
    this.scene = scene;
    this.events = events;
    this.laneIndex = 1;
    this.velocityY = 0;
    this.grounded = true;
    this.active = true;

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

  handleInput(input) {
    if (!this.active) return;

    if (input.consume("left") && this.laneIndex > 0) {
      this.laneIndex -= 1;
      this.events?.emit("player:lane", this.laneIndex);
    }
    if (input.consume("right") && this.laneIndex < CONFIG.lanes.length - 1) {
      this.laneIndex += 1;
      this.events?.emit("player:lane", this.laneIndex);
    }
    if (input.consume("jump") && this.grounded) {
      this.velocityY = CONFIG.player.jumpVelocity;
      this.grounded = false;
      this.events?.emit("player:jumped", null);
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
      }
    }

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
    return {
      minX: p.x - CONFIG.player.halfWidth,
      maxX: p.x + CONFIG.player.halfWidth,
      minY: p.y - CONFIG.player.halfHeight,
      maxY: p.y + CONFIG.player.halfHeight,
      minZ: p.z - CONFIG.player.halfDepth,
      maxZ: p.z + CONFIG.player.halfDepth,
    };
  }

  reset() {
    this.laneIndex = 1;
    this.velocityY = 0;
    this.grounded = true;
    this.active = true;
    this.mesh.position.set(CONFIG.lanes[this.laneIndex], CONFIG.player.restY, 0);
    this.mesh.rotation.set(0, 0, 0);
  }

  setActive(active) {
    this.active = active;
    this.mesh.material.emissiveIntensity = active ? 0.6 : 0.15;
  }
}
