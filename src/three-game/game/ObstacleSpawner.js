import * as THREE from "three";
import { CONFIG } from "../config.js";

export class ObstacleSpawner {
  constructor(scene, difficulty = null) {
    this.scene = scene;
    // Optional LevelSystem: when attached, wave composition (lanes blocked,
    // solid walls) follows the current level's profile. Null keeps the
    // legacy always-on mix so old behaviour/tests stay untouched.
    this.difficulty = difficulty;
    this.jumpableHeights = CONFIG.obstacles.heights.filter(
      (h) => h <= CONFIG.obstacles.jumpableMaxHeight
    );
    this.solidHeights = CONFIG.obstacles.heights.filter(
      (h) => h > CONFIG.obstacles.jumpableMaxHeight
    );
    this.pool = [];
    this.active = [];
    this.timer = 0;
    this.elapsed = 0;

    this.geometry = new THREE.BoxGeometry(1, 1, 1);
    this.materials = [
      new THREE.MeshStandardMaterial({
        color: CONFIG.colors.obstacle,
        emissive: 0x66001a,
        emissiveIntensity: 0.45,
        roughness: 0.4,
        metalness: 0.3,
      }),
      new THREE.MeshStandardMaterial({
        color: CONFIG.colors.obstacleAlt,
        emissive: 0x662200,
        emissiveIntensity: 0.4,
        roughness: 0.4,
        metalness: 0.3,
      }),
    ];
  }

  currentInterval() {
    const t = Math.min(this.elapsed / CONFIG.obstacles.rampSeconds, 1);
    const start = CONFIG.obstacles.spawnIntervalStart;
    const min = CONFIG.obstacles.spawnIntervalMin;
    return start + (min - start) * t;
  }

  acquire() {
    const mesh = this.pool.pop();
    if (mesh) {
      mesh.visible = true;
      return mesh;
    }
    const mesh2 = new THREE.Mesh(
      this.geometry,
      this.materials[Math.floor(Math.random() * this.materials.length)]
    );
    mesh2.castShadow = true;
    this.scene.add(mesh2);
    return mesh2;
  }

  release(mesh) {
    mesh.visible = false;
    this.pool.push(mesh);
  }

  spawnWave() {
    const laneOrder = [0, 1, 2].sort(() => Math.random() - 0.5);
    const profile = this.difficulty ? this.difficulty.profile : null;
    const blockedCount =
      Math.random() < (profile ? profile.doubleLaneChance : 0.35) ? 2 : 1;

    let height;
    if (profile) {
      // Level-gated composition: jumpable heights normally, solid walls by chance.
      const pool =
        Math.random() < profile.solidChance
          ? this.solidHeights
          : this.jumpableHeights;
      height = pool[Math.floor(Math.random() * pool.length)];
    } else {
      height =
        CONFIG.obstacles.heights[
          Math.floor(Math.random() * CONFIG.obstacles.heights.length)
        ];
    }

    for (let i = 0; i < blockedCount; i++) {
      const lane = laneOrder[i];
      const mesh = this.acquire();
      const width = CONFIG.obstacles.halfWidth * 2;
      const depth = CONFIG.obstacles.halfDepth * 2;
      mesh.scale.set(width, height, depth);
      mesh.position.set(CONFIG.lanes[lane], height / 2, CONFIG.world.spawnZ);
      mesh.userData.halfHeight = height / 2;
      this.active.push(mesh);
    }
  }

  update(dt, speed) {
    this.elapsed += dt;
    this.timer += dt;

    if (this.timer >= this.currentInterval()) {
      this.timer = 0;
      this.spawnWave();
    }

    for (let i = this.active.length - 1; i >= 0; i--) {
      const mesh = this.active[i];
      mesh.position.z += speed * dt;
      if (mesh.position.z > CONFIG.world.recycleZ) {
        this.active.splice(i, 1);
        this.release(mesh);
      }
    }
  }

  getActive() {
    return this.active;
  }

  /** Dash smash: remove the obstacle at `index` of getActive() and recycle it. */
  smash(index) {
    const mesh = this.active[index];
    if (!mesh) return;
    this.active.splice(index, 1);
    this.release(mesh);
  }

  reset() {
    for (const mesh of this.active) {
      this.release(mesh);
    }
    this.active.length = 0;
    this.timer = 0;
    this.elapsed = 0;
  }
}
