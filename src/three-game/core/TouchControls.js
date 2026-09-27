import { CONFIG } from "../config.js";

/**
 * Touch controls — one-finger gestures translated into InputManager actions.
 *
 *   swipe ← / →   "left" / "right"   (a fast flick crosses several lanes)
 *   swipe ↑       "jump"             ("confirm" off the menu screens)
 *   tap           "dash"             ("confirm" to start / restart a run)
 *   hold still    "pause"
 *   swipe ↓       nothing — there is no slide in this game yet
 *
 * Two rules keep it honest:
 *
 * 1. It never touches game state. It fires *action names* at the InputManager,
 *    so the game loop stays the only place where an action becomes behaviour —
 *    a paused run drops a swipe exactly like it drops a stale keypress.
 * 2. It only listens where you actually play. Attach it to the canvas mount and
 *    leave the HUD layer alone, so overlay buttons keep their normal taps.
 *
 * No timers anywhere: a hold is measured on release, so detaching can never
 * leave a callback behind, and tests drive it with synthetic touches in
 * simulated time.
 */
export class TouchControls {
  constructor(input, target = null, { events = null, now = null } = {}) {
    this.input = input;
    this.target = target;
    this.events = events;
    this.now = now ?? (() => Date.now());

    this.enabled = true;
    this.attached = false;
    /** True only while a run is live — decides tap → dash vs tap → confirm. */
    this.playing = false;
    /** The finger we are tracking, or null when the screen is up. */
    this.gesture = null;

    this.onTouchStart = this.onTouchStart.bind(this);
    this.onTouchMove = this.onTouchMove.bind(this);
    this.onTouchEnd = this.onTouchEnd.bind(this);
    this.onTouchCancel = this.onTouchCancel.bind(this);

    // The game is the authority on whether we're mid-run.
    events?.on("state:changed", (state) => {
      this.playing = state === "playing";
      if (!this.playing) this.gesture = null;
    });
  }

  attach() {
    if (!this.target || this.attached) return false;
    const options = { passive: false };
    this.target.addEventListener("touchstart", this.onTouchStart, options);
    this.target.addEventListener("touchmove", this.onTouchMove, options);
    this.target.addEventListener("touchend", this.onTouchEnd, options);
    this.target.addEventListener("touchcancel", this.onTouchCancel, options);
    this.attached = true;
    return true;
  }

  detach() {
    if (!this.target || !this.attached) return false;
    this.target.removeEventListener("touchstart", this.onTouchStart);
    this.target.removeEventListener("touchmove", this.onTouchMove);
    this.target.removeEventListener("touchend", this.onTouchEnd);
    this.target.removeEventListener("touchcancel", this.onTouchCancel);
    this.attached = false;
    this.gesture = null;
    return true;
  }

  // ---- gesture handlers ----------------------------------------------------

  onTouchStart(event) {
    if (!this.enabled) return;
    const touch = pick(event.changedTouches) ?? pick(event.touches);
    if (!touch) return;
    // Own the touch: no page scroll, no rubber-band, no double-tap zoom.
    stop(event);

    if (this.gesture) {
      // A second finger means a pinch or a stray thumb. Kill the in-flight
      // gesture instead of letting it finish as a swipe.
      this.gesture.void = true;
      return;
    }

    this.gesture = {
      id: idOf(touch),
      x0: touch.clientX,
      y0: touch.clientY,
      x: touch.clientX,
      y: touch.clientY,
      t0: this.now(),
      laneSteps: 0, // net lane changes already fired (+right / -left)
      jumped: false,
      void: false,
    };
  }

  onTouchMove(event) {
    const g = this.gesture;
    if (!g || !this.enabled) return;
    const touch = pick(event.changedTouches) ?? pick(event.touches, g.id);
    if (!touch || idOf(touch) !== g.id) return;
    stop(event);
    if (g.void) return;

    g.x = touch.clientX;
    g.y = touch.clientY;

    const dx = g.x - g.x0;
    const dy = g.y - g.y0;

    // Whichever axis dominates decides, so a diagonal drag can't do two
    // things at once. Re-read every move: the flick keeps paying out for as
    // far as it travels, and reverses if you drag back.
    if (Math.abs(dx) >= Math.abs(dy)) {
      const target = Math.trunc(dx / CONFIG.touch.swipeThreshold);
      while (g.laneSteps < target) {
        g.laneSteps += 1;
        this.fire("right");
      }
      while (g.laneSteps > target) {
        g.laneSteps -= 1;
        this.fire("left");
      }
    } else if (!g.jumped && -dy >= CONFIG.touch.swipeThreshold) {
      g.jumped = true;
      this.fire(this.playing ? "jump" : "confirm");
    }
  }

  onTouchEnd(event) {
    const g = this.gesture;
    if (!g) return;
    // Swallow the synthetic click / double-tap zoom that follows a lift.
    stop(event);

    // If it's a different finger that lifted, our gesture is still down.
    const lifted = pick(event.changedTouches);
    if (lifted && idOf(lifted) !== g.id) return;

    const touch = pick(event.changedTouches, g.id);
    if (touch) {
      g.x = touch.clientX;
      g.y = touch.clientY;
    }
    this.gesture = null;
    if (g.void || !this.enabled) return;

    const cfg = CONFIG.touch;
    const heldMs = this.now() - g.t0;
    const movedPx = Math.max(Math.abs(g.x - g.x0), Math.abs(g.y - g.y0));
    if (g.laneSteps !== 0 || g.jumped || movedPx > cfg.tapSlopPx) return; // acted

    if (heldMs >= cfg.holdToPauseMs) {
      this.fire("pause");
      return;
    }
    this.fire(this.playing ? "dash" : "confirm");
  }

  onTouchCancel() {
    // System took the touch (notification shade, incoming call, palm reject).
    this.gesture = null;
  }

  // ---- plumbing ------------------------------------------------------------

  /** Turn a gesture into an action the game loop will pick up next frame. */
  fire(action) {
    return this.input.trigger(action);
  }
}

/** Identifier-free touches (some synthetic events) all count as finger 0. */
function idOf(touch) {
  return touch.identifier ?? 0;
}

/** First touch in a TouchList/array, optionally only the one we're tracking. */
function pick(pool, id = null) {
  if (!pool) return null;
  for (let i = 0; i < pool.length; i++) {
    const touch = pool[i];
    if (!touch) continue;
    if (id === null || idOf(touch) === id) return touch;
  }
  return null;
}

function stop(event) {
  event?.preventDefault?.();
}
