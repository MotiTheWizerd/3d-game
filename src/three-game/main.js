import { Engine } from "./core/Engine.js";
import { InputManager } from "./core/InputManager.js";
import { EventBus } from "./core/EventBus.js";
import { Game } from "./game/Game.js";
import { HUD } from "./ui/HUD.js";
import { AudioManager } from "./systems/AudioManager.js";

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

  engine.onUpdate = (dt) => game.update(dt);
  engine.start();

  window.addEventListener("beforeunload", () => {
    input.detach();
    audio.destroy();
    engine.stop();
  });
}

bootstrap();
