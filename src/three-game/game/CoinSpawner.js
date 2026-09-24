import * as THREE from "three";
import { CONFIG } from "../config.js";

export class CoinSpawner {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    this.active = [];
    this.timer = CONFIG.coins.spawnInterval * 0.5;

    this.geometry = new THREE.CylinderGeometry(
      CONFIG.coins.radius,
      CONFIG.coins.radius,
      0.08,
      24
    );
    this.material = new THREE.MeshStandardMaterial({
      color: CONFIG.colors.coin,
      emissive: 0x8a7000,
      emissiveIntensity: 0.7,
      metalness: 0.7,
      roughness: 0.25,
    });
  }

  acquire() {
    const mesh = this.pool.pop();
    if (mesh) {
      mesh.visible = true;
      return mesh;
    }
    const mesh2 = new THREE.Mesh(this.geometry, this.material);
    mesh2.rotation.x = Math.PI / 2;
    mesh2.castShadow = true;
    this.scene.add(mesh2);
    return mesh2;
  }

  release(mesh) {
    mesh.visible = false;
    this.pool.push(mesh);
  }

  spawnPack() {
    const lane = Math.floor(Math.random() * CONFIG.lanes.length);
    const size =
      CONFIG.coins.packSizeMin +
      Math.floor(
        Math.random() * (CONFIG.coins.packSizeMax - CONFIG.coins.packSizeMin + 1)
      );

    for (let i = 0; i < size; i++) {
      const mesh = this.acquire();
      mesh.position.set(
        CONFIG.lanes[lane],
        CONFIG.coins.y,
        CONFIG.world.spawnZ - i * CONFIG.coins.packSpacing
      );
      this.active.push(mesh);
    }
  }

  update(dt, speed) {
    this.timer += dt;
    if (this.timer >= CONFIG.coins.spawnInterval) {
      this.timer = 0;
      this.spawnPack();
    }

    for (let i = this.active.length - 1; i >= 0; i--) {
      const mesh = this.active[i];
      mesh.position.z += speed * dt;
      mesh.rotation.z += dt * 4;

      if (mesh.position.z > CONFIG.world.recycleZ) {
        this.active.splice(i, 1);
        this.release(mesh);
      }
    }
  }

  collect(index) {
    const mesh = this.active[index];
    if (!mesh) return;
    this.active.splice(index, 1);
    this.release(mesh);
  }

  getActive() {
    return this.active;
  }

  reset() {
    for (const mesh of this.active) {
      this.release(mesh);
    }
    this.active.length = 0;
    this.timer = CONFIG.coins.spawnInterval * 0.5;
  }
}
