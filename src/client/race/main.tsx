import '../styles/tokens.css';
import '../styles/race.css';
import { render } from 'preact';
import { useState } from 'preact/hooks';
import { SANDBAR_SPRINT } from '../../shared/content/courses';
import { SCHOOL, courseById, dailyCourse } from '../../shared/content/school';
import type { Course } from '../../shared/core/course';
import { ApiFailure, api } from '../app/api';
import { exitExpandedMode, getWebViewMode } from '@devvit/web/client';
import { type InputLog, decodeInputs, encodeInputs } from '../../shared/core/inputs';
import { MEDAL_NAME } from '../../shared/core/par';
import { sfx } from '../app/audio';
import { Race, type Rival } from './game';
import { LIVERIES, type Livery } from '../three/boatModel';
import { Hud } from './Hud';
import { fmtTicks as fmt, hud } from './hudState';

type BootUi = { to(p: number): void; done(): void };
if (import.meta.env.DEV) (window as unknown as { __hud: typeof hud }).__hud = hud;
const bootUi = (): BootUi | undefined => (window as unknown as { __boot?: BootUi }).__boot;

const store = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string): void {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private mode */
    }
  },
};
const RACES_KEY = 'mandaadi.races';
const GUIDE_KEY = 'mandaadi.guideSeen';
const LIVERY_KEY = 'mandaadi.livery';
export function myLivery(): Livery {
  try {
    const v = JSON.parse(store.get(LIVERY_KEY) ?? 'null') as Livery | null;
    if (v && v.hull && v.band && v.sailNo) return { ...LIVERIES[0]!, ...v };
  } catch {
    /* ignore */
  }
  const server = hud.daily.value?.profile.livery;
  return server ? { ...LIVERIES[0]!, ...server } : LIVERIES[0]!;
}
// Local count, but never less than 1 once the server has seen you finish (storage resets per app version).
const racesDone = () => Math.max(Number(store.get(RACES_KEY) ?? '0') || 0, hud.daily.value?.profile.finishedEver ? 1 : 0);

let canvas = document.getElementById('sea') as HTMLCanvasElement;
const root = document.getElementById('app')!;
const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const params = new URLSearchParams(location.search);

let race: Race | null = null;
let course: Course = SANDBAR_SPRINT;
let day = 1;
let lastLog: InputLog | null = null;
/** The server's ticket for the race in progress (null = practice). */
let token: string | null = null;
let raceGen = 0;
let rivals: Rival[] = [];
/** The fastest redditor's run on the picked School level, sailed as a ghost. */
let schoolRivals: Rival[] = [];
const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
const errText = (e: unknown, fallback: string) => (e instanceof ApiFailure ? e.message : fallback);
const isToday = () => !!hud.daily.value && course.id === hud.daily.value.course.id;

async function loadRivals(): Promise<void> {
  try {
    const g = await api.ghosts();
    rivals = g.ghosts.flatMap((x) => {
      const log = decodeInputs(x.log);
      return log ? [{ name: x.name, log, livery: x.livery ? { ...LIVERIES[0]!, ...x.livery } : null }] : [];
    });
  } catch {
    rivals = [];
  }
}

const PRACTICE_WHY = { login: 'Log in to Reddit to get on the board', attempts: 'No attempts left today', 'old-day': 'This race day has closed', course: 'Practice course' } as const;

/** Ask the server for a race ticket: with one, the finish goes on the board. */
async function claim(): Promise<void> {
  const gen = raceGen;
  token = null;
  const d = hud.daily.value;
  if (!d) {
    hud.ranked.value = { kind: 'practice', why: 'Offline practice' };
    return;
  }
  if (!isToday()) {
    hud.ranked.value = { kind: 'practice', why: PRACTICE_WHY.course };
    return;
  }
  hud.ranked.value = { kind: 'pending' };
  try {
    const r = await api.start(d.date, d.course.id);
    if (gen !== raceGen) return;
    if (r.ranked) {
      token = r.token;
      hud.ranked.value = { kind: 'ranked' };
      hud.daily.value = { ...d, attempts: r.attempts };
    } else hud.ranked.value = { kind: 'practice', why: PRACTICE_WHY[r.reason] };
  } catch {
    if (gen === raceGen) hud.ranked.value = { kind: 'practice', why: 'Could not reach the harbour' };
  }
}

/** Send a finished run to the server, which re-sails it and returns the official result. */
const SCHOOL_KEY = 'mandaadi.school';
/** School best times: the server's (logged in) merged with this browser's (logged out or offline). */
async function loadSchool(): Promise<void> {
  let local: Record<string, number>;
  try {
    local = JSON.parse(store.get(SCHOOL_KEY) ?? '{}') as Record<string, number>;
  } catch {
    local = {};
  }
  let server: Record<string, number>;
  try {
    server = (await api.school()).best;
  } catch {
    server = {};
  }
  const merged = { ...local };
  for (const [id, t] of Object.entries(server)) if (!merged[id] || t < merged[id]!) merged[id] = t;
  hud.school.value = merged;
}

