import { CONFIG } from "../config.js";
import { World } from "./World.js";
import { Player } from "./Player.js";
import { ObstacleSpawner } from "./ObstacleSpawner.js";
import { CoinSpawner } from "./CoinSpawner.js";
import { CollisionSystem } from "../systems/CollisionSystem.js";
import { ScoreSystem } from "../systems/ScoreSystem.js";
import { ParticleSystem } from "../systems/ParticleSystem.js";
import { PowerUpSpawner } from "./PowerUpSpawner.js";
import { PowerUpSystem } from "../systems/PowerUpSystem.js";
import { CameraFX } from "../systems/CameraFX.js";

const STATE = {
  READY: "ready",
  PLAYING: "playing",
  GAME_OVER: "gameover",
};

export class Game {
  constructor({ engine, events, input, hud }) {
    this.engine = engine;
    this.events = events;
    this.input = input;
    this.hud = hud;

    this.state = STATE.READY;
    this.speed = CONFIG.speed.initial;
    this.dashEnergy = 0;
    this.elapsed = 0;

    this.world = new World(engine.scene);
    this.player = new Player(engine.scene, events);
    this.obstacles = new ObstacleSpawner(engine.scene);
    this.coins = new CoinSpawner(engine.scene);
    this.collisions = new CollisionSystem();
    this.score = new ScoreSystem(events);
    this.particles = new ParticleSystem(engine.scene, events);
    this.cameraFX = new CameraFX(engine.camera, events);
    this.powerUps = new PowerUpSpawner(engine.scene);
    this.powerUpSystem = new PowerUpSystem(events);

    this.hud.onButton = () => this.requestStart();
    this.hud.showReady(this.score.best);
    this.events.emit("state:changed", this.state);
  }

  requestStart() {
    if (this.state === STATE.PLAYING) return;
    this.startRun();
  }

  startRun() {
    this.state = STATE.PLAYING;
    this.speed = CONFIG.speed.initial;
    this.setDashEnergy(0);
    this.elapsed = 0;
    this.world.reset();
    this.player.reset();
    this.obstacles.reset();
    this.coins.reset();
    this.score.reset();
    this.particles.reset();
    this.cameraFX.reset();
    this.powerUps.reset();
    this.powerUpSystem.reset();
    this.player.magnetRadius = 0;
    this.hud.hide();
    this.events.emit("state:changed", this.state);
    this.events.emit("run:started", null);
  }

  setDashEnergy(value) {
    if (value === this.dashEnergy) return;
    this.dashEnergy = value;
    this.events.emit("dash:energy-changed", this.dashEnergy);
  }

  endRun() {
    if (this.state !== STATE.PLAYING) return;
    // Consume shield if active — free hit.
    this.powerUpSystem.consumeShield();
    // Clear timed effects on game-over.
    for (const type of [...this.powerUpSystem.active.keys()]) {
      this.powerUpSystem.remove(type);
    }
    this.player.magnetRadius = 0;
    // Crash juice fires before the bookkeeping so the debris is already
    // flying while the HUD comes up.
    this.events.emit("player:crashed", { position: this.player.position.clone() });
    this.state = STATE.GAME_OVER;
    this.player.setActive(false);
    const previousBest = this.score.best;
    const finalScore = this.score.finalize();
    this.hud.showGameOver(finalScore, this.score.best);
    this.events.emit("state:changed", this.state);
    this.events.emit("run:ended", {
      score: finalScore,
      best: this.score.best,
      isNewBest: finalScore > previousBest && finalScore > 0,
    });
  }

  update(dt) {
    if (this.state !== STATE.PLAYING) {
      const started =
        this.input.consume("confirm") || this.input.consume("jump");
      if (started) {
        this.startRun();
      }
    }

    if (this.state === STATE.PLAYING) {
      this.elapsed += dt;
      this.speed = Math.min(
        CONFIG.speed.max,
        this.speed + CONFIG.speed.acceleration * dt
      );

      this.player.handleInput(this.input);

      // Dash: needs a full meter, fires a timed burst (Shift).
      if (
        this.input.consume("dash") &&
        this.dashEnergy >= 1 - 1e-9 &&
        !this.player.dashing
      ) {
        this.setDashEnergy(0);
        this.player.startDash(CONFIG.dash.duration);
        this.events.emit("player:dashed", null);
      }

      this.player.update(dt);
      const effectiveSpeed = this.player.dashing
        ? this.speed * CONFIG.dash.speedMultiplier
        : this.speed;
      this.world.update(dt, effectiveSpeed);
      this.obstacles.update(dt, effectiveSpeed);
      this.coins.update(dt, effectiveSpeed);
      this.powerUps.update(dt, effectiveSpeed, this.elapsed);

      if (this.player.dashing) {
        this.particles.trail(this.player.position, effectiveSpeed, dt);
      }
      this.score.addDistance(effectiveSpeed * dt);

      // Update power-up effects.
      this.powerUpSystem.update(dt);
      this.player.magnetRadius = this.powerUpSystem.extraMagnetRadius;
      this.score.coinMultiplier = this.powerUpSystem.coinMultiplier;

      // Check obstacle collisions.
      const hits = this.collisions.findObstacleHits(
        this.player,
        this.obstacles.getActive()
      );
      if (hits.length > 0 && !this.player.dashing) {
        this.endRun();
      } else {
        // Dashing smashes through anything in the way. Descend so the
        // splice inside smash() can't shift later indices.
        for (let i = hits.length - 1; i >= 0; i--) {
          const index = hits[i];
          const position = this.obstacles.getActive()[index].position.clone();
          this.obstacles.smash(index);
          this.score.addBonus(CONFIG.dash.smashBonus);
          this.events.emit("obstacle:smashed", { position });
        }

        const collected = this.collisions.collectCoins(
          this.player,
          this.coins.getActive()
        );
        for (const index of collected) {
          // Capture the position before collect() recycles the mesh.
          const position = this.coins.getActive()[index].position.clone();
          this.coins.collect(index);
          this.score.addCoin();
          this.setDashEnergy(
            Math.min(1, this.dashEnergy + CONFIG.dash.energyPerCoin)
          );
          this.events.emit("coin:collected", { position });
        }

        // Collect power-ups.
        const puHits = this.collisions.collectPowerUps(
          this.player,
          this.powerUps.getActive()
        );
        for (const index of puHits) {
          const mesh = this.powerUps.getActive()[index];
          const type = mesh.userData.type;
          this.powerUps.collect(index);
          this.powerUpSystem.activate(type);
          this.events.emit("powerup:collected", {
            type,
            position: mesh.position.clone(),
          });
        }
      }
    } else if (this.state === STATE.READY) {
      this.world.update(dt, CONFIG.speed.initial * 0.35);
      this.player.update(dt);
    }

    // Juice decays even on the game-over screen (crash debris, shake).
    this.particles.update(dt);
    this.cameraFX.update(dt);

    this.input.endFrame();
  }
}
