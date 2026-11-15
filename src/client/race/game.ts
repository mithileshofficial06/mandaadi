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
import { ANG, deg, signedA } from '../../shared/core/trig';
import type { Wake } from '../three/effects';
import { puffCentre } from '../../shared/core/wind';
import { sfx } from '../app/audio';
import { SteerInput } from '../input/steer';
import { CameraRig } from '../three/cameraRig';
import { createCourseMarks } from '../three/courseMarks';
import { createCone, createWake, createWindRing, type WindRing } from '../three/effects';
import { createLand } from '../three/islands';
import { LIVERIES, createBoat, type BoatModel } from '../three/boatModel';
import { QualityScaler } from '../three/renderer';
import { createWater } from '../three/water';
import { type Sky, createSky } from '../three/sky';
import { type Birds, createBirds } from '../three/birds';
import { type Spray, createSpray } from '../three/spray';
import { landOf } from '../three/world';
import { fmtTicks, hud } from './hudState';
import { Minimap } from './minimap';
import { type Rain, WEATHER, createRain } from '../three/weather';
import { type Festival, createFestival } from '../three/festival';
import { type Shoals, createShoals } from '../three/shoals';

const RAD = (2 * Math.PI) / ANG;
/** Sun high and off to one side of the wind, so the glitter path crosses the view but never floods it. */
function sunFor(windFromRad: number, elDeg = 52, azOff = 1.25): Vector3 {
  const az = windFromRad + azOff;
  const el = (elDeg * Math.PI) / 180;
  return new Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az)).normalize();
}

type Snap = { x: number; y: number; h: number };
type Bot = { name: string; s: BoatState; prev: Snap; pilot: Pilot; model: BoatModel; wake: Wake };
/** Rival crews, named after fishing villages on the Ramanathapuram coast. They are bots, and say so. */
const VILLAGES = ['Pamban', 'Mandapam', 'Kilakarai', 'Thondi', 'Devipattinam', 'Erwadi', 'Valinokkam'];
const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;

const n2 = (a: number, b: number): [number, number] => [a / Math.hypot(a, b), b / Math.hypot(a, b)];
/** Must match the two swell waves in water.ts: direction (xz), wavelength, amplitude. */
const SWELL: Array<[number, number, number, number]> = [
  [...n2(0.86, 0.5), 38, 0.16],
  [...n2(0.7, 0.71), 23, 0.09],
];

