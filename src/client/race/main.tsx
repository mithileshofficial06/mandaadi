import '../styles/tokens.css';
import '../styles/race.css';
import { render } from 'preact';
import { useState } from 'preact/hooks';
import { COURSES, SANDBAR_SPRINT } from '../../shared/content/courses';
import type { Course } from '../../shared/core/course';
import { api } from '../app/api';
import { sfx } from '../app/audio';
import { Race } from './game';
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
  return LIVERIES[0]!;
}
const racesDone = () => Number(store.get(RACES_KEY) ?? '0') || 0;

let canvas = document.getElementById('sea') as HTMLCanvasElement;
const root = document.getElementById('app')!;
const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const params = new URLSearchParams(location.search);

let race: Race | null = null;
let course: Course = SANDBAR_SPRINT;
let day = 1;
let lastLog: import('../../shared/core/inputs').InputLog | null = null;

let replayLog: import('../../shared/core/inputs').InputLog | null = null;

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
  const r = new Race(canvas, course, { coach: done < 2, laylines: done < 3, reducedMotion: reduced, livery: myLivery(), ...(replayLog ? { replay: replayLog } : {}) });
  r.setOnFinish((log) => {
    if (!replayLog) store.set(RACES_KEY, String(racesDone() + 1));
    lastLog = log.slice();
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
}

function App() {
  // First visit: open the guide before the first race (skippable). The autopilot debug run skips it.
  const [, setTick] = useState(0);
  const [guide, setGuide] = useState<'closed' | 'intro' | 'paused'>(store.get(GUIDE_KEY) || params.get('autopilot') ? 'closed' : 'intro');
  const start = () => {
    sfx.unlock();
    store.set(GUIDE_KEY, '1');
    setGuide('closed');
    race?.go();
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
        const url = race.postcard([`Day ${day} · ${course.name}`, fmt(r.ticks), r.place]);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mandaadi-${course.id}.jpg`;
        a.click();
      }}
      courses={COURSES}
      livery={myLivery()}
      onLivery={(l) => {
        store.set(LIVERY_KEY, JSON.stringify(l));
        race = newRace();
        race.idle();
        setTick((n) => n + 1);
      }}
      onPick={(id) => {
        const c = COURSES.find((k) => k.id === id);
        if (!c) return;
        course = c;
        resetHud();
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
      onRestart={() => {
        setGuide('closed');
        resetHud();
        race = newRace();
        start();
      }}
    />
  );
}

async function boot(): Promise<void> {
  bootUi()?.to(30);
  try {
    const t = await api.today();
    course = COURSES.find((c) => c.id === params.get('course')) ?? t.course;
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
