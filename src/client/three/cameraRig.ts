// Follow camera: three-quarter view behind the boat, turning slowly so the next mark is ahead.
// Fits the view to the screen width so a portrait phone still sees enough water.
// "Map" mode lifts it to a top-down view of the whole course.
import { MathUtils, PerspectiveCamera, Vector3 } from 'three';

const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class CameraRig {
  readonly camera = new PerspectiveCamera(55, 1, 1, 3000);
  private yaw = 0;
  private yawVel = 0;
  private tx = 0;
  private ty = 0;
  private map = 0; // 0 follow .. 1 map (animated)
  private mapTarget = 0;
  /** Half the visible width at the boat, in metres (zoom). */
  halfWidth = 15;
  reducedMotion = false;
  private shake = 0;

  constructor(private readonly courseCentre: { x: number; y: number }) {}

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    // Taller field of view on portrait screens so the view reaches further ahead.
    this.camera.fov = w < h ? 62 : 50;
    this.camera.updateProjectionMatrix();
  }

  setMap(on: boolean): void {
    this.mapTarget = on ? 1 : 0;
  }
  get inMap(): boolean {
    return this.mapTarget > 0.5;
  }

  bump(amount: number): void {
    if (!this.reducedMotion) this.shake = Math.max(this.shake, amount);
  }

  /** Debug: hold the camera at a fixed view (x, y, yaw degrees, half-width) for screenshots. */
  fixed: { x: number; y: number; yaw: number } | null = null;

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
  update(dt: number, x: number, y: number, heading: number, speed: number, aimYaw: number, time: number): void {
    const cam = this.camera;
    if (this.fixed) {
      x = this.fixed.x;
      y = this.fixed.y;
      aimYaw = this.fixed.yaw;
      speed = 0;
      this.tx = x;
      this.ty = y;
      this.yaw = aimYaw;
      this.yawVel = 0;
    }
    // Look ahead along the heading so more of the water in front is visible.
    const look = Math.min(16, speed * 2.2);
    const ax = x + Math.sin(heading) * look;
    const ay = y + Math.cos(heading) * look;
    const k = 1 - Math.exp(-dt * 3.2);
    this.tx += (ax - this.tx) * k;
    this.ty += (ay - this.ty) * k;

    // Critically damped yaw towards the bearing of the next mark.
    const want = this.reducedMotion ? 0 : aimYaw;
    const err = wrapPi(want - this.yaw);
    const w0 = 1.1;
    this.yawVel += (w0 * w0 * err - 2 * w0 * this.yawVel) * dt;
    this.yaw = wrapPi(this.yaw + this.yawVel * dt);

    this.map += (this.mapTarget - this.map) * (1 - Math.exp(-dt * 4));
    const m = MathUtils.smootherstep(this.map, 0, 1);

    // Distance from the visible half-width and the horizontal field of view.
    const vfov = MathUtils.degToRad(cam.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * cam.aspect);
    const followDist = this.halfWidth / Math.tan(hfov / 2);
    const pitch = MathUtils.degToRad(40);

    const mapHalf = 250;
    const mapDist = mapHalf / Math.tan(Math.min(hfov, vfov) / 2);
    const cx = this.courseCentre.x;
    const cy = this.courseCentre.y;

    const fx = this.tx - Math.sin(this.yaw) * Math.cos(pitch) * followDist;
    const fy = this.ty - Math.cos(this.yaw) * Math.cos(pitch) * followDist;
    const fh = Math.sin(pitch) * followDist;

    const px = MathUtils.lerp(fx, cx, m);
    const py = MathUtils.lerp(fy, cy - 1, m);
    const ph = MathUtils.lerp(fh, mapDist, m);
    const lx = MathUtils.lerp(this.tx, cx, m);
    const ly = MathUtils.lerp(this.ty, cy, m);

    let sx = 0;
    let sy = 0;
    if (this.shake > 0.001) {
      sx = Math.sin(time * 47) * this.shake * 0.5;
      sy = Math.cos(time * 39) * this.shake * 0.5;
      this.shake *= Math.exp(-dt * 7);
    }
    cam.position.set(px + sx, ph, -py + sy);
    // In map mode keep north up; in follow mode the up vector follows the yaw.
    const upYaw = MathUtils.lerp(this.yaw, 0, m);
    cam.up.set(Math.sin(upYaw), 0, -Math.cos(upYaw)).lerp(new Vector3(0, 1, 0), 1 - m).normalize();
    cam.lookAt(lx, 0, -ly);
  }
}
