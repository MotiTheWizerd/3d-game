import * as THREE from "three";
import { CONFIG } from "../config.js";

export class World {
  constructor(scene) {
    this.scene = scene;
    this.dashes = [];
    this.buildLights();
    this.buildGround();
    this.buildDashes();
  }

  buildLights() {
    const colors = CONFIG.colors;
    const hemi = new THREE.HemisphereLight(colors.hemiSky, colors.hemiGround, 0.85);
    this.scene.add(hemi);

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

    const edgeMat = new THREE.MeshStandardMaterial({
      color: colors.groundEdge,
      emissive: colors.accentGlow,
      emissiveIntensity: 0.35,
    });

    for (const side of [-1, 1]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.35, CONFIG.world.groundLength), edgeMat);
      edge.position.set(side * 4.2, 0.15, ground.position.z);
      this.scene.add(edge);
    }
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
      this.rim.intensity = 36 + Math.sin(performance.now() * 0.003) * 8;
    }
  }

  reset() {
    for (const dash of this.dashes) {
      dash.position.z = dash.userData.baseZ;
    }
  }
}
