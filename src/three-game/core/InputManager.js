const KEY_MAP = {
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  ArrowUp: "jump",
  KeyW: "jump",
  Space: "jump",
  ShiftLeft: "dash",
  ShiftRight: "dash",
  Enter: "confirm",
  KeyP: "pause",
  Escape: "pause",
};

export class InputManager {
  constructor(target = window) {
    this.target = target;
    this.held = new Set();
    // action → how many discrete presses landed since the last endFrame().
    // A Map rather than a Set so two swipes inside one frame stay two swipes
    // (a Set would collapse a fast two-lane flick into a single lane change).
    this.justPressed = new Map();
    this.enabled = true;

    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
  }

  attach() {
    this.target.addEventListener("keydown", this.onKeyDown);
    this.target.addEventListener("keyup", this.onKeyUp);
  }

  detach() {
    this.target.removeEventListener("keydown", this.onKeyDown);
    this.target.removeEventListener("keyup", this.onKeyUp);
  }

  onKeyDown(event) {
    const action = KEY_MAP[event.code];
    if (!action || !this.enabled) return;
    if (["jump", "left", "right"].includes(action)) {
      event.preventDefault();
    }
    if (!this.held.has(action)) {
      this.held.add(action);
      this.register(action);
    }
  }

  onKeyUp(event) {
    const action = KEY_MAP[event.code];
    if (!action) return;
    this.held.delete(action);
  }

  /**
   * Synthesise a discrete press from a non-keyboard source (touch gestures).
   *
   * Deliberately does NOT touch `held`: that set is the key auto-repeat guard,
   * so a phantom held entry would swallow the next real keydown of the same
   * action. A trigger lives exactly one frame — consumed by `consume()` /
   * `consumeCount()`, then dropped by `endFrame()`, which is also why keys
   * pressed while paused never leak into the run.
   */
  trigger(action) {
    if (!action || !this.enabled) return false;
    this.register(action);
    return true;
  }

  register(action) {
    this.justPressed.set(action, (this.justPressed.get(action) ?? 0) + 1);
  }

  isDown(action) {
    return this.held.has(action);
  }

  consume(action) {
    return this.consumeCount(action) > 0;
  }

  /**
   * How many presses of `action` queued up since the last frame, draining the
   * queue. 1 for a keyboard tap; N for N gestures in the same frame.
   */
  consumeCount(action) {
    const count = this.justPressed.get(action) ?? 0;
    if (count > 0) this.justPressed.delete(action);
    return count;
  }

  endFrame() {
    this.justPressed.clear();
  }
}