/** Slope of the water shader's swell at a point, as pitch and roll for a boat heading h. */
function swellSlope(x: number, y: number, h: number, t: number): { pitch: number; roll: number } {
  let gx = 0;
  let gz = 0;
  for (const [dx, dz, L, A] of SWELL) {
    const k = (2 * Math.PI) / L;
    const c = Math.sqrt(9.81 / k);
    const s = A * k * Math.cos(k * (dx * x + dz * -y - c * t));
    gx += s * dx;
    gz += s * dz;
  }
  // forward in xz is (sin h, -cos h); right is (cos h, sin h)
  return { pitch: (gx * Math.sin(h) - gz * Math.cos(h)) * 1.4, roll: (gx * Math.cos(h) + gz * Math.sin(h)) * 1.4 };
}
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
  private rain: Rain | null = null;
  private shiftSide = 0;
  private birds: Birds;
  private ring: WindRing;
  private bots: Bot[] = [];
  private festival: Festival;
  private place = 0;
  private mini: Minimap | null = null;
  private shoals: Shoals | null = null;
  private runTime = 0;
  private runHinted = false;
  private spray: Spray;
  private sprayAcc = 0;
  private lastV = 0;
  private surge = 0;
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

    const wx = WEATHER[course.type];
    this.renderer.toneMappingExposure = wx.exposure;
    const sky = new Color(wx.skyHorizon);
    this.scene.background = sky;
    this.fog = new Fog(sky, 420, 1300);
    this.scene.fog = this.fog;
    const SUN = sunFor(course.wind.from * RAD, wx.sunEl, wx.sunAz);
    this.scene.add(new HemisphereLight(wx.hemiSky, wx.hemiGround, wx.hemiI));
    const sun = new DirectionalLight(wx.sun, wx.sunI);
    sun.position.copy(SUN).multiplyScalar(100);
    this.scene.add(sun);

    const windFromRad = course.wind.from * RAD;
    const windToRad = windFromRad + Math.PI;
    const land = landOf(course);
    this.water = createWater(land, windToRad, SUN, course.wind.strength);
    this.sky = createSky(SUN, wx.skyTop, wx.skyHorizon, wx.sun);
    this.water.material.uniforms.uSkyTop!.value = new Color(wx.skyTop);
    this.water.material.uniforms.uSkyHorizon!.value = new Color(wx.skyHorizon);
    if (wx.rain) {
      this.rain = createRain();
      this.scene.add(this.rain.lines);
    }
    this.scene.add(this.sky.mesh);
    const isl = course.islands.map((i) => i.parts[0]!).map((p) => ({ x: p.x, y: p.y }));
    this.birds = createBirds([...isl, { x: -100, y: 120 }, ...(course.marks[0] ? [course.marks[0]] : [])]);
    this.scene.add(this.birds.mesh);
    if (course.shoals?.length) {
      this.shoals = createShoals(course.shoals);
      this.scene.add(this.shoals.group);
    }
    this.festival = createFestival(course);
    this.scene.add(this.festival.group);
    this.spray = createSpray();
    this.scene.add(this.spray.points);
    this.scene.add(this.water.mesh);
    this.land = createLand(course, windToRad, SUN);
    this.scene.add(this.land.group);
    this.marks = createCourseMarks(course);
    this.scene.add(this.marks.group);
    this.cone = createCone(NO_GO * RAD);
    this.scene.add(this.cone.mesh);
    this.ring = createWindRing(NO_GO * RAD);
    this.scene.add(this.ring.mesh);
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
    {
      const ga = course.start.a;
      const gb = course.start.b;
      const len = Math.hypot(gb.x - ga.x, gb.y - ga.y) || 1;
      VILLAGES.forEach((name, i) => {
        const s = initialState(course);
        const off = (i % 2 ? 1 : -1) * (9 + Math.floor(i / 2) * 7);
        s.x += Math.round(((off * (gb.x - ga.x)) / len) * UM_PER_M);
        s.y += Math.round(((off * (gb.y - ga.y)) / len) * UM_PER_M);
        const pilot = new Pilot(course, { up: deg(46 + ((i * 3) % 9)), down: deg(144 + ((i * 5) % 12)), overstand: deg((i * 2) % 8), firstSide: i % 2 ? 1 : -1 });
        const model = createBoat({ ...LIVERIES[(i + 2) % LIVERIES.length]!, sailNo: String(11 + i * 13) });
        const wake = createWake({ life: 8, opacity: 0.6 });
        this.scene.add(model.root, wake.mesh);
        this.bots.push({ name, s, prev: { x: s.x, y: s.y, h: s.h }, pilot, model, wake });
      });
    }
    this.pilot = new Pilot(course, { up: Math.round((50 * ANG) / 360), down: Math.round((150 * ANG) / 360), overstand: 12, firstSide: -1 });

    if (new URLSearchParams(location.search).get('autopilot')) this.auto = new Pilot(course);
    this.input = new SteerInput(canvas);
    this.input.onFirstSteer = () => {
      if (this.promptStage === 1) this.setPrompt(null);
    };
    this.input.onPinch = (f) => this.rig.zoomBy(f);
    const mc = document.getElementById('minimap') as HTMLCanvasElement | null;
    if (mc) {
      this.mini = new Minimap(mc, course);
      mc.onclick = () => this.toggleMap();
    }
    try {
      const m = localStorage.getItem('mandaadi.cam');
      if (m === 'low' || m === 'top' || m === 'chase') this.rig.mode = m;
    } catch {
      /* ignore */
    }
    hud.camMode.value = this.rig.mode;

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

  cycleCamera(): void {
    const order = ['chase', 'low', 'top'] as const;
    this.rig.mode = order[(order.indexOf(this.rig.mode) + 1) % order.length]!;
    hud.camMode.value = this.rig.mode;
    try {
      localStorage.setItem('mandaadi.cam', this.rig.mode);
    } catch {
      /* ignore */
    }
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
    sfx.drums(3);
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
    const mm = document.getElementById('minimap');
    if (mm) mm.hidden = true;
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
      // keep the fleet sailing; results fill in as they finish
      this.stepGhost();
      const r = hud.result.value;
      if (r && this.ghost.tick % 15 === 0) {
        const fin = (b: BoatState) => (b.phase === 'finished' ? raceTicks(b) : null);
        const fleet = [{ name: 'You', ticks: r.ticks, me: true }, { name: 'Harbourmaster', ticks: fin(this.ghost) }, ...this.bots.map((b) => ({ name: b.name, ticks: fin(b.s) }))].sort((p, q) => (p.ticks ?? 1e9) - (q.ticks ?? 1e9));
        hud.result.value = { ...r, fleet, place: `${ordinal(fleet.findIndex((f) => f.me) + 1)} of ${fleet.length}` };
      }
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
    if (s.tick % 6 === 0 && s.tick > GUN_TICK) this.updatePlace(s);

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
    const f = this.course.finish;
    const toFinish = Math.hypot((f.a.x + f.b.x) / 2 - s.x / UM_PER_M, (f.a.y + f.b.y) / 2 - s.y / UM_PER_M);
    if (s.started && s.leg >= this.course.marks.length && !this.finishHinted && toFinish < 40) {
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
      hud.clock.value = fmtTicks(s.tick - GUN_TICK + s.penalty - s.bonus);
      hud.tackWindow.value = s.tackTo >= 0 && Math.abs(twa) < ANG / 4 ? (Math.abs(twa) <= 137 ? 2 : 1) : 0;
      if (hud.phase.value === 'countdown') hud.phase.value = 'racing';
    }

    // Coaching prompts, only at the moment they matter.
    if (this.opts.coach) {
      if (inCone && s.tick > GUN_TICK) this.coneTime += stepDt;
      else this.coneTime = Math.max(0, this.coneTime - stepDt);
      // Dead downwind is slow: say so once, the first time it happens.
      if (Math.abs(twa) > (165 * ANG) / 360 && s.started) this.runTime += stepDt;
      else this.runTime = 0;
      if (this.runTime > 1.2 && !this.runHinted) {
        this.runHinted = true;
        this.setPrompt('Straight downwind is slow (amber on the ring). Angle off into the green and gybe.', 4);
        window.setTimeout(() => {
          if (this.promptStage === 4) this.setPrompt(null);
        }, 5000);
      }
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
    if (this.course.wind.shiftAmp > 0 && s.started) {
      const off = signedA(s.windFrom - this.course.wind.from);
      const side = off > this.course.wind.shiftAmp * 0.6 ? 1 : off < -this.course.wind.shiftAmp * 0.6 ? -1 : 0;
      if (side !== 0 && side !== this.shiftSide) this.toast(`Wind shift: swinging ${side > 0 ? 'right' : 'left'}`, 'info', 'If you are pointing further from the mark now, tack', 2400);
      if (side !== 0) this.shiftSide = side;
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
    for (const b of this.bots) {
      b.prev.x = b.s.x;
      b.prev.y = b.s.y;
      b.prev.h = b.s.h;
      if (b.s.phase === 'prestart' || b.s.phase === 'racing') step(b.s, this.course, b.pilot.next(b.s));
    }
  }

  private handleEvents(s: BoatState): void {
    const e = s.ev;
    if (!e) return;
    if (e & EV.GUN) {
      sfx.gun();
      vibrate(60);
      hud.countdown.value = 0;
      hud.go.value = true;
      window.setTimeout(() => (hud.go.value = false), 900);
    }
    if (e & EV.TACK || e & EV.GYBE) {
      sfx.tack();
      vibrate(25);
      this.spray.emit(10, s.x / UM_PER_M, s.y / UM_PER_M, s.h * RAD, (s.v * TICK_HZ) / UM_PER_M, 0.8);
    }
    if (e & EV.ROUND) {
      sfx.bell();
      vibrate([30, 60, 30]);
      const more = s.leg < this.course.marks.length;
      this.toast(`Mark ${s.leg} rounded · ${fmtTicks(s.tick - GUN_TICK + s.penalty)}`, 'good', more ? `On to mark ${s.leg + 1}` : 'Now race back through the line', 3200);
      this.marks.setActive(s.leg, true);
      this.marks.setLaylines(this.opts.laylines, s.windFrom * RAD);
      this.marks.pulse(s.leg - 1);
    }
    if (e & EV.PERFECT) {
      this.toast('Perfect tack!', 'good', 'Rolled through the wind and kept your speed', 1800);
      sfx.bell();
      this.spray.emit(16, s.x / UM_PER_M, s.y / UM_PER_M, s.h * RAD, (s.v * TICK_HZ) / UM_PER_M, 1.1);
    }
    if (e & EV.EARLY_TAP) this.toast('Too early', 'info', 'Tap again just as the bow crosses the wind', 1600);
    if (e & EV.SHOAL) {
      this.toast('Net hauled: -1.0 s', 'good', 'Fish shoal caught', 2000);
      sfx.tack();
      this.shoals?.take(s.shoals);
      vibrate([20, 40, 20]);
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
      this.spray.emit(26, s.x / UM_PER_M, s.y / UM_PER_M, s.h * RAD, 2, 1.5);
    }
    if (e & EV.FINISH) this.finish(s);
  }

  private finishPlace(s: BoatState): string {
    const all = [this.ghost, ...this.bots.map((b) => b.s)];
    const ahead = all.filter((b) => b.phase === 'finished' && raceTicks(b) < raceTicks(s)).length;
    return `${ordinal(ahead + 1)} of ${all.length + 1}`;
  }

  private finish(s: BoatState): void {
    sfx.finish();
    sfx.cheer();
    sfx.drums(4);
    this.spray.emit(30, s.x / UM_PER_M, s.y / UM_PER_M, s.h * RAD, (s.v * TICK_HZ) / UM_PER_M, 1.3);
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
      place: this.finishPlace(s),
      fleet: [
        { name: 'You', ticks, me: true },
        { name: 'Harbourmaster', ticks: g.phase === 'finished' ? raceTicks(g) : null },
        ...this.bots.map((b) => ({ name: b.name, ticks: b.s.phase === 'finished' ? raceTicks(b.s) : null })),
      ].sort((p, q) => (p.ticks ?? 1e9) - (q.ticks ?? 1e9)),
    };
    hud.toast.value = null;
    hud.phase.value = 'finished';
    hud.prompt.value = null;
    hud.banner.value = null;
    this.input.enabled = false;
    sfx.stopMotion();
    const mm = document.getElementById('minimap');
    if (mm) mm.hidden = true;
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

    // Boats ride the same swell the water shader draws: pitch and roll from its slope.
    if (dt > 0) {
      const acc = (s.v - this.lastV) / Math.max(dt, 1e-3) / vm;
      this.lastV = s.v;
      this.surge += (Math.max(-2, Math.min(2, acc)) - this.surge) * Math.min(1, dt * 3);
    }
    const sw = swellSlope(bx, by, bh, t);
    this.boat.root.position.set(bx, 0, -by);
    this.boat.root.rotation.y = -bh;
    this.boat.pose({ twa, speed: speed01, power: Math.min(1, (s.wind / Q10) * speed01), luff, steer: this.input.value, time: t, heel: Math.min(0.2, 0.05 + 0.13 * speed01 * (s.wind / Q10)) * (1 - luff), pitch: sw.pitch + this.surge * 0.03, roll: sw.roll });
    // Spray from the bow when fast, more in gusts.
    this.sprayAcc += dt * (Math.max(0, speed01 - 0.72) * 55 + (s.wind > Q10 + 80 ? 6 : 0));
    while (this.sprayAcc > 1) {
      this.sprayAcc -= 1;
      this.spray.emit(1, bx, by, bh, (s.v * TICK_HZ) / UM_PER_M, 0.7);
    }
    this.spray.update(dt);
    this.ghostBoat.root.position.set(gx, 0, -gy);
    this.ghostBoat.root.rotation.y = -gh;
    const gtwa = signedA(g.h - g.windFrom) * RAD;
    const gl = Math.abs(gtwa) < NO_GO * RAD ? 1 : 0;
    const gs = swellSlope(gx, gy, gh, t);
    this.ghostBoat.pose({ twa: gtwa, speed: Math.max(0, g.v / vm), power: 0.8, luff: gl, steer: 0, time: t + 1.3, heel: 0.1 * (1 - gl), pitch: gs.pitch, roll: gs.roll });
    for (const bt of this.bots) {
      const q = bt.s;
      const qx = (bt.prev.x + (q.x - bt.prev.x) * a) / UM_PER_M;
      const qy = (bt.prev.y + (q.y - bt.prev.y) * a) / UM_PER_M;
      const qh = lerpA(bt.prev.h, q.h) * RAD;
      const qt = signedA(q.h - q.windFrom) * RAD;
      const ql = Math.abs(qt) < NO_GO * RAD ? 1 : 0;
      const qs = swellSlope(qx, qy, qh, t);
      bt.model.root.position.set(qx, 0, -qy);
      bt.model.root.rotation.y = -qh;
      // pose boats near the camera every frame, far ones every 4th frame
      const near = Math.hypot(qx - bx, qy - by) < 90;
      if (near || (Math.floor(t * 60) & 3) === 0) bt.model.pose({ twa: qt, speed: Math.max(0, q.v / vm), power: 0.8, luff: ql, steer: 0, time: t + qx * 0.1, heel: 0.11 * (1 - ql), pitch: qs.pitch, roll: qs.roll });
      if (this.wakeT === 0 && dt > 0) bt.wake.push(qx - Math.sin(qh) * 3.1, qy - Math.cos(qh) * 3.1, qh, Math.max(0, q.v / vm), t);
      bt.wake.update(t);
    }
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
    if (this.course.currents) this.water.setCurrents(this.course.currents.map((c) => ({ x: c.x, y: c.y, r: c.r, dir: c.dir * RAD, speed: c.speed / 10 })));
    this.water.update(t);
    this.land.update(t);
    this.birds.update(t);
    this.festival.update(t);
    this.shoals?.update(t);
    this.marks.update(t);

    const warn = Math.max(0, 1 - (Math.abs(twa) - NO_GO * RAD) / 0.35);
    this.cone.update(bx, by, windFrom, Math.min(1, warn), t);
    this.cone.mesh.visible = hud.phase.value !== 'finished';
    this.ring.update(bx, by, windFrom, twa);
    this.ring.mesh.visible = hud.phase.value !== 'finished';
    this.water.setHaze(130 + this.rig.camera.position.y * 2.2);
    this.fog.near = 420 + this.rig.camera.position.y;
    this.fog.far = 1300 + this.rig.camera.position.y;

    // Camera
    const tgt = this.nextTarget(s);
    const aim = Math.atan2(tgt.x - bx, tgt.y - by);
    this.rig.update(Math.max(dt, 0.001), bx, by, bh, (Math.max(0, s.v) * TICK_HZ) / UM_PER_M, aim, t);
    if (hud.phase.value !== 'finished') this.updateHudFrame(tgt, aim, bx, by, windFrom, s);
    this.sky.update(t, this.rig.camera.position);
    this.rain?.update(this.rig.camera.position, dt);
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
    const mc = this.mini;
    if (mc) {
      const racing = hud.phase.value === 'racing' || hud.phase.value === 'countdown';
      const el = document.getElementById('minimap');
      if (el) el.hidden = !racing;
      if (racing) {
        const camYaw2 = Math.atan2(bx - this.rig.camera.position.x, by + this.rig.camera.position.z);
        mc.draw(
          {
            x: bx,
            y: by,
            heading: s.h * RAD,
            speed: (Math.max(0, s.v) * TICK_HZ) / UM_PER_M,
            yaw: hud.map.value ? 0 : camYaw2,
            windFrom,
            noGo: NO_GO * RAD,
            target: tgt,
            nextMark: !s.started ? 0 : s.leg < this.course.marks.length ? s.leg : -1,
            trail: this.route.slice(-60),
            others: this.otherBoats(),
            shoals: (this.course.shoals ?? []).map((f, i) => ({ ...f, taken: (s.shoals & (1 << i)) !== 0 })),
            puffs: this.course.puffs.map((p) => {
              const c = puffCentre(this.course, p, s.tick);
              return { x: c.x / UM_PER_M, y: c.y / UM_PER_M, r: p.r, k: p.k / 100 };
            }),
          },
          performance.now()
        );
      }
    }
  }

  /** Race progress for ranking: finished boats first (by time), then leg, then distance to go. */
  private progress(b: BoatState): number {
    if (b.phase === 'finished') return 1e12 - raceTicks(b);
    const t = this.nextTarget(b);
    const d = Math.hypot(t.x - b.x / UM_PER_M, t.y - b.y / UM_PER_M);
    return (b.started ? b.leg + 1 : 0) * 1e6 - d;
  }

  private updatePlace(s: BoatState): void {
    const me = this.progress(s);
    const all = [this.ghost, ...this.bots.map((b) => b.s)];
    const place = 1 + all.filter((b) => this.progress(b) > me).length;
    if (this.place && place < this.place && s.phase === 'racing') {
      this.toast(`Up to ${ordinal(place)}!`, 'good', place === 1 ? 'You lead the fleet' : `of ${all.length + 1} boats`, 1500);
      sfx.gust();
    }
    this.place = place;
    hud.place.value = `${ordinal(place)} of ${all.length + 1}`;
  }

  /** Positions of the other boats on the water (course metres). */
  private otherBoats(): Array<{ x: number; y: number }> {
    return [this.ghost, ...this.bots.map((b) => b.s)].map((b) => ({ x: b.x / UM_PER_M, y: b.y / UM_PER_M }));
  }
}
