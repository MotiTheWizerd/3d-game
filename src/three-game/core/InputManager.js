const KEY_MAP = {
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  ArrowUp: "jump",
  KeyW: "jump",
  Space: "jump",
  Enter: "confirm",
};

export class InputManager {
  constructor(target = window) {
    this.target = target;
    this.held = new Set();
    this.justPressed = new Set();
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
      this.justPressed.add(action);
    }
  }

  onKeyUp(event) {
    const action = KEY_MAP[event.code];
    if (!action) return;
    this.held.delete(action);
  }

  isDown(action) {
    return this.held.has(action);
  }

  consume(action) {
    if (this.justPressed.has(action)) {
      this.justPressed.delete(action);
      return true;
    }
    return false;
  }

  endFrame() {
    this.justPressed.clear();
  }
}
