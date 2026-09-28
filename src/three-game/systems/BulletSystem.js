import * as THREE from "three";
import { CONFIG } from "../config.js";

/**
 * Pooled tracer bolts for the blaster power-up.
 *
 * Bolts fly straight down-range (-z, toward oncoming obstacles) at
 * CONFIG.powerUps.gun.bulletSpeed and despawn once they've travelled
 * `range` units. Collision with obstacles is decided by CollisionSystem
 * and resolved by Game — this class only moves and recycles meshes.
 */
export class BulletSystem {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    this.active = [];

    this.geometry = new THREE.BoxGeometry(1, 1, 1);
    // Bolt skin comes from the pickup TYPE entry, not the gun knobs.
    const skin = CONFIG.powerUps.types.gun;
    this.material = new THREE.MeshStandardMaterial({
      color: skin.color,
      emissive: skin.emissive,
      emissiveIntensity: 1.4,
      roughness: 0.3,
      metalness: 0.2,
    });
  }

  acquire() {
    const mesh = this.pool.pop();
    if (mesh) {
      mesh.visible = true;
      return mesh;
    }
    const bolt = new THREE.Mesh(this.geometry, this.material);
    // Elongated tracer, pointing down-range.
    bolt.scale.set(0.16, 0.16, 0.9);
    this.scene.add(bolt);
    return bolt;
  }

  release(mesh) {
    mesh.visible = false;
    this.pool.push(mesh);
  }

  /** Spawn a bolt at (x, y, z) flying down-range. */
  fire(x, y, z) {
    const bolt = this.acquire();
    bolt.position.set(x, y, z);
    bolt.userData.distance = 0;
    this.active.push(bolt);
  }

  update(dt) {
    const speed = CONFIG.powerUps.gun.bulletSpeed;
    const range = CONFIG.powerUps.gun.range;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const bolt = this.active[i];
      bolt.position.z -= speed * dt;
      bolt.userData.distance += speed * dt;
      if (bolt.userData.distance >= range) {
        this.active.splice(i, 1);
        this.release(bolt);
      }
    }
  }

  /** Remove the bolt at `index` of getActive() (it hit something). */
  remove(index) {
    const bolt = this.active[index];
    if (!bolt) return;
    this.active.splice(index, 1);
    this.release(bolt);
  }

  getActive() {
    return this.active;
  }

  reset() {
    for (const bolt of this.active) {
      this.release(bolt);
    }
    this.active.length = 0;
  }
}
