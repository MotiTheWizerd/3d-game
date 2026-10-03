import * as THREE from "three";
import { CONFIG } from "../config.js";

export class World {
  constructor(scene) {
    this.scene = scene;
    this.dashes = [];
    // Day/night look. rimBase is the pulsing glow's center (cycle-driven),
    // starTarget the current star opacity, appliedPhase the last painted
    // cycle phase (-1 = never, so the first applyCycle always lands).
    this.rimBase = 40;
    this.starTarget = 0;
    this.appliedPhase = -1;
    this.buildLights();
    this.buildStars();
    this.buildGround();
    this.buildDashes();
  }

  buildLights() {
    const colors = CONFIG.colors;
    const hemi = new THREE.HemisphereLight(colors.hemiSky, colors.hemiGround, 0.85);
    this.scene.add(hemi);
    this.hemi = hemi;

    const dir = new THREE.DirectionalLight(colors.dirLight, 1.1);
    dir.position.set(6, 18, 8);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    dir.shadow.camera.near = 1;
    dir.shadow.camera.far = 60;
    dir.shadow.camera.left = -20;
    dir.shadow.camera.right = 20;
    dir.shadow.camera.top = 20;
    dir.shadow.camera.bottom = -20;
    this.scene.add(dir);
    this.dir = dir;

    const rim = new THREE.PointLight(colors.accentGlow, 40, 60);
    rim.position.set(0, 4, -30);
    this.scene.add(rim);
    this.rim = rim;
  }

  buildGround() {
    const colors = CONFIG.colors;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(24, CONFIG.world.groundLength),
      new THREE.MeshStandardMaterial({
        color: colors.ground,
        roughness: 0.9,
        metalness: 0.1,
      })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = -CONFIG.world.groundLength / 2 + 20;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Neon track edges: the cycle retunes emissiveIntensity (they pop at
    // night, sit quiet under the noon sun).
    this.edgeMat = new THREE.MeshStandardMaterial({
      color: colors.groundEdge,
      emissive: colors.accentGlow,
      emissiveIntensity: 0.35,
    });

    for (const side of [-1, 1]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.35, CONFIG.world.groundLength), this.edgeMat);
      edge.position.set(side * 4.2, 0.15, ground.position.z);
      this.scene.add(edge);
    }
  }

  /**
   * Starfield for the night segment — a dome of fog-free points far above the
   * track. Opacity is driven by the cycle's `night` factor (day: invisible).
   */
  buildStars() {
    const count = CONFIG.dayNight?.starCount ?? 260;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Random direction on a squashed upper dome, pushed out past the fog.
      const theta = Math.random() * Math.PI * 2;
      const up = 0.12 + Math.random() * 0.88; // never touch the horizon
      const flat = Math.sqrt(Math.max(0, 1 - up * up));
      positions[i * 3] = Math.cos(theta) * flat * 150;
      positions[i * 3 + 1] = up * 90 + 12;
      positions[i * 3 + 2] = Math.sin(theta) * flat * 150 - 40;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.starMat = new THREE.PointsMaterial({
      color: 0xdfe8ff,
      size: 1.6,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false, // stars live beyond fogFar — they must not fog out
    });
    this.stars = new THREE.Points(geo, this.starMat);
    this.scene.add(this.stars);
  }

  /**
   * Paint the cycle's current look onto the scene. Cheap by design: a phase
   * already painted is skipped, so per-frame cost is one float compare.
   * Tolerates a bare scene (no background/fog yet) by creating them.
   */
  applyCycle(cycle) {
    const state = cycle.state;
    if (state.phase === this.appliedPhase) return;
    this.appliedPhase = state.phase;

    if (!this.scene.background) this.scene.background = new THREE.Color();
    this.scene.background.setHex(state.sky);
    if (!this.scene.fog) {
      this.scene.fog = new THREE.Fog(state.fog, state.fogNear, state.fogFar);
    }
    this.scene.fog.color.setHex(state.fog);
    this.scene.fog.near = state.fogNear;
    this.scene.fog.far = state.fogFar;

    this.hemi.intensity = state.hemi;
    this.hemi.color.setHex(state.hemiSky);
    this.hemi.groundColor.setHex(state.hemiGround);
    this.dir.intensity = state.dir;
    this.dir.color.setHex(state.dirColor);
    this.rimBase = state.rim;
    this.edgeMat.emissiveIntensity = state.edgeGlow;

    this.starTarget = state.night;
    this.starMat.opacity = state.night;
  }

  buildDashes() {
    const dashMat = new THREE.MeshStandardMaterial({
      color: CONFIG.colors.dash,
      emissive: CONFIG.colors.accentGlow,
      emissiveIntensity: 0.25,
    });
    const geo = new THREE.BoxGeometry(0.12, 0.05, 1.6);

    for (const laneX of [CONFIG.lanes[0] + 1.25, CONFIG.lanes[2] - 1.25]) {
      for (let i = 0; i < CONFIG.world.dashCount; i++) {
        const dash = new THREE.Mesh(geo, dashMat);
        dash.position.set(laneX, 0.03, -i * CONFIG.world.dashSpacing);
        dash.userData.baseZ = dash.position.z;
        this.scene.add(dash);
        this.dashes.push(dash);
      }
    }
  }

  update(dt, speed) {
    const travel = speed * dt;
    const total = CONFIG.world.dashCount * CONFIG.world.dashSpacing;

    for (const dash of this.dashes) {
      dash.position.z += travel;
      if (dash.position.z > CONFIG.world.recycleZ) {
        dash.position.z -= total;
      }
    }

    if (this.rim) {
      this.rim.intensity =
        this.rimBase + Math.sin(performance.now() * 0.003) * 8;
    }
    // A field-wide twinkle: the whole dome breathes a little.
    if (this.starMat) {
      this.starMat.opacity =
        this.starTarget * (0.85 + 0.15 * Math.sin(performance.now() * 0.0016));
    }
  }

  reset() {
    for (const dash of this.dashes) {
      dash.position.z = dash.userData.baseZ;
    }
    // Force the next applyCycle to repaint: the cycle itself rewinds to its
    // start phase, and 0 must not alias the last painted phase.
    this.appliedPhase = -1;
  }
}
