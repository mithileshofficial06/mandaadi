// Camera with three blended modes:
// - orbit: a slow cinematic circle around the boat (start screen, after the finish)
// - follow: three-quarter view from behind, the boat in the lower third, turned so the next
//   mark is ahead; it does not swing when the boat tacks
// - map: top-down view of the whole course, north up
// Zoom is the visible half-width at the boat, so portrait phones always see enough water.
import { MathUtils, PerspectiveCamera, Vector3 } from 'three';

const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const UP = new Vector3(0, 1, 0);

export const ZOOM_MIN = 7;
export const ZOOM_MAX = 40;

export class CameraRig {
  readonly camera = new PerspectiveCamera(55, 1, 0.5, 3000);
  private yaw = 0;
  private yawVel = 0;
  private tx = 0;
  private ty = 0;
  private map = 0;
  private mapTarget = 0;
  private orbit = 1;
  private orbitTarget = 1;
  private orbitAngle = 0;
  /** Half the visible width at the boat, in metres (zoom). */
  halfWidth = 11.5;
  reducedMotion = false;
  private shake = 0;
  /** Debug: hold the camera at a fixed view (x, y, yaw) for screenshots. */
  fixed: { x: number; y: number; yaw: number } | null = null;
  private tmpUp = new Vector3();

  constructor(private readonly courseCentre: { x: number; y: number }) {}

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    // Taller field of view on portrait screens so the view reaches further ahead.
    this.camera.fov = w < h ? 60 : 48;
    this.camera.updateProjectionMatrix();
  }

  setMap(on: boolean): void {
    this.mapTarget = on ? 1 : 0;
  }
  get inMap(): boolean {
    return this.mapTarget > 0.5;
  }

  /** Cinematic orbit around the boat (start screen and finish). */
  setOrbit(on: boolean, startAngle?: number): void {
    this.orbitTarget = on ? 1 : 0;
    if (startAngle !== undefined) this.orbitAngle = startAngle;
  }

  zoomBy(factor: number): void {
    this.halfWidth = MathUtils.clamp(this.halfWidth * factor, ZOOM_MIN, ZOOM_MAX);
  }

  bump(amount: number): void {
    if (!this.reducedMotion) this.shake = Math.max(this.shake, amount);
  }

  snap(x: number, y: number, yaw: number): void {
    this.tx = x;
    this.ty = y;
    this.yaw = this.reducedMotion ? 0 : yaw;
    this.yawVel = 0;
  }

  /**
   * x, y: boat position (course metres); heading: compass rad; speed: m/s;
   * aimYaw: compass bearing to the next mark (rad).
   */
  update(dt: number, x: number, y: number, _heading: number, _speed: number, aimYaw: number, time: number): void {
    const cam = this.camera;
    if (this.fixed) {
      x = this.fixed.x;
      y = this.fixed.y;
      aimYaw = this.fixed.yaw;
      this.yaw = aimYaw;
      this.yawVel = 0;
      this.orbit = this.orbitTarget = 0;
    }
    const k = this.fixed ? 1 : 1 - Math.exp(-dt * 7);
    this.tx += (x - this.tx) * k;
    this.ty += (y - this.ty) * k;

    // Critically damped yaw towards the bearing of the next mark.
    const want = this.reducedMotion ? 0 : aimYaw;
    const err = wrapPi(want - this.yaw);
    const w0 = 1.2;
    this.yawVel += (w0 * w0 * err - 2 * w0 * this.yawVel) * dt;
    this.yaw = wrapPi(this.yaw + this.yawVel * dt);

    const ease = (cur: number, to: number, rate: number) => cur + (to - cur) * (1 - Math.exp(-dt * rate));
    this.map = ease(this.map, this.mapTarget, 4);
    this.orbit = ease(this.orbit, this.orbitTarget, 2.2);
    const m = MathUtils.smootherstep(this.map, 0, 1);
    const o = this.reducedMotion ? 0 : MathUtils.smootherstep(this.orbit, 0, 1);
    if (!this.reducedMotion) this.orbitAngle += dt * 0.16;

    const vfov = MathUtils.degToRad(cam.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * cam.aspect);

    // ---- follow pose ----
    const followDist = this.halfWidth / Math.tan(hfov / 2);
    const pitch = MathUtils.degToRad(47);
    const sy = Math.sin(this.yaw);
    const cy = Math.cos(this.yaw);
    // Look at a point ahead of the boat so the boat sits in the lower third.
    const lead = followDist * 0.3;
    const flx = this.tx + sy * lead;
    const fly = this.ty + cy * lead;
    const fpx = flx - sy * Math.cos(pitch) * followDist;
    const fpy = fly - cy * Math.cos(pitch) * followDist;
    const fph = Math.sin(pitch) * followDist;

    // ---- orbit pose: low and close, circling slowly ----
    const od = 25;
    const op = MathUtils.degToRad(13);
    const opx = this.tx - Math.sin(this.orbitAngle) * Math.cos(op) * od;
    const opy = this.ty - Math.cos(this.orbitAngle) * Math.cos(op) * od;
    const oph = Math.sin(op) * od + 1.2;
    const olx = this.tx;
    const oly = this.ty;
    // Aim below the boat so it sits in the top half, above the start card.
    const olh = -6.5;

    // ---- map pose ----
    const mapHalf = 250;
    const mapDist = mapHalf / Math.tan(Math.min(hfov, vfov) / 2);
    const mcx = this.courseCentre.x;
    const mcy = this.courseCentre.y;

    // Blend follow -> orbit, then -> map.
    let px = MathUtils.lerp(fpx, opx, o);
    let py = MathUtils.lerp(fpy, opy, o);
    let ph = MathUtils.lerp(fph, oph, o);
    let lx = MathUtils.lerp(flx, olx, o);
    let ly = MathUtils.lerp(fly, oly, o);
    let lh = MathUtils.lerp(0, olh, o);
    px = MathUtils.lerp(px, mcx, m);
    py = MathUtils.lerp(py, mcy - 1, m);
    ph = MathUtils.lerp(ph, mapDist, m);
    lx = MathUtils.lerp(lx, mcx, m);
    ly = MathUtils.lerp(ly, mcy, m);
    lh = MathUtils.lerp(lh, 0, m);

    let shx = 0;
    let shy = 0;
    if (this.shake > 0.001) {
      shx = Math.sin(time * 47) * this.shake * 0.5;
      shy = Math.cos(time * 39) * this.shake * 0.5;
      this.shake *= Math.exp(-dt * 7);
    }
    cam.position.set(px + shx, ph, -py + shy);
    // Map mode keeps north up; otherwise world up.
    this.tmpUp.set(0, 0, -1).lerp(UP, 1 - m).normalize();
    cam.up.copy(this.tmpUp);
    cam.lookAt(lx, lh, -ly);
  }
}
