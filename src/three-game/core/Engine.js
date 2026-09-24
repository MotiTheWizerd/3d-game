import * as THREE from "three";
import { CONFIG } from "../config.js";

export class Engine {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(CONFIG.world.backgroundColor);
    this.scene.fog = new THREE.Fog(
      CONFIG.world.fogColor,
      CONFIG.world.fogNear,
      CONFIG.world.fogFar
    );

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 300);
    this.camera.position.set(0, 5.2, 9);
    this.camera.lookAt(0, 1, -8);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    this.clock = new THREE.Clock();
    this.onUpdate = null;
    this.running = false;
    this.raf = 0;

    this.onResize = this.onResize.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    window.addEventListener("resize", this.onResize);
    this.onResize();
    this.loop();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.onResize);
  }

  loop() {
    if (!this.running) return;
    this.raf = requestAnimationFrame(() => this.loop());
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.onUpdate?.(dt);
    this.renderer.render(this.scene, this.camera);
  }

  onResize() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }
}
