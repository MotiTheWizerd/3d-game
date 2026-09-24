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
