// Steering input. Touch: drag left/right anywhere on the water; the distance from where the finger
// went down is the rudder (full at 64 px), and the anchor follows the finger past full lock so
// reversing is instant. Lift the finger and the rudder centres. Double-tap tacks.
// Keyboard: A/D or arrows steer (ramped), Space / W / Up tacks.
import { TUNE } from '../../shared/core/boat';
import { OneEuroFilter } from './oneEuro';

const FULL_PX = 64;

export class SteerInput {
  private anchor: number | null = null;
  private pointerId: number | null = null;
  private raw = 0;
  private keyDir = 0;
  private keyVal = 0;
  private tackQueued = false;
  private lastTap = 0;
  private downX = 0;
  private downY = 0;
  private downT = 0;
  private filter = new OneEuroFilter({ minCutoff: 2.2, beta: 0.02, dCutoff: 1 });
  private smooth = 0;
  /** Two-finger pinch or mouse wheel: factor > 1 zooms out. */
  onPinch: ((factor: number) => void) | null = null;
  private pts = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;
  /** Called the first time the player steers. */
  onFirstSteer: (() => void) | null = null;
  private steered = false;
  enabled = true;

  constructor(private readonly el: HTMLElement) {
    el.addEventListener('pointerdown', this.down);
    el.addEventListener('pointermove', this.move);
    el.addEventListener('pointerup', this.up);
    el.addEventListener('pointercancel', this.up);
    el.addEventListener('wheel', this.wheel, { passive: false });
    window.addEventListener('keydown', this.key);
    window.addEventListener('keyup', this.key);
  }

  dispose(): void {
    this.el.removeEventListener('pointerdown', this.down);
    this.el.removeEventListener('pointermove', this.move);
    this.el.removeEventListener('pointerup', this.up);
    this.el.removeEventListener('pointercancel', this.up);
    this.el.removeEventListener('wheel', this.wheel);
    window.removeEventListener('keydown', this.key);
    window.removeEventListener('keyup', this.key);
  }

  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    this.onPinch?.(e.deltaY > 0 ? 1.08 : 1 / 1.08);
  };

  private spread(): number {
    const [a, b] = [...this.pts.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  private down = (e: PointerEvent) => {
    this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pts.size >= 2) {
      // Second finger: this is a pinch, not steering.
      this.pointerId = null;
      this.anchor = null;
      this.raw = 0;
      this.pinchDist = this.spread();
      return;
    }
    if (!this.enabled || this.pointerId !== null) return;
    this.pointerId = e.pointerId;
    this.anchor = e.clientX;
    this.downX = e.clientX;
    this.downY = e.clientY;
    this.downT = performance.now();
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  private move = (e: PointerEvent) => {
    if (this.pts.has(e.pointerId)) this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pts.size >= 2) {
      const d = this.spread();
      if (this.pinchDist > 0 && d > 0) this.onPinch?.(this.pinchDist / d);
      this.pinchDist = d;
      return;
    }
    if (e.pointerId !== this.pointerId || this.anchor === null) return;
    let dx = e.clientX - this.anchor;
    if (dx > FULL_PX) {
      this.anchor = e.clientX - FULL_PX;
      dx = FULL_PX;
    } else if (dx < -FULL_PX) {
      this.anchor = e.clientX + FULL_PX;
      dx = -FULL_PX;
    }
    this.raw = dx / FULL_PX;
    if (!this.steered && Math.abs(dx) > 12) {
      this.steered = true;
      this.onFirstSteer?.();
    }
  };

  private up = (e: PointerEvent) => {
    this.pts.delete(e.pointerId);
    if (this.pts.size < 2) this.pinchDist = 0;
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.anchor = null;
    this.raw = 0;
    const now = performance.now();
    const tap = now - this.downT < 260 && Math.hypot(e.clientX - this.downX, e.clientY - this.downY) < 14;
    if (tap) {
      if (now - this.lastTap < 320) {
        this.tackQueued = true;
        this.lastTap = 0;
      } else this.lastTap = now;
    }
  };

  private key = (e: KeyboardEvent) => {
    if (!this.enabled) return;
    const down = e.type === 'keydown';
    const k = e.key.toLowerCase();
    if (k === 'a' || k === 'arrowleft' || k === 'd' || k === 'arrowright') {
      const dir = k === 'a' || k === 'arrowleft' ? -1 : 1;
      if (down) this.keyDir = dir;
      else if (this.keyDir === dir) this.keyDir = 0;
      if (down && !this.steered) {
        this.steered = true;
        this.onFirstSteer?.();
      }
      e.preventDefault();
    } else if ((k === ' ' || k === 'w' || k === 'arrowup') && down && !e.repeat) {
      this.tackQueued = true;
      e.preventDefault();
    }
  };

  tack(): void {
    this.tackQueued = true;
  }

  /** Visual rudder value -1..1 (smoothed). */
  get value(): number {
    return this.smooth;
  }

  /** Sample once per simulation tick: integer rudder and tack press. */
  sample(dt: number): { steer: number; tack: boolean } {
    if (this.keyDir !== 0) this.keyVal += (this.keyDir - this.keyVal) * Math.min(1, dt * 9);
    else this.keyVal += (0 - this.keyVal) * Math.min(1, dt * 14);
    const target = this.pointerId !== null ? this.raw : this.keyVal;
    // Release springs back quickly without the filter's lag.
    this.smooth = this.pointerId === null && this.keyDir === 0 ? this.smooth * 0.55 + target * 0.45 : this.filter.filter(target, dt);
    if (this.pointerId === null) this.filter.reset(this.smooth);
    let steer = Math.round(this.smooth * TUNE.STEER_MAX);
    if (Math.abs(steer) <= 1) steer = 0;
    const tack = this.tackQueued;
    this.tackQueued = false;
    return { steer, tack };
  }
}
