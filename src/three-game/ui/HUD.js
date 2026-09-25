import { CONFIG } from "../config.js";

export class HUD {
  constructor(events) {
    this.events = events;
    this.overlay = document.getElementById("overlay");
    this.titleEl = document.getElementById("overlay-title");
    this.messageEl = document.getElementById("overlay-message");
    this.buttonEl = document.getElementById("overlay-button");
    this.scoreEl = document.getElementById("hud-score");
    this.bestEl = document.getElementById("hud-best");
    this.coinsEl = document.getElementById("hud-coins");
    this.muteEl = document.getElementById("hud-mute");
    this.dashEl = document.getElementById("hud-dash");
    this.dashFillEl = document.getElementById("hud-dash-fill");
    this.powerupEl = document.getElementById("hud-powerups");
    this.powerupEls = {}; // type → { el }

    this.onButton = null;
    this.buttonEl.addEventListener("click", () => this.onButton?.());

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

  showReady(best) {
    this.titleEl.textContent = "Neon Runner";
    this.messageEl.textContent = "Dodge the blocks. Grab the coins. Don't stop.";
    this.buttonEl.textContent = "Start Run";
    this.bestEl.textContent = String(best);
    this.overlay.classList.add("visible");
  }

  showGameOver(score, best) {
    this.titleEl.textContent = "Run Over";
    this.messageEl.textContent = `Score ${score} · Best ${best}`;
    this.buttonEl.textContent = "Run Again";
    this.overlay.classList.add("visible");
  }

  hide() {
    this.overlay.classList.remove("visible");
    // Drop focus so Space/Enter don't re-click the button mid-run.
    this.buttonEl.blur();
  }
}
