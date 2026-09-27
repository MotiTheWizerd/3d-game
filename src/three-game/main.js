import { Engine } from "./core/Engine.js";
import { InputManager } from "./core/InputManager.js";
import { TouchControls } from "./core/TouchControls.js";
import { EventBus } from "./core/EventBus.js";
import { Game } from "./game/Game.js";
import { HUD } from "./ui/HUD.js";
import { AudioManager } from "./systems/AudioManager.js";
import { CONFIG } from "./config.js";

function bootstrap() {
  const container = document.getElementById("game-root");
  if (!container) {
    throw new Error("Missing #game-root mount point");
  }

  const events = new EventBus();
  const input = new InputManager(window);
  input.attach();

  const engine = new Engine(container);
  const hud = new HUD(events);
  const audio = new AudioManager(events);
  audio.attach(window);
  audio.publishMuteState();
  const game = new Game({ engine, events, input, hud });
  // Tab-switch / minimize shouldn't cost you a run.
  game.attachVisibility();

  // Swipes and taps ride the same action queue as the keyboard. Bound to the
  // canvas mount only, so the HUD's buttons keep their ordinary taps.
  const touch = new TouchControls(input, container, { events });
  if (CONFIG.touch.attachAlways) touch.attach();
  if (isTouchDevice()) document.body.classList.add("touch-capable");
  hud.setPauseButtonVisible(CONFIG.touch.showPauseButton);

  engine.onUpdate = (dt) => game.update(dt);
  engine.start();

  window.addEventListener("beforeunload", () => {
    input.detach();
    touch.detach();
    game.detachVisibility();
    audio.destroy();
    engine.stop();
  });
}

/**
 * A real touchscreen, as far as the browser will tell us. Drives the CSS that
 * swaps the keyboard hints for gesture hints and reveals the pause button.
 */
function isTouchDevice() {
  return (
    "ontouchstart" in window ||
    (navigator.maxTouchPoints ?? 0) > 0 ||
    window.matchMedia?.("(hover: none) and (pointer: coarse)").matches === true
  );
}

bootstrap();
