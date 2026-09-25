import * as THREE from "three";
import { CONFIG } from "../config.js";

export class PowerUpSpawner {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    this.active = [];
    this.timer = CONFIG.powerUps.spawnIntervalStart * 0.5;
    this.lastSpawnTime = CONFIG.powerUps.spawnIntervalStart * 0.5;

    // One geometry per type — shared to save GPU memory.
    this.geometries = {};
    const baseGeo = new THREE.OctahedronGeometry(1, 0);
    for (const [type, cfg] of Object.entries(CONFIG.powerUps.types)) {
      const g = baseGeo.clone();
      g.scale(cfg.scale, cfg.scale, cfg.scale);
      this.geometries[type] = g;
    }

    this.materials = {};
    for (const [type, cfg] of Object.entries(CONFIG.powerUps.types)) {
      const mat = new THREE.MeshStandardMaterial({
        color: cfg.color,
        emissive: cfg.emissive,
        emissiveIntensity: 0.8,
        metalness: 0.6,
        roughness: 0.3,
      });
      this.materials[type] = mat;
    }
  }

  acquire(type) {
    const geo = this.geometries[type];
    const mat = this.materials[type];

    const mesh = this.pool.pop();
    if (mesh && mesh.userData.type === type) {
      mesh.visible = true;
      return mesh;
    }
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.userData.type = type;
    this.scene.add(m);
    return m;
  }

  release(mesh) {
    mesh.visible = false;
    this.pool.push(mesh);
  }

  spawn() {
    // Pick a random type.
    const types = Object.keys(CONFIG.powerUps.types);
    const type = types[Math.floor(Math.random() * types.length)];
    const lane = Math.floor(Math.random() * CONFIG.lanes.length);

    const mesh = this.acquire(type);
    mesh.position.set(CONFIG.lanes[lane], 1.1, CONFIG.world.spawnZ);
    mesh.userData.type = type;
    mesh.userData.bobOffset = Math.random() * Math.PI * 2;
    this.active.push(mesh);
  }

  update(dt, speed, elapsed = 0) {
    this.lastSpawnTime += dt;

    // Ramp spawn interval over elapsed time.
    const progress = Math.min(elapsed / CONFIG.powerUps.rampSeconds, 1);
    const interval =
      CONFIG.powerUps.spawnIntervalStart -
      (CONFIG.powerUps.spawnIntervalStart - CONFIG.powerUps.spawnIntervalMin) *
        progress;

    if (this.lastSpawnTime >= interval) {
      this.lastSpawnTime = 0;
      this.spawn();
    }

    const bobSpeed = 3;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const mesh = this.active[i];
      mesh.position.z += speed * dt;

      // Bob up and down + spin.
      mesh.rotation.y += dt * 2;
      const yBase = 1.1;
      mesh.position.y = yBase + Math.sin(elapsed * bobSpeed + mesh.userData.bobOffset) * 0.2;

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
    this.lastSpawnTime = 0;
    this.timer = 0;
  }
}
