import '../styles/tokens.css';
import '../styles/race.css';
import { render } from 'preact';
import { SANDBAR_SPRINT } from '../../shared/content/courses';
import type { Course } from '../../shared/core/course';
import { api } from '../app/api';
import { sfx } from '../app/audio';
import { Race } from './game';
import { Hud } from './Hud';
import { hud } from './hudState';

type BootUi = { to(p: number): void; done(): void };
const bootUi = (): BootUi | undefined => (window as unknown as { __boot?: BootUi }).__boot;

const RACES_KEY = 'mandaadi.races';
function racesDone(): number {
  try {
    return Number(localStorage.getItem(RACES_KEY) ?? '0') || 0;
  } catch {
    return 0;
  }
}
function addRace(): void {
  try {
    localStorage.setItem(RACES_KEY, String(racesDone() + 1));
  } catch {
    /* private mode */
  }
}

let canvas = document.getElementById('sea') as HTMLCanvasElement;
const root = document.getElementById('app')!;
const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

let race: Race | null = null;
let course: Course = SANDBAR_SPRINT;
let day = 1;

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
  const r = new Race(canvas, course, { coach: done < 2, laylines: done < 3, reducedMotion: reduced });
  r.setOnFinish(() => addRace());
  return r;
}

function start(): void {
  sfx.unlock();
  race?.go();
}

function again(): void {
  hud.result.value = null;
  hud.map.value = false;
  race = newRace();
  start();
}

function App() {
  return (
    <Hud
      course={course}
      day={day}
      onStart={start}
      onTack={() => race?.tack()}
      onMap={() => race?.toggleMap()}
      onAgain={again}
    />
  );
}

async function boot(): Promise<void> {
  bootUi()?.to(30);
  try {
    const t = await api.today();
    course = t.course;
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
