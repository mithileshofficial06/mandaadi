// The race: scene, fixed 30 Hz simulation with interpolated rendering, input recording,
// the Harbourmaster ghost, sound, haptics and HUD updates.
import {
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  NeutralToneMapping,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { EV, NO_GO, type BoatState, initialState, raceTicks, step, vmax } from '../../shared/core/boat';
import type { Course } from '../../shared/core/course';
import { GUN_TICK, Q10, TICK_HZ, UM_PER_M } from '../../shared/core/fixed';
import { InputRecorder } from '../../shared/core/inputs';
import { Pilot } from '../../shared/core/pilot';
import { ANG, signedA } from '../../shared/core/trig';
import { puffCentre } from '../../shared/core/wind';
import { sfx } from '../app/audio';
import { SteerInput } from '../input/steer';
import { CameraRig } from '../three/cameraRig';
import { createCourseMarks } from '../three/courseMarks';
import { createCone, createWake } from '../three/effects';
import { createLand } from '../three/islands';
import { LIVERIES, createBoat, type BoatModel } from '../three/boatModel';
import { QualityScaler } from '../three/renderer';
import { createWater } from '../three/water';
import { type Sky, createSky } from '../three/sky';
import { type Birds, createBirds } from '../three/birds';
import { landOf } from '../three/world';
import { fmtTicks, hud } from './hudState';

const RAD = (2 * Math.PI) / ANG;
/** Sun high and off to one side of the wind, so the glitter path crosses the view but never floods it. */
function sunFor(windFromRad: number): Vector3 {
  const az = windFromRad + 1.25;
  const el = (52 * Math.PI) / 180;
  return new Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az)).normalize();
}

type Snap = { x: number; y: number; h: number };
/** Start the intro orbit looking at the boat's bow quarter. */
const s0Angle = (heading: number) => heading + 2.4;

const vibrate = (p: number | number[]) => {
  try {
    navigator.vibrate?.(p);
  } catch {
    /* not supported */
  }
};

export type RaceOpts = { coach: boolean; laylines: boolean; reducedMotion: boolean };

