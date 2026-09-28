import { CONFIG } from "../config.js";

export class HUD {
  constructor(events) {
    this.events = events;
    this.overlay = document.getElementById("overlay");
    this.titleEl = document.getElementById("overlay-title");
    this.messageEl = document.getElementById("overlay-message");
    this.buttonEl = document.getElementById("overlay-button");
    this.restartEl = document.getElementById("overlay-restart");
    this.cardEl = this.overlay.querySelector(".overlay-card");
    this.bestLineEl = document.getElementById("overlay-best");
    // Game-over stat sheet (distance / coins / smashes / time). Every element
    // is optional: missing markup degrades to no stat sheet, never a crash.
    this.statsEl = document.getElementById("overlay-stats");
    this.statEls = {
      distance: document.getElementById("stat-distance"),
      coins: document.getElementById("stat-coins"),
      smashes: document.getElementById("stat-smashes"),
      time: document.getElementById("stat-time"),
    };
    this.scoreEl = document.getElementById("hud-score");
    this.bestEl = document.getElementById("hud-best");
    this.coinsEl = document.getElementById("hud-coins");
    this.muteEl = document.getElementById("hud-mute");
    this.pauseEl = document.getElementById("hud-pause");
    this.dashEl = document.getElementById("hud-dash");
    this.dashFillEl = document.getElementById("hud-dash-fill");
    this.powerupEl = document.getElementById("hud-powerups");
    this.powerupEls = {}; // type → { el }

    this.onButton = null;
    this.onRestart = null;
    this.onPause = null;
    this.buttonEl.addEventListener("click", () => this.onButton?.());
    this.restartEl?.addEventListener("click", () => this.onRestart?.());

    // Phones have no P key: the only way to freeze a run is this button.
    this.pauseEl?.addEventListener("click", () => {
      this.onPause?.();
      this.pauseEl.blur();
    });

    this.events.on("state:changed", (state) => this.setPauseGlyph(state));

    // Mute is owned by AudioManager; the HUD only mirrors its state.
    this.muteEl.addEventListener("click", () => {
      this.events.emit("audio:toggle-requested", null);
      this.muteEl.blur();
    });

    this.events.on("audio:muted-changed", ({ muted }) => {
      this.muteEl.textContent = muted ? "🔇" : "🔊";
      this.muteEl.setAttribute("aria-pressed", String(muted));
      this.muteEl.title = muted ? "Unmute (M)" : "Mute (M)";
    });

    this.events.on("score:changed", ({ score, coins, best }) => {
      this.scoreEl.textContent = String(score);
      this.coinsEl.textContent = String(coins);
      this.bestEl.textContent = String(best);
    });

    this.events.on("dash:energy-changed", (energy) => {
      this.dashFillEl.style.width = `${Math.round(energy * 100)}%`;
      this.dashEl.classList.toggle("ready", energy >= 1 - 1e-9);
    });

    // Power-up indicators.
    this.events.on("powerup:collected", ({ type }) => {
      if (!this.powerupEls[type]) {
        const el = document.createElement("div");
        el.className = "hud-powerup";
        el.textContent = CONFIG.powerUps.types[type].label;
        this.powerupEl.appendChild(el);
        this.powerupEls[type] = el;
      }
      const pe = this.powerupEls[type];
      pe.style.opacity = "1";
      pe.classList.add("active");
    });

    this.events.on("powerup:expired", ({ type }) => {
      const pe = this.powerupEls[type];
      if (pe) {
        pe.classList.remove("active");
        pe.style.opacity = "0";
        setTimeout(() => {
          if (pe.parentNode) pe.parentNode.removeChild(pe);
          delete this.powerupEls[type];
        }, 300);
      }
    });
  }

  /** "Restart Run" only belongs on the pause screen. */
  setRestartVisible(visible) {
    this.restartEl?.classList.toggle("visible", visible);
  }

  /** CONFIG.touch.showPauseButton = false hides it; hold-to-pause still works. */
  setPauseButtonVisible(visible) {
    this.pauseEl?.classList.toggle("hidden", !visible);
  }

  /** ⏸ while a run lives, ▶ while it waits — same button, both directions. */
  setPauseGlyph(state) {
    if (!this.pauseEl) return;
    const paused = state === "paused";
    this.pauseEl.textContent = paused ? "▶" : "⏸";
    this.pauseEl.title = paused ? "Resume run" : "Pause run";
    this.pauseEl.setAttribute("aria-label", this.pauseEl.title);
    this.pauseEl.classList.toggle("is-resume", paused);
  }

  showReady(best) {
    this.titleEl.textContent = "Neon Runner";
    this.messageEl.textContent = "Dodge the blocks. Grab the coins. Don't stop.";
    this.buttonEl.textContent = "Start Run";
    this.bestEl.textContent = String(best);
    this.setBestLine(best > 0 ? `Best ${best}` : null);
    this.cardEl?.classList.remove("is-new-best");
    this.setRestartVisible(false);
    this.showStats(null);
    this.overlay.classList.add("visible");
  }

  showGameOver(score, best, isNewBest = false, stats = null) {
    this.titleEl.textContent = isNewBest ? "\u{1F3C6} New Best!" : "Run Over";
    this.messageEl.textContent = `Score ${score} · Best ${best}`;
    this.buttonEl.textContent = "Run Again";
    this.setBestLine(null);
    this.cardEl?.classList.toggle("is-new-best", isNewBest);
    this.setRestartVisible(false);
    this.showStats(stats);
    this.overlay.classList.add("visible");
  }

  /** The game-over stat sheet; null stats hides it (start + pause screens). */
  showStats(stats) {
    if (!this.statsEl) return;
    if (!stats) {
      this.statsEl.hidden = true;
      return;
    }
    const values = {
      distance: `${stats.distance} m`,
      coins: String(stats.coins),
      smashes: String(stats.smashes),
      time: `${stats.time}s`,
    };
    for (const [key, text] of Object.entries(values)) {
      const el = this.statEls[key];
      if (el) el.textContent = text;
    }
    this.statsEl.hidden = false;
  }

  /** The start card remembers you: "Best N" once a run has been finished. */
  setBestLine(text) {
    if (!this.bestLineEl) return;
    if (!text) {
      this.bestLineEl.hidden = true;
      return;
    }
    this.bestLineEl.textContent = text;
    this.bestLineEl.hidden = false;
  }

  /** Pause screen: the primary button resumes, the ghost one restarts. */
  showPaused(score) {
    this.titleEl.textContent = "Paused";
    this.messageEl.textContent = `Score ${score} — the track will wait.`;
    this.buttonEl.textContent = "Resume";
    this.setRestartVisible(true);
    this.showStats(null);
    this.overlay.classList.add("visible");
    document.body.classList.add("is-paused");
  }

  hide() {
    this.overlay.classList.remove("visible");
    this.cardEl?.classList.remove("is-new-best");
    this.setRestartVisible(false);
    document.body.classList.remove("is-paused");
    // Drop focus so Space/Enter don't re-click the button mid-run.
    this.buttonEl.blur();
  }
}
