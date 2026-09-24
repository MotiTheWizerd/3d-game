import { CONFIG } from "../config.js";

export class ScoreSystem {
  constructor(events) {
    this.events = events;
    this.distance = 0;
    this.coins = 0;
    this.best = this.loadBest();
  }

  loadBest() {
    try {
      return Number(localStorage.getItem(CONFIG.score.bestKey)) || 0;
    } catch {
      return 0;
    }
  }

  saveBest() {
    try {
      localStorage.setItem(CONFIG.score.bestKey, String(this.best));
    } catch {
      return;
    }
  }

  reset() {
    this.distance = 0;
    this.coins = 0;
    this.publish();
  }

  addDistance(delta) {
    this.distance += delta * CONFIG.score.distanceScale;
    this.publish();
  }

  addCoin() {
    this.coins += 1;
    this.publish();
  }

  /** Dash smash bonus + any other flat points. */
  addBonus(points) {
    this.distance += points;
    this.publish();
  }

  get score() {
    return Math.floor(this.distance) + this.coins * CONFIG.coins.value;
  }

  finalize() {
    if (this.score > this.best) {
      this.best = this.score;
      this.saveBest();
    }
    this.publish();
    return this.score;
  }

  publish() {
    this.events.emit("score:changed", {
      score: this.score,
      coins: this.coins,
      best: Math.max(this.best, this.score),
    });
  }
}