function keepSchoolLocal(id: string, ticks: number): void {
  const cur = hud.school.value[id];
  if (cur && cur <= ticks) return;
  hud.school.value = { ...hud.school.value, [id]: ticks };
  store.set(SCHOOL_KEY, JSON.stringify(hud.school.value));
}

/** A School level finished: stars locally at once, then the server re-sails it to save progress. */
async function submitSchool(id: string, log: InputLog, ticks: number): Promise<void> {
  keepSchoolLocal(id, ticks);
  if (!hud.daily.value?.user.loggedIn) {
    hud.schoolResult.value = null;
    return;
  }
  hud.schoolResult.value = 'checking';
  try {
    hud.schoolResult.value = await api.schoolFinish(id, encodeInputs(log), myLivery());
  } catch (e) {
    hud.schoolResult.value = { error: errText(e, 'Could not save this level. Your stars are kept on this device.') };
  }
}

async function loadLevelTop(id: string): Promise<void> {
  hud.levelTop.value = null;
  schoolRivals = [];
  try {
    const f = (await api.schoolLevel(id)).fastest;
    if (!f) return;
    hud.levelTop.value = { name: f.name, ticks: f.ticks };
    const log = decodeInputs(f.log);
    if (log) schoolRivals = [{ name: `u/${f.name}`, log, livery: f.livery ? { ...LIVERIES[0]!, ...f.livery } : null }];
  } catch {
    /* no ghost */
  }
}

async function submit(log: InputLog): Promise<void> {
  if (hud.tab.value === 'school-level') {
    const r = hud.result.value;
    if (r) await submitSchool(course.id, log, r.ticks);
    return;
  }
  const t = token;
  token = null;
  if (t) {
    hud.verified.value = 'checking';
    try {
      const r = await api.finish(t, encodeInputs(log), myLivery());
      hud.verified.value = r;
      const d = hud.daily.value;
      if (d) hud.daily.value = { ...d, attempts: r.attempts, best: r.best, sailors: r.sailors };
      void loadRivals();
    } catch (e) {
      hud.verified.value = { error: errText(e, 'Could not check your time with the harbour.') };
    }
  }
  if (isToday()) {
    try {
      hud.board.value = await api.board();
    } catch {
      /* the fleet list stays */
    }
  }
}

let replayLog: InputLog | null = null;

function newRace(): Race {
  if (race) {
    race.dispose();
    // A fresh canvas so the next renderer gets a clean WebGL context.
    const fresh = document.createElement('canvas');
    fresh.id = 'sea';
    fresh.setAttribute('aria-label', 'The race course');
    canvas.replaceWith(fresh);
    canvas = fresh;
  }
  const done = racesDone();
  raceGen++;
  token = null;
  const r = new Race(canvas, course, { coach: done < 2, laylines: done < 3, reducedMotion: reduced, livery: myLivery(), autopilot: !replayLog && !!hud.daily.value?.dev && store.get('mandaadi.autopilot') === '1', ...(replayLog ? { replay: replayLog } : params.get('autopilot') ? {} : hud.tab.value === 'school-level' ? (schoolRivals.length ? { rivals: schoolRivals } : {}) : isToday() && rivals.length ? { rivals } : {}) });
  r.setOnFinish((log) => {
    if (!replayLog) store.set(RACES_KEY, String(racesDone() + 1));
    lastLog = log.slice();
    if (!replayLog) void submit(log);
  });
  return r;
}

function resetHud(): void {
  hud.result.value = null;
  hud.map.value = false;
  hud.toast.value = null;
  hud.prompt.value = null;
  hud.banner.value = null;
  hud.marker.value = null;
  hud.paused.value = false;
  hud.replay.value = false;
  hud.verified.value = null;
  hud.board.value = null;
  hud.shared.value = 'idle';
  hud.schoolResult.value = null;
}

/** Close the game and go back to the post. An early exit from a ranked race gives the attempt back. */
function leave(e: MouseEvent): void {
  if (token) {
    void api.abandon(token).catch(() => undefined);
    token = null;
  }
  sfx.stopMotion();
  try {
    if (getWebViewMode() === 'expanded') exitExpandedMode(e);
    else history.back();
  } catch {
    history.back();
  }
}

/** Show a course on the start card (idle boat, orbit camera). */
let pick: (c: Course) => void = () => undefined;