export class Race {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private rig: CameraRig;
  private quality: QualityScaler;
  private input: SteerInput;
  private s: BoatState;
  private prev: Snap;
  private ghost: BoatState;
  private ghostPrev: Snap;
  private pilot: Pilot;
  private rec = new InputRecorder();
  /** Debug: ?autopilot=1 sails the player's boat with the autopilot (for end-to-end screenshots). */
  private auto: Pilot | null = null;
  private acc = 0;
  private last = 0;
  private time = 0;
  private running = false;
  private raf = 0;
  private boat: BoatModel;
  private ghostBoat: BoatModel;
  private water;
  private land;
  private marks;
  private cone;
  private wake;
  private ghostWake;
  private fog: Fog;
  private sky: Sky;
  private birds: Birds;
  private wakeT = 0;
  private coneTime = 0;
  private promptStage = 0;
  private gustNear = false;
  private lastCountdown = 4;
  private inGust = false;
  private onFinish: ((log: InputRecorder['log'], s: BoatState) => void) | null = null;
  private route: Array<[number, number]> = [];
  private ghostRoute: Array<[number, number]> = [];
  private topSpeed = 0;
  private paused = false;
  private toastId = 0;
  private toastTimer = 0;
  private finishHinted = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly course: Course,
    private readonly opts: RaceOpts
  ) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.quality = new QualityScaler(window.devicePixelRatio, Number(new URLSearchParams(location.search).get('dpr')) || undefined);
    this.renderer.setPixelRatio(this.quality.dpr);
    this.quality.onChange = (d) => {
      this.renderer.setPixelRatio(d);
      this.resize();
    };

    const sky = new Color('#d8ecf2');
    this.scene.background = sky;
    this.fog = new Fog(sky, 420, 1300);
    this.scene.fog = this.fog;
    const SUN = sunFor(course.wind.from * RAD);
    this.scene.add(new HemisphereLight('#cfe9ff', '#d8c79c', 1.25));
    const sun = new DirectionalLight('#fff1d6', 2.4);
    sun.position.copy(SUN).multiplyScalar(100);
    this.scene.add(sun);

    const windFromRad = course.wind.from * RAD;
    const windToRad = windFromRad + Math.PI;
    const land = landOf(course);
    this.water = createWater(land, windToRad, SUN, course.wind.strength);
    this.sky = createSky(SUN);
    this.scene.add(this.sky.mesh);
    const isl = course.islands.map((i) => i.parts[0]!).map((p) => ({ x: p.x, y: p.y }));
    this.birds = createBirds([...isl, { x: -100, y: 120 }, ...(course.marks[0] ? [course.marks[0]] : [])]);
    this.scene.add(this.birds.mesh);
    this.scene.add(this.water.mesh);
    this.land = createLand(course, windToRad, SUN);
    this.scene.add(this.land.group);
    this.marks = createCourseMarks(course);
    this.scene.add(this.marks.group);
    this.cone = createCone(NO_GO * RAD);
    this.scene.add(this.cone.mesh);
    this.wake = createWake();
    this.ghostWake = createWake({ life: 9, opacity: 0.45 });
    this.scene.add(this.wake.mesh, this.ghostWake.mesh);

    this.boat = createBoat(LIVERIES[0]!);
    this.ghostBoat = createBoat({ ...LIVERIES[1]!, sailNo: 'HM' }, { ghost: true });
    this.scene.add(this.boat.root, this.ghostBoat.root);

    const cx = (course.start.a.x + course.start.b.x + course.marks.reduce((a, m) => a + m.x, 0)) / (2 + course.marks.length);
    const cy = (course.start.a.y + course.start.b.y + course.marks.reduce((a, m) => a + m.y, 0)) / (2 + course.marks.length);
    this.rig = new CameraRig({ x: cx, y: cy });
    this.rig.reducedMotion = opts.reducedMotion;

    this.s = initialState(course);
    this.prev = { x: this.s.x, y: this.s.y, h: this.s.h };
    this.ghost = initialState(course);
    // The ghost starts a boat-length to leeward so the two never sit on top of each other.
    this.ghost.x += 7 * UM_PER_M;
    this.ghostPrev = { x: this.ghost.x, y: this.ghost.y, h: this.ghost.h };
    this.pilot = new Pilot(course, { up: Math.round((50 * ANG) / 360), down: Math.round((150 * ANG) / 360), overstand: 12, firstSide: -1 });

    if (new URLSearchParams(location.search).get('autopilot')) this.auto = new Pilot(course);
    this.input = new SteerInput(canvas);
    this.input.onFirstSteer = () => {
      if (this.promptStage === 1) this.setPrompt(null);
    };
    this.input.onPinch = (f) => this.rig.zoomBy(f);

    // Debug: ?view=x,y,yawDeg,halfWidth holds the camera still (for screenshots).
    const view = new URLSearchParams(location.search).get('view');
    if (view) {
      const [vx, vy, vyaw, vhw] = view.split(',').map(Number);
      this.rig.fixed = { x: vx ?? 200, y: vy ?? 100, yaw: ((vyaw ?? 0) * Math.PI) / 180 };
      if (vhw) this.rig.halfWidth = vhw;
    }
    this.resize();
    window.addEventListener('resize', this.resize);
    this.marks.setActive(0, false);
    this.marks.setLaylines(opts.laylines, windFromRad);
    this.placeCamera();
    this.rig.setOrbit(!view, s0Angle(this.s.h * RAD));
    this.renderFrame(0);
    hud.phase.value = 'ready';
  }

  private resize = () => {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.rig.resize(w, h);
  };

  private placeCamera(): void {
    const t = this.nextTarget(this.s);
    const bx = this.s.x / UM_PER_M;
    const by = this.s.y / UM_PER_M;
    this.rig.snap(bx, by, Math.atan2(t.x - bx, t.y - by));
    this.rig.update(0.016, bx, by, this.s.h * RAD, 0, Math.atan2(t.x - bx, t.y - by), 0);
  }

  private nextTarget(s: BoatState): { x: number; y: number } {
    const m = this.course.marks[s.leg];
    if (m && s.started) return m;
    if (!s.started) return this.course.marks[0] ?? this.course.finish.a;
    const f = this.course.finish;
    return { x: (f.a.x + f.b.x) / 2, y: (f.a.y + f.b.y) / 2 };
  }

  setOnFinish(cb: (log: InputRecorder['log'], s: BoatState) => void): void {
    this.onFinish = cb;
  }

  tack(): void {
    this.input.tack();
  }

  toggleMap(): void {
    this.rig.setMap(!this.rig.inMap);
    hud.map.value = this.rig.inMap;
  }

  zoom(factor: number): void {
    this.rig.zoomBy(factor);
  }

  /** Begin the countdown and race. */
  go(): void {
    sfx.unlock();
    this.running = true;
    this.last = performance.now();
    hud.phase.value = 'countdown';
    hud.countdown.value = 3;
    this.rig.setOrbit(false);
    if (this.opts.coach) this.setPrompt('Drag left or right to steer', 1);
    sfx.pip();
    this.lastCountdown = 3;
    this.loop(this.last);
  }

  /** Idle render loop for the start screen (water and palms move). */
  idle(): void {
    let last = performance.now();
    const tick = (now: number) => {
      if (this.running) return;
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      this.renderFrame(dt);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.input.dispose();
    window.removeEventListener('resize', this.resize);
    sfx.stopMotion();
    this.renderer.dispose();
  }

  private toast(text: string, kind: 'good' | 'bad' | 'info', sub?: string, ms = 2600): void {
    const id = ++this.toastId;
    hud.toast.value = { id, text, kind, ...(sub ? { sub } : {}) };
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      if (hud.toast.value?.id === id) hud.toast.value = null;
    }, ms);
  }

  /** Pause (help sheet open). The race clock is simulation time, so pausing costs nothing. */
  pause(): void {
    if (!this.running || this.paused) return;
    this.paused = true;
    this.running = false;
    hud.paused.value = true;
    sfx.stopMotion();
    cancelAnimationFrame(this.raf);
    this.idle();
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    hud.paused.value = false;
    cancelAnimationFrame(this.raf);
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  get isRacing(): boolean {
    return this.running && !this.paused;
  }

  private setPrompt(text: string | null, stage = 0): void {
    hud.prompt.value = text;
    if (text) this.promptStage = stage;
  }

  private loop = (now: number) => {
    if (!this.running) return;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.quality.sample(dt);
    this.acc += dt;
    const stepDt = 1 / TICK_HZ;
    while (this.acc >= stepDt) {
      this.acc -= stepDt;
      this.tickSim(stepDt);
      if (!this.running) break;
    }
    this.renderFrame(dt);
    if (this.running || hud.phase.value === 'finished') this.raf = requestAnimationFrame(this.loop);
  };

  private tickSim(stepDt: number): void {
    const s = this.s;
    if (s.phase === 'finished' || s.phase === 'dnf') {
      // keep the ghost sailing for the view
      this.stepGhost();
      return;
    }
    this.prev.x = s.x;
    this.prev.y = s.y;
    this.prev.h = s.h;
    const input = this.auto ? this.auto.next(s) : this.input.sample(stepDt);
    this.rec.record(s.tick, input);
    step(s, this.course, input);
    this.stepGhost();
    this.handleEvents(s);

    const vm = vmax(this.course);
    if (s.tick % 6 === 0) {
      this.route.push([s.x / UM_PER_M, s.y / UM_PER_M]);
      this.ghostRoute.push([this.ghost.x / UM_PER_M, this.ghost.y / UM_PER_M]);
    }
    const kn = Math.max(0, (s.v * TICK_HZ) / UM_PER_M) * 1.944;
    if (s.tick > GUN_TICK) this.topSpeed = Math.max(this.topSpeed, kn);
    hud.speed.value = kn;
    hud.gust.value = Math.round(((s.wind - Q10) * 100) / Q10);
    hud.steer.value = this.input.value;
    const twa = signedA(s.h - s.windFrom);
    const inCone = Math.abs(twa) < NO_GO;
    hud.inCone.value = inCone;
    hud.downwind.value = Math.abs(twa) > ANG / 4;
    const deg = (Math.abs(twa) * 360) / ANG;
    hud.status.value = inCone ? 'irons' : deg < 62 ? 'upwind' : deg < 128 ? 'reach' : deg < 165 ? 'downwind' : 'run';
    // Near the finish: say so once.
    if (s.started && s.leg >= this.course.marks.length && !this.finishHinted && hud.legDist.value < 40) {
      this.finishHinted = true;
      this.toast('Cross the line to finish', 'info');
    }
    if (s.tick < GUN_TICK) {
      const c = Math.ceil((GUN_TICK - s.tick) / TICK_HZ);
      if (c !== this.lastCountdown) {
        this.lastCountdown = c;
        hud.countdown.value = c;
        sfx.pip();
      }
      hud.clock.value = `-${fmtTicks(GUN_TICK - s.tick).slice(3)}`;
    } else {
      hud.clock.value = fmtTicks(s.tick - GUN_TICK + s.penalty);
      if (hud.phase.value === 'countdown') hud.phase.value = 'racing';
    }

    // Coaching prompts, only at the moment they matter.
    if (this.opts.coach) {
      if (inCone && s.tick > GUN_TICK) this.coneTime += stepDt;
      else this.coneTime = Math.max(0, this.coneTime - stepDt);
      if (this.coneTime > 0.6 && this.promptStage < 2) this.setPrompt("The red cone is the wind. You can't sail into it. Zigzag, or tap TACK.", 2);
      if (this.promptStage === 2 && !inCone && this.coneTime === 0) this.setPrompt(null);
      if (this.promptStage === 1 && s.tick > GUN_TICK + 150) this.setPrompt(null);
      if (this.promptStage < 3 && s.tick > GUN_TICK + 60 && !this.gustNear && this.nearGust(s)) {
        this.gustNear = true;
        this.setPrompt('Dark, rippled water = more wind. Go get it.', 3);
        window.setTimeout(() => {
          if (this.promptStage === 3) this.setPrompt(null);
        }, 4500);
      }
    }
    const gustNow = s.wind > Q10 + 60;
    if (gustNow && !this.inGust) sfx.gust();
    this.inGust = gustNow;
    sfx.setMotion(Math.min(1.2, s.v / vm), Math.min(1, (s.wind / Q10) * 0.6 + (s.v / vm) * 0.3), inCone && s.v < vm * 0.5 ? 1 : inCone ? 0.6 : 0);
  }

  private nearGust(s: BoatState): boolean {
    for (const p of this.course.puffs) {
      if (p.k <= 100) continue;
      const c = puffCentre(this.course, p, s.tick);
      const d = Math.hypot(s.x - c.x, s.y - c.y) / UM_PER_M;
      if (d < p.r + 40) return true;
    }
    return false;
  }

  private stepGhost(): void {
    const g = this.ghost;
    this.ghostPrev.x = g.x;
    this.ghostPrev.y = g.y;
    this.ghostPrev.h = g.h;
    if (g.phase === 'prestart' || g.phase === 'racing') step(g, this.course, this.pilot.next(g));
  }

  private handleEvents(s: BoatState): void {
    const e = s.ev;
    if (!e) return;
    if (e & EV.GUN) {
      sfx.gun();
      vibrate(60);
      hud.countdown.value = 0;
    }
    if (e & EV.TACK || e & EV.GYBE) {
      sfx.tack();
      vibrate(25);
    }
    if (e & EV.ROUND) {
      sfx.bell();
      vibrate([30, 60, 30]);
      const more = s.leg < this.course.marks.length;
      this.toast(`Mark ${s.leg} rounded · ${fmtTicks(s.tick - GUN_TICK + s.penalty)}`, 'good', more ? `On to mark ${s.leg + 1}` : 'Now race back through the line', 3200);
      this.marks.setActive(s.leg, true);
      this.marks.setLaylines(this.opts.laylines, s.windFrom * RAD);
    }
    if (e & EV.START) {
      this.marks.setActive(s.leg, true);
      hud.banner.value = null;
      const late = (s.tick - GUN_TICK) / TICK_HZ;
      if (late < 1.2) this.toast('Great start', 'good', `Over the line ${late.toFixed(1)} s after the gun`);
      else this.toast('You are racing', 'info', `Over the line ${late.toFixed(1)} s after the gun`);
    }
    if (e & EV.EARLY) hud.banner.value = 'Over early: go back behind the line';
    if (e & EV.CLEAR) hud.banner.value = null;
    if (e & EV.HIT) {
      sfx.hit();
      vibrate(180);
      this.rig.bump(0.8);
      hud.penaltyFlash.value = hud.penaltyFlash.value + 1;
      this.toast('Ran aground: +2.0 s', 'bad', 'Steer away from the sand');
    }
    if (e & EV.FINISH) this.finish(s);
  }

  private finish(s: BoatState): void {
    sfx.finish();
    vibrate([60, 80, 120]);
    const ticks = raceTicks(s);
    const g = this.ghost;
    const vsGhost = g.phase === 'finished' ? ticks - raceTicks(g) : null;
    hud.clock.value = fmtTicks(ticks);
    this.route.push([s.x / UM_PER_M, s.y / UM_PER_M]);
    hud.result.value = {
      ticks,
      tacks: s.tacks,
      hits: s.hits,
      penalties: s.penalty,
      vsGhost,
      finished: true,
      route: this.route.slice(),
      ghostRoute: this.ghostRoute.slice(),
      topSpeed: this.topSpeed,
    };
    hud.toast.value = null;
    hud.phase.value = 'finished';
    hud.prompt.value = null;
    hud.banner.value = null;
    this.input.enabled = false;
    sfx.stopMotion();
    this.rig.setOrbit(true, s.h * RAD + 2.2);
    this.onFinish?.(this.rec.log, s);
  }

  private tmpV = new Vector3();

  /** Screen marker for the next mark: above it when visible, pinned to the edge when not. */
  private updateMarker(tgt: { x: number; y: number }, dist: number, s: BoatState): void {
    const phase = hud.phase.value;
    if (phase !== 'racing' && phase !== 'countdown') {
      if (hud.marker.value) hud.marker.value = null;
      return;
    }
    const cam = this.rig.camera;
    const v = this.tmpV.set(tgt.x, 4, -tgt.y).project(cam);
    let nx = v.x;
    let ny = v.y;
    const behind = v.z > 1;
    if (behind) {
      nx = -nx;
      ny = -ny;
    }
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    // Safe area: below the top bar, above the controls.
    const top = 1 - (2 * 150) / h;
    const bottom = -1 + (2 * 150) / h;
    const side = 1 - (2 * 34) / w;
    const inside = !behind && Math.abs(nx) <= side && ny <= top && ny >= bottom;
    let edge = false;
    if (!inside) {
      edge = true;
      const cy = (top + bottom) / 2;
      const dx = nx;
      const dy = ny - cy;
      const k = Math.min(Math.abs(dx) > 1e-6 ? side / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-6 ? (top - cy) / Math.abs(dy) : Infinity);
      nx = dx * k;
      ny = cy + dy * k;
    }
    const label = !s.started ? 'Mark 1' : s.leg < this.course.marks.length ? `Mark ${s.leg + 1}` : 'Finish';
    hud.marker.value = {
      x: ((nx + 1) / 2) * w,
      y: ((1 - ny) / 2) * h,
      edge,
      angle: edge ? Math.atan2(nx, ny - (top + bottom) / 2) : Math.PI,
      label,
      dist,
    };
  }

  private renderFrame(dt: number, idleTime?: number): void {
    this.time = idleTime ?? this.time + dt;
    const t = this.time;
    const a = Math.min(1, this.acc * TICK_HZ);
    const s = this.s;
    const lerpA = (p: number, c: number) => p + signedA(c - p) * a;
    const bx = (this.prev.x + (s.x - this.prev.x) * a) / UM_PER_M;
    const by = (this.prev.y + (s.y - this.prev.y) * a) / UM_PER_M;
    const bh = lerpA(this.prev.h, s.h) * RAD;
    const g = this.ghost;
    const gx = (this.ghostPrev.x + (g.x - this.ghostPrev.x) * a) / UM_PER_M;
    const gy = (this.ghostPrev.y + (g.y - this.ghostPrev.y) * a) / UM_PER_M;
    const gh = lerpA(this.ghostPrev.h, g.h) * RAD;

    const vm = vmax(this.course);
    const windFrom = s.windFrom * RAD;
    const speed01 = Math.max(0, s.v / vm);
    const twa = signedA(s.h - s.windFrom) * RAD;
    const luff = Math.abs(twa) < NO_GO * RAD ? 1 : Math.max(0, 1 - (Math.abs(twa) - NO_GO * RAD) / 0.12);

    // Boats
    this.boat.root.position.set(bx, 0, -by);
    this.boat.root.rotation.y = -bh;
    this.boat.pose({ twa, speed: speed01, power: Math.min(1, (s.wind / Q10) * speed01), luff, steer: this.input.value, time: t, heel: Math.min(0.2, 0.05 + 0.13 * speed01 * (s.wind / Q10)) * (1 - luff) });
    this.ghostBoat.root.position.set(gx, 0, -gy);
    this.ghostBoat.root.rotation.y = -gh;
    const gtwa = signedA(g.h - g.windFrom) * RAD;
    const gl = Math.abs(gtwa) < NO_GO * RAD ? 1 : 0;
    this.ghostBoat.pose({ twa: gtwa, speed: Math.max(0, g.v / vm), power: 0.8, luff: gl, steer: 0, time: t + 1.3, heel: 0.1 * (1 - gl) });
    const d = Math.hypot(gx - bx, gy - by);
    this.ghostBoat.setOpacity(Math.min(0.55, Math.max(0.12, (d - 4) / 18)));

    // Wakes sampled from the stern.
    this.wakeT += dt;
    if (this.wakeT > 0.07 && dt > 0) {
      this.wakeT = 0;
      this.wake.push(bx - Math.sin(bh) * 3.1, by - Math.cos(bh) * 3.1, bh, speed01, t);
      this.ghostWake.push(gx - Math.sin(gh) * 3.1, gy - Math.cos(gh) * 3.1, gh, Math.max(0, g.v / vm), t);
    }
    this.wake.update(t);
    this.ghostWake.update(t);

    // Water: puffs move.
    const puffs = this.course.puffs.map((p) => {
      const c = puffCentre(this.course, p, s.tick);
      return { x: c.x / UM_PER_M, y: c.y / UM_PER_M, r: p.r, k: p.k / 100 };
    });
    this.water.setPuffs(puffs);
    this.water.update(t);
    this.land.update(t);
    this.birds.update(t);
    this.marks.update(t);

    const warn = Math.max(0, 1 - (Math.abs(twa) - NO_GO * RAD) / 0.35);
    this.cone.update(bx, by, windFrom, Math.min(1, warn), t);
    this.cone.mesh.visible = hud.phase.value !== 'finished';
    this.water.setHaze(130 + this.rig.camera.position.y * 2.2);
    this.fog.near = 420 + this.rig.camera.position.y;
    this.fog.far = 1300 + this.rig.camera.position.y;

    // Camera
    const tgt = this.nextTarget(s);
    const aim = Math.atan2(tgt.x - bx, tgt.y - by);
    this.rig.update(Math.max(dt, 0.001), bx, by, bh, (Math.max(0, s.v) * TICK_HZ) / UM_PER_M, aim, t);
    if (hud.phase.value !== 'finished') this.updateHudFrame(tgt, aim, bx, by, windFrom, s);
    this.sky.update(t, this.rig.camera.position);
    this.renderer.render(this.scene, this.rig.camera);
  }

  private updateHudFrame(tgt: { x: number; y: number }, aim: number, bx: number, by: number, windFrom: number, s: BoatState): void {
    hud.legDist.value = Math.round(Math.hypot(tgt.x - bx, tgt.y - by));
    // Arrow relative to the camera's view direction.
    const camYaw = Math.atan2(this.rig.camera.position.x - bx, -this.rig.camera.position.z - by) + Math.PI;
    hud.legArrow.value = aim - camYaw;
    hud.windRel.value = windFrom - camYaw;
    hud.leg.value = !s.started ? 'Start' : s.leg < this.course.marks.length ? `Mark ${s.leg + 1}` : 'Finish';
    this.updateMarker(tgt, hud.legDist.value, s);
  }
}
