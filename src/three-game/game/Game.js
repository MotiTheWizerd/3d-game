import { CONFIG } from "../config.js";
import { World } from "./World.js";
import { Player } from "./Player.js";
import { ObstacleSpawner } from "./ObstacleSpawner.js";
import { CoinSpawner } from "./CoinSpawner.js";
import { CollisionSystem } from "../systems/CollisionSystem.js";
import { ScoreSystem } from "../systems/ScoreSystem.js";
import { LevelSystem } from "../systems/LevelSystem.js";
import { ParticleSystem } from "../systems/ParticleSystem.js";
import { BulletSystem } from "../systems/BulletSystem.js";
import { PowerUpSpawner } from "./PowerUpSpawner.js";
import { PowerUpSystem } from "../systems/PowerUpSystem.js";
import { CameraFX } from "../systems/CameraFX.js";

const STATE = {
  READY: "ready",
  PLAYING: "playing",
  PAUSED: "paused",
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
    // True metres travelled this run — score.distance is polluted by bonus
    // points (addBonus), so the stat sheet tracks its own raw accumulator.
    this.runDistance = 0;

    this.visibilityDoc = null;
    this.onVisibilityChange = null;

    this.world = new World(engine.scene);
    this.player = new Player(engine.scene, events);
    this.difficulty = new LevelSystem(events);
    this.obstacles = new ObstacleSpawner(engine.scene, this.difficulty);
    this.coins = new CoinSpawner(engine.scene);
    this.collisions = new CollisionSystem();
    this.score = new ScoreSystem(events);
    this.particles = new ParticleSystem(engine.scene, events);
    this.cameraFX = new CameraFX(engine.camera, events);
    this.powerUps = new PowerUpSpawner(engine.scene);
    // Power-up durations run on GAME time, not wall time: `elapsed` only
    // advances while playing, so a paused run can't bleed its timers away.
    this.powerUpSystem = new PowerUpSystem(events, () => this.elapsed * 1000);
    this.bullets = new BulletSystem(engine.scene);
    // Blaster trigger: counts down while the gun is active, 0 = ready to
    // fire the instant a pickup lands (no dead time on collection).
    this.gunCooldown = 0;

    this.hud.onButton = () => this.pressPrimaryButton();
    this.hud.onRestart = () => this.pressRestartButton();
    this.hud.onPause = () => this.pressPauseButton();
    this.hud.showReady(this.score.best);
    this.events.emit("state:changed", this.state);
  }

  requestStart() {
    if (this.state === STATE.PLAYING || this.state === STATE.PAUSED) return;
    this.startRun();
  }

  // ---- pause ------------------------------------------------------------

  /**
   * Freeze the run. Everything downstream of `update()` stops: the clock,
   * the spawners, dash/power-up timers, particles and camera shake.
   * Returns false when there is nothing to pause.
   */
  pause(reason = "manual") {
    if (this.state !== STATE.PLAYING) return false;
    this.state = STATE.PAUSED;
    this.hud.showPaused(this.score.score);
    this.events.emit("state:changed", this.state);
    this.events.emit("run:paused", { reason });
    return true;
  }

  resume(reason = "manual") {
    if (this.state !== STATE.PAUSED) return false;
    this.state = STATE.PLAYING;
    this.hud.hide();
    // Drop keys pressed while paused so the run doesn't resume into a stale
    // lane-change/jump burst.
    this.input.endFrame();
    this.events.emit("state:changed", this.state);
    this.events.emit("run:resumed", { reason });
    return true;
  }

  togglePause(reason = "manual") {
    if (this.state === STATE.PAUSED) return this.resume(reason);
    return this.pause(reason);
  }

  get paused() {
    return this.state === STATE.PAUSED;
  }

  /** Overlay button: Resume when paused, otherwise start a run. */
  pressPrimaryButton() {
    if (this.state === STATE.PAUSED) {
      this.resume("button");
      return;
    }
    this.requestStart();
  }

  /** Overlay "Restart": throw the current run away and begin a fresh one. */
  pressRestartButton() {
    if (this.state !== STATE.PAUSED) return false;
    this.startRun();
    return true;
  }

  /**
   * On-screen pause control. Phones have no P key, so the button toggles:
   * tap to freeze the run, tap again to pick it back up.
   */
  pressPauseButton() {
    return this.togglePause("button");
  }

  /**
   * Auto-pause when the tab goes away — a tab-switch mid-run shouldn't cost
   * you the score. Pass a document-like object in tests.
   */
  attachVisibility(target = null) {
    const doc = target ?? (typeof document !== "undefined" ? document : null);
    if (!doc || this.visibilityDoc) return;
    this.onVisibilityChange = () => {
      // Tab switches don't always deliver a window blur, so release held keys
      // here too: the key you were riding when you left must be pressable when
      // you come back.
      if (!doc.hidden) return;
      this.input?.releaseAll?.();
      if (CONFIG.pause.autoOnHidden) this.pause("hidden");
    };
    doc.addEventListener("visibilitychange", this.onVisibilityChange);
    this.visibilityDoc = doc;
  }

  detachVisibility() {
    if (!this.visibilityDoc) return;
    this.visibilityDoc.removeEventListener(
      "visibilitychange",
      this.onVisibilityChange
    );
    this.visibilityDoc = null;
    this.onVisibilityChange = null;
  }

  startRun() {
    this.state = STATE.PLAYING;
    this.speed = CONFIG.speed.initial;
    this.setDashEnergy(0);
    this.elapsed = 0;
    this.runDistance = 0;
    this.world.reset();
    this.player.reset();
    this.obstacles.reset();
    this.coins.reset();
    this.score.reset();
    this.difficulty.reset();
    this.particles.reset();
    this.cameraFX.reset();
    this.powerUps.reset();
    this.powerUpSystem.reset();
    this.bullets.reset();
    this.gunCooldown = 0;
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
    // Clear timed effects on game-over.
    for (const type of [...this.powerUpSystem.active.keys()]) {
      this.powerUpSystem.remove(type);
    }
    // Bolts left mid-flight would hang frozen on the game-over screen.
    this.bullets.reset();
    this.gunCooldown = 0;
    this.player.magnetRadius = 0;
    // Crash juice fires before the bookkeeping so the debris is already
    // flying while the HUD comes up.
    this.events.emit("player:crashed", { position: this.player.position.clone() });
    this.state = STATE.GAME_OVER;
    this.player.setActive(false);
    const previousBest = this.score.best;
    const finalScore = this.score.finalize();
    const isNewBest = finalScore > previousBest && finalScore > 0;
    this.hud.showGameOver(finalScore, this.score.best, isNewBest, {
      distance: Math.floor(this.runDistance),
      coins: this.score.coins,
      smashes: this.score.smashes,
      time: Math.round(this.elapsed * 10) / 10,
    });
    this.events.emit("state:changed", this.state);
    this.events.emit("run:ended", {
      score: finalScore,
      best: this.score.best,
      isNewBest,
    });
  }

  update(dt) {
    // Paused swallows the frame whole: no simulation, no juice decay, and no
    // input except the resume key. The scene stays rendered, frozen.
    if (this.state === STATE.PAUSED) {
      if (this.input.consume("pause")) this.resume("key");
      this.input.endFrame();
      return;
    }

    if (this.state !== STATE.PLAYING) {
      const started =
        this.input.consume("confirm") || this.input.consume("jump");
      if (started) {
        this.startRun();
      }
    }

    if (this.state === STATE.PLAYING) {
      if (this.input.consume("pause")) {
        this.pause();
        this.input.endFrame();
        return;
      }

      this.elapsed += dt;
      this.speed = Math.min(
        CONFIG.speed.max,
        this.speed + CONFIG.speed.acceleration * dt
      );
      this.difficulty.update(dt);

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
      const effectiveSpeed =
        (this.player.dashing
          ? this.speed * CONFIG.dash.speedMultiplier
          : this.speed) * this.powerUpSystem.speedFactor;
      this.world.update(dt, effectiveSpeed);
      this.obstacles.update(dt, effectiveSpeed);
      this.coins.update(dt, effectiveSpeed);
      this.powerUps.update(dt, effectiveSpeed, this.elapsed);

      // Blaster: auto-fire down the player's lane while active. Bolts spawn
      // at a fixed muzzle height so shots land in the lane, not the sky.
      if (this.powerUpSystem.isGun) {
        this.gunCooldown -= dt;
        if (this.gunCooldown <= 0) {
          this.gunCooldown = CONFIG.powerUps.gun.fireInterval;
          this.bullets.fire(
            this.player.position.x,
            CONFIG.powerUps.gun.muzzleY,
            this.player.position.z
          );
          this.events.emit("gun:fired", null);
        }
      } else {
        this.gunCooldown = 0; // a fresh pickup fires instantly
      }
      this.bullets.update(dt);

      // Bolts shatter obstacles before the player can reach them — including
      // solid walls, which is the whole appeal. Positions are captured
      // before smash() recycles the mesh (same rule as every event payload).
      const bolts = this.bullets.getActive();
      for (let i = bolts.length - 1; i >= 0; i--) {
        const j = this.collisions.findBulletHit(
          bolts[i],
          this.obstacles.getActive()
        );
        if (j < 0) continue;
        const position = this.obstacles.getActive()[j].position.clone();
        this.obstacles.smash(j);
        this.bullets.remove(i);
        this.score.addBonus(CONFIG.powerUps.gun.smashBonus);
        this.score.addSmash();
        this.events.emit("obstacle:smashed", { position });
      }

      if (this.player.dashing) {
        this.particles.trail(this.player.position, effectiveSpeed, dt);
      }
      this.score.addDistance(effectiveSpeed * dt);
      this.runDistance += effectiveSpeed * dt;

      // Update power-up effects.
      this.powerUpSystem.update(dt);
      this.player.magnetRadius = this.powerUpSystem.extraMagnetRadius;
      this.score.coinMultiplier = this.powerUpSystem.coinMultiplier;

      // Check obstacle collisions.
      // While ghost is active, hits are simply phased through — no crash,
      // no smash. Only an active dash smashes obstacles.
      const hits = this.collisions.findObstacleHits(
        this.player,
        this.obstacles.getActive()
      );
      if (
        hits.length > 0 &&
        !this.player.dashing &&
        !this.powerUpSystem.isGhost
      ) {
        // Shield absorbs the crash — smash the obstacle and keep running.
        if (this.powerUpSystem.consumeShield()) {
          for (let i = hits.length - 1; i >= 0; i--) {
            const index = hits[i];
            const position = this.obstacles.getActive()[index].position.clone();
            this.obstacles.smash(index);
            this.score.addSmash();
            this.events.emit("obstacle:smashed", { position });
          }
        } else {
          this.endRun();
        }
      } else {
        // Dashing smashes through anything in the way. Descend so the
        // splice inside smash() can't shift later indices.
        if (this.player.dashing) {
          for (let i = hits.length - 1; i >= 0; i--) {
            const index = hits[i];
            const position = this.obstacles.getActive()[index].position.clone();
            this.obstacles.smash(index);
            this.score.addBonus(CONFIG.dash.smashBonus);
            this.score.addSmash();
            this.events.emit("obstacle:smashed", { position });
          }
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