function App() {
  // First visit: open the guide before the first race (skippable). The autopilot debug run skips it.
  const [, setTick] = useState(0);
  const [guide, setGuide] = useState<'closed' | 'intro' | 'paused'>(store.get(GUIDE_KEY) || hud.daily.value?.profile.finishedEver || params.get('autopilot') ? 'closed' : 'intro');
  pick = (c: Course) => {
    course = c;
    resetHud();
    race = newRace();
    race.idle();
    setTick((n) => n + 1);
  };
  const start = () => {
    sfx.unlock();
    store.set(GUIDE_KEY, '1');
    setGuide('closed');
    race?.go();
    if (hud.tab.value === 'daily') void claim();
    else hud.ranked.value = { kind: 'practice' };
  };
  return (
    <Hud
      course={course}
      day={day}
      guide={guide}
      onStart={start}
      onTack={() => race?.tack()}
      onMap={() => race?.toggleMap()}
      onCamera={() => race?.cycleCamera()}
      onReplay={() => {
        if (!lastLog) return;
        replayLog = lastLog;
        const keep = hud.result.value;
        resetHud();
        race = newRace();
        race.setOnFinish(() => (hud.result.value = keep));
        race.go();
        replayLog = null;
      }}
      onPostcard={() => {
        const r = hud.result.value;
        if (!race || !r) return;
        const url = race.postcard([`Day ${day} · ${course.name}`, fmt(r.ticks), placeLine(r.place)]);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mandaadi-${course.id}.jpg`;
        a.click();
      }}
      onShare={async () => {
        const r = hud.result.value;
        if (!race || !r || hud.shared.value === 'sending') return;
        hud.shared.value = 'sending';
        let img: string | null;
        try {
          img = race.postcard([`Day ${day} · ${course.name}`, fmt(r.ticks), placeLine(r.place)]);
        } catch {
          img = null;
        }
        try {
          await api.share(img);
          hud.shared.value = 'done';
        } catch (e) {
          hud.shared.value = { error: errText(e, 'Could not share your race.') };
        }
      }}
      onDaily={() => {
        const d = hud.daily.value;
        hud.tab.value = 'daily';
        pick(d ? d.course : dailyCourse(day));
      }}
      onSchool={() => {
        hud.tab.value = 'school-list';
        setTick((n) => n + 1);
      }}
      onPickLevel={async (id) => {
        const c = courseById(id);
        if (!c) return;
        await loadLevelTop(id);
        hud.tab.value = 'school-level';
        pick(c);
      }}
      onNextLevel={async (id) => {
        const c = courseById(id);
        if (!c) return;
        await loadLevelTop(id);
        hud.tab.value = 'school-level';
        course = c;
        resetHud();
        race = newRace();
        start();
      }}
      livery={myLivery()}
      onLivery={(l) => {
        store.set(LIVERY_KEY, JSON.stringify(l));
        void api.livery({ hull: l.hull, band: l.band, sailNo: l.sailNo }).catch(() => undefined);
        race = newRace();
        race.idle();
        setTick((n) => n + 1);
      }}
      onAgain={() => {
        replayLog = null;
        resetHud();
        race = newRace();
        start();
      }}
      onHelp={() => {
        if (race?.isRacing) {
          race.pause();
          setGuide('paused');
        } else setGuide('intro');
      }}
      onCloseGuide={() => {
        store.set(GUIDE_KEY, '1');
        if (guide === 'paused') race?.resume();
        setGuide('closed');
      }}
      onExit={(e) => {
        if (race?.isRacing) {
          race.pause();
          hud.exitAsk.value = true;
        } else leave(e);
      }}
      onExitCancel={() => {
        hud.exitAsk.value = false;
        race?.resume();
      }}
      onExitConfirm={(e) => {
        hud.exitAsk.value = false;
        leave(e);
      }}
      onRestart={() => {
        // A restart in the first seconds gives the attempt back.
        if (token) {
          const t = token;
          token = null;
          void api
            .abandon(t)
            .then((r) => {
              const d = hud.daily.value;
              if (d) hud.daily.value = { ...d, attempts: r.attempts };
            })
            .catch(() => undefined);
        }
        setGuide('closed');
        resetHud();
        race = newRace();
        start();
      }}
    />
  );
}

/** The postcard's place line: the verified board place when there is one. */
function placeLine(fleetPlace: string): string {
  const v = hud.verified.value;
  if (v && v !== 'checking' && !('error' in v)) return `${MEDAL_NAME[v.medal]} · ${ordinal(v.best.rank)} of ${v.sailors}`;
  return fleetPlace;
}

async function boot(): Promise<void> {
  bootUi()?.to(30);
  try {
    const [t] = await Promise.all([api.today(), loadRivals(), loadSchool()]);
    hud.daily.value = t;
    course = courseById(params.get('course') ?? '') ?? t.course;
    if (SCHOOL.some((st) => st.levels.some((l) => l.id === course.id))) hud.tab.value = 'school-level';
    day = t.day;
  } catch {
    // Offline or harness without a server: sail the built-in course.
  }
  bootUi()?.to(70);
  race = newRace();
  race.idle();
  render(<App />, root);
  bootUi()?.done();
}

void boot();
