// Camera with three blended modes:
// - orbit: a slow cinematic circle around the boat (start screen, after the finish)
// - drive (default): like driving a car in a game: low and behind the boat, turning with its
//   heading after a short lag, so what is ahead of the bow is ahead on screen
// - follow: three-quarter view from behind, the boat in the lower third, turned so the next
//   mark is ahead; it does not swing when the boat tacks
// - map: top-down view of the whole course, north up
// Zoom is the visible half-width at the boat, so portrait phones always see enough water.
import { MathUtils, PerspectiveCamera, Vector3 } from 'three';

const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const UP = new Vector3(0, 1, 0);

export const ZOOM_MIN = 7;
export const ZOOM_MAX = 40;

export type CamMode = 'drive' | 'chase' | 'low' | 'top';

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
  /** chase: behind and above; low: near the water, horizon in view; top: overhead tactical. */
  mode: CamMode = 'drive';
  private headYaw = 0;
  private headVel = 0;
  private driveK = 1;
  private pitchNow = 47;
  private distK = 1;
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
    this.headYaw = yaw;
    this.headVel = 0;
  }

  /**
   * x, y: boat position (course metres); heading: compass rad; speed: m/s;
   * aimYaw: compass bearing to the next mark (rad).
   */
  update(dt: number, x: number, y: number, heading: number, _speed: number, aimYaw: number, time: number): void {
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
    // Drive yaw: follows the boat's heading with a short, critically damped lag.
    const herr = wrapPi((this.fixed ? aimYaw : heading) - this.headYaw);
    const w1 = 2.4;
    this.headVel += (w1 * w1 * herr - 2 * w1 * this.headVel) * dt;
    this.headYaw = wrapPi(this.headYaw + this.headVel * dt);

    const ease = (cur: number, to: number, rate: number) => cur + (to - cur) * (1 - Math.exp(-dt * rate));
    this.map = ease(this.map, this.mapTarget, 4);
    this.orbit = ease(this.orbit, this.orbitTarget, 2.2);
    const m = MathUtils.smootherstep(this.map, 0, 1);
    const o = this.reducedMotion ? 0 : MathUtils.smootherstep(this.orbit, 0, 1);
    if (!this.reducedMotion) this.orbitAngle += dt * 0.16;

    const vfov = MathUtils.degToRad(cam.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * cam.aspect);

    // ---- follow pose ----
    const P = this.mode === 'low' ? { p: 14, d: 0.62, lead: 0.55 } : this.mode === 'top' ? { p: 82, d: 1.9, lead: 0.12 } : { p: 47, d: 1, lead: 0.3 };
    this.pitchNow = ease(this.pitchNow, P.p, 3);
    this.distK = ease(this.distK, P.d, 3);
    const followDist = (this.halfWidth / Math.tan(hfov / 2)) * this.distK;
    const pitch = MathUtils.degToRad(this.pitchNow);
    const sy = Math.sin(this.yaw);
    const cy = Math.cos(this.yaw);
    // Look at a point ahead of the boat so the boat sits in the lower third.
    const lead = followDist * (this.mode === 'low' ? 0.9 : this.mode === 'top' ? 0.12 : 0.3);
    const flx = this.tx + sy * lead;
    const fly = this.ty + cy * lead;
    const fpx = flx - sy * Math.cos(pitch) * followDist;
    const fpy = fly - cy * Math.cos(pitch) * followDist;
    let fph = Math.sin(pitch) * followDist;
    let fpx2 = fpx;
    let fpy2 = fpy;
    let flx2 = flx;
    let fly2 = fly;
    let flh = this.mode === 'low' ? 1.5 : 0;

    // ---- drive pose: close behind the stern, eye a few metres up, looking past the bow ----
    this.driveK = ease(this.driveK, this.mode === 'drive' ? 1 : 0, 3);
    if (this.driveK > 0.001) {
      const hs = Math.sin(this.headYaw);
      const hc = Math.cos(this.headYaw);
      const back = 12 + this.halfWidth * 0.8;
      const up = 4.5 + this.halfWidth * 0.32;
      const ahead = 16 + this.halfWidth * 0.6;
      const d = this.driveK;
      fpx2 = MathUtils.lerp(fpx, this.tx - hs * back, d);
      fpy2 = MathUtils.lerp(fpy, this.ty - hc * back, d);
      fph = MathUtils.lerp(fph, up, d);
      flx2 = MathUtils.lerp(flx, this.tx + hs * ahead, d);
      fly2 = MathUtils.lerp(fly, this.ty + hc * ahead, d);
      flh = MathUtils.lerp(flh, 0, d);
    }

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
    let px = MathUtils.lerp(fpx2, opx, o);
    let py = MathUtils.lerp(fpy2, opy, o);
    let ph = MathUtils.lerp(fph, oph, o);
    let lx = MathUtils.lerp(flx2, olx, o);
    let ly = MathUtils.lerp(fly2, oly, o);
    let lh = MathUtils.lerp(flh, olh, o);
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
