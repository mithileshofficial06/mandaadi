// HUD. NOTE: sections that read signals are plain functions called inside Hud (see CLAUDE.md):
// child components do not re-render on signal changes in this Preact/signals combination.
// Components without signals (CourseChart, Guide) are fine as children.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Course } from '../../shared/core/course';
import { sfx } from '../app/audio';
import { type Route, drawChart, sideOf } from './chart';
import { Guide } from './Guide';
import { Home } from './Home';
import { LevelIntro, LevelResult, SchoolList, nextLevel, totalStars } from './School';
import { SCHOOL, findLevel } from '../../shared/content/school';
import { MEDAL_NAME, type Medal } from '../../shared/core/par';

const MEDAL_ICON: Record<Medal, string> = { harbourmaster: '🥇', navigator: '🥈', deckhand: '🥉' };
const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;

/** Start card: today's board status, attempts and line honours. */
function DailyStatus(course: Course) {
  const d = hud.daily.value;
  if (!d) return null;
  const today = d.course.id === course.id;
  const left = Math.max(0, d.attempts.max - d.attempts.used);
  let line: string;
  if (!today) line = 'Practice course: not on the board.';
  else if (!d.live) line = "This race day has closed. Practise it, or find today's post.";
  else if (!d.user.loggedIn) line = 'Log in to Reddit to get on the board. You can still sail.';
  else if (left === 0) line = 'No attempts left today. Practise as much as you like.';
  else line = `${left} of ${d.attempts.max} attempts left today${d.attempts.max > 3 && !d.best ? ' (one bonus warm-up for your first race)' : ''}.`;
  return (
    <div class="daily">
      <p class="daily__line">{line}</p>
      <p class="daily__meta">
        {d.best ? (
          <span>
            Your best <b>{fmtTicks(d.best.ticks)}</b> · {ordinal(d.best.rank)} of {d.sailors} {MEDAL_ICON[d.best.medal]}
          </span>
        ) : d.top ? (
          <span>
            Line honours <b>u/{d.top.name}</b> {fmtTicks(d.top.ticks)} · {d.sailors} {d.sailors === 1 ? 'sailor' : 'sailors'}
          </span>
        ) : today && d.live ? (
          <span>No one has finished yet. Be first on the board.</span>
        ) : null}
        {today && d.par > 0 && <span> · Harbourmaster {fmtTicks(d.par)}</span>}
      </p>
    </div>
  );
}

const canRank = (course: Course) => {
  const d = hud.daily.value;
  return !!d && d.course.id === course.id && d.live && d.user.loggedIn && d.attempts.used < d.attempts.max;
};

/** Finish card: the server's verdict on this run. */
function Verdict() {
  const v = hud.verified.value;
  const r = hud.ranked.value;
  if (v === 'checking') return <p class="verdict">Checking your time with the harbour…</p>;
  if (v && 'error' in v) return <p class="verdict is-bad">{v.error}</p>;
  if (v) {
    return (
      <div class={`verdict verdict--${v.medal}`}>
        <span class="verdict__medal" aria-hidden="true">
          {MEDAL_ICON[v.medal]}
        </span>
        <span>
          <b>{MEDAL_NAME[v.medal]}</b> · {v.improved ? `${ordinal(v.best.rank)} of ${v.sailors} today` : `Your best stays ${fmtTicks(v.best.ticks)} (${ordinal(v.best.rank)})`}
          <small>{v.attempts.used >= v.attempts.max ? 'No attempts left today' : `${v.attempts.max - v.attempts.used} attempt${v.attempts.max - v.attempts.used === 1 ? '' : 's'} left`}</small>
        </span>
      </div>
    );
  }
  if (r.kind === 'practice') return <p class="verdict is-practice">Practice run{r.why ? ` · ${r.why}` : ''}</p>;
  return null;
}
import type { Livery } from '../three/boatModel';

const HULLS = ['#1f5fa8', '#1d7a5c', '#b8322a', '#e0a526', '#5b3f8f', '#2a2a2a'];
const BANDS = ['#c8372d', '#f1c232', '#1f3f78', '#f4f1ea', '#3aa6a0'];
import { type SailStatus, fmtTicks, hud } from './hudState';

const TYPE_LABEL: Record<string, string> = {
  light: 'Light Air',
  windward: 'Windward-Leeward',
  shifty: 'Shifty',
  tide: 'Tide Race',
  storm: 'Storm',
  community: 'Community Course',
  cup: 'The Cup',
};
const STRENGTH = ['Light breeze', 'Medium breeze', 'Strong breeze'];
const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
const STATUS: Record<SailStatus, string> = {
  irons: 'In the red cone: the sail is flapping',
  upwind: 'Upwind',
  reach: 'Reaching: fastest',
  downwind: 'Downwind',
  run: 'Dead downwind: slower',
};

const compassName = (a: number) => COMPASS[Math.round(((a % 4096) / 4096) * 8) % 8]!;

const CAM = { drive: 'Behind', chase: 'High', low: 'Low', top: 'Top' } as const;
type IconName = 'sound' | 'mute' | 'map' | 'boat' | 'help' | 'cam' | 'exit';
function Icon({ name }: { name: IconName }) {
  const p = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } as const;
  switch (name) {
    case 'exit':
      return (
        <svg {...p} aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      );
    case 'sound':
      return (
        <svg {...p} aria-hidden="true">
          <path d="M4 10v4h4l5 4V6L8 10H4z" />
          <path d="M16.5 8.5a5 5 0 0 1 0 7" />
          <path d="M19 6a8.5 8.5 0 0 1 0 12" />
        </svg>
      );
    case 'mute':
      return (
        <svg {...p} aria-hidden="true">
          <path d="M4 10v4h4l5 4V6L8 10H4z" />
          <path d="M17 9l5 6M22 9l-5 6" />
        </svg>
      );
    case 'map':
      return (
        <svg {...p} aria-hidden="true">
          <path d="M9 4L3 6.5v13.5L9 17.5l6 2.5 6-2.5V4L15 6.5 9 4z" />
          <path d="M9 4v13.5M15 6.5V20" />
        </svg>
      );
    case 'cam':
      return (
        <svg {...p} aria-hidden="true">
          <path d="M3 8h4l2-3h6l2 3h4v11H3z" />
          <circle cx="12" cy="13" r="3.5" />
        </svg>
      );
    case 'boat':
      return (
        <svg {...p} aria-hidden="true">
          <path d="M12 3v14M12 3l6 12h-6M5 18h14l-2 3H7z" />
        </svg>
      );
    default:
      return (
        <svg {...p} aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M9.6 9.2a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.6" />
          <path d="M12 17.2v.1" />
        </svg>
      );
  }
}

/** A sailing chart on a canvas. `example` animates a sample line; `routes` draw in once. */
function CourseChart(props: {
  course: Course;
  example?: boolean;
  routes?: Array<{ pts: Route; colour: string; width: number; dash?: number[] }>;
  /** Restart the draw-in only when this changes (routes arrays are rebuilt on every render). */
  animKey?: number;
  class?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const routes = useRef(props.routes);
  routes.current = props.routes;
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      const t = (now - t0) / 1000;
      if (props.example) {
        const p = reduced ? 1 : Math.min(1, (t % 6) / 4.5);
        drawChart(cv, props.course, { example: p });
      } else {
        const p = reduced ? 1 : Math.min(1, t / 1.8);
        drawChart(cv, props.course, { routes: (routes.current ?? []).map((r) => ({ ...r, progress: p })) });
        if (p >= 1) return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [props.course, props.example, props.animKey]);
  return <canvas ref={ref} class={props.class ?? 'chart'} aria-hidden="true" />;
}

/** The finish time counting up to its value (no signals: safe as a child component). */
function CountUp(props: { ticks: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setShown(props.ticks);
      return;
    }
    let raf = 0;
    const t0 = performance.now() + 450;
    const frame = (now: number) => {
      const k = Math.min(1, Math.max(0, (now - t0) / 1100));
      const e = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(props.ticks * e));
      if (k < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [props.ticks]);
  return <>{fmtTicks(shown)}</>;
}

export type HudProps = {
  course: Course;
  day: number;
  guide: 'closed' | 'intro' | 'paused';
  onStart: () => void;
  onTack: () => void;
  onMap: () => void;
  onCamera: () => void;
  onDaily: () => void;
  onHome: () => void;
  onSchool: () => void;
  onPickLevel: (id: string) => void;
  onNextLevel: (id: string) => void;
  onReplay: () => void;
  onPostcard: () => void;
  onShare: () => void;
  livery: Livery;
  onLivery: (l: Livery) => void;
  onAgain: () => void;
  onHelp: () => void;
  onCloseGuide: () => void;
  onRestart: () => void;
  /** Close the game and go back to the post (asks first during a race). */
  onExit: (e: MouseEvent) => void;
  onExitConfirm: (e: MouseEvent) => void;
  onExitCancel: () => void;
};

export function Hud(props: HudProps) {
  const phase = hud.phase.value;
  const { course } = props;
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (hud.penaltyFlash.value === 0) return;
    setFlash(true);
    const t = window.setTimeout(() => setFlash(false), 1400);
    return () => window.clearTimeout(t);
  }, [hud.penaltyFlash.value]);

  const toggleSound = () => {
    sfx.setMuted(!sfx.muted);
    hud.muted.value = sfx.muted;
  };

  if (phase === 'loading') return null;

  const guide =
    props.guide !== 'closed' ? (
      <Guide paused={props.guide === 'paused'} onClose={props.onCloseGuide} {...(props.guide === 'paused' ? { onRestart: props.onRestart } : {})} />
    ) : null;

  const tab = hud.tab.value;
  const lvl = tab === 'school-level' ? findLevel(course.id) : null;
  const tabs = (
    <div class="tabs" role="tablist">
      <button class="tab tab--home" onClick={props.onHome} aria-label="Home">
        ⌂
      </button>
      <button role="tab" aria-selected={tab === 'daily'} class={`tab ${tab === 'daily' ? 'is-on' : ''}`} onClick={props.onDaily}>
        Today's race
      </button>
      <button role="tab" aria-selected={tab === 'school-list' || tab === 'school-level'} class={`tab ${tab === 'school-list' || tab === 'school-level' ? 'is-on' : ''}`} onClick={props.onSchool}>
        Sailing School <small>{totalStars()} ★</small>
      </button>
    </div>
  );

  const cardExit = (
    <button class="cardexit" onClick={(e) => props.onExit(e as unknown as MouseEvent)} aria-label="Exit the game">
      <Icon name="exit" />
    </button>
  );
  const exitAsk = hud.exitAsk.value ? (
    <div class="exitask" role="dialog" aria-labelledby="exitask-title">
      <div class="exitask__card">
        <p id="exitask-title" class="exitask__title">
          Leave the race?
        </p>
        <p class="exitask__sub">{hud.ranked.value.kind === 'ranked' ? 'In the first 10 seconds your attempt is given back. After that it counts as used.' : 'Your progress on this run is lost.'}</p>
        <div class="startcard__row">
          <button class="btn btn--ghost btn--grow" onClick={props.onExitCancel}>
            Keep racing
          </button>
          <button class="btn btn--primary btn--grow" onClick={(e) => props.onExitConfirm(e as unknown as MouseEvent)}>
            Exit
          </button>
        </div>
      </div>
    </div>
  ) : null;

  if (phase === 'ready' && tab === 'home') {
    return (
      <div class="hud hud--ready hud--home">
        {Home({ onDaily: props.onDaily, onSchool: props.onSchool, onHelp: props.onHelp, onExit: props.onExit })}
        {guide}
      </div>
    );
  }

  if (phase === 'ready' && tab === 'school-list') {
    return (
      <div class="hud hud--ready">
        <section class="startcard startcard--school" aria-label="Sailing School">
          {cardExit}
          {tabs}
          <p class="startcard__hint">Six stages, five levels each. Beat the Harbourmaster for three stars. Open the next stage with 6 stars, or by finishing every level.</p>
          {SchoolList(props.onPickLevel)}
        </section>
        {guide}
      </div>
    );
  }

  if (phase === 'ready') {
    return (
      <div class="hud hud--ready">
        <section class="startcard" aria-labelledby="race-title">
          {cardExit}
          {tabs}
          <p class="startcard__day">
            {lvl ? (
              <>
                <button class="linkbtn" onClick={props.onSchool}>
                  ‹ School
                </button>{' '}
                Level {lvl.stage + 1}-{lvl.level + 1} · {SCHOOL[lvl.stage]!.name}
              </>
            ) : (
              <>
                Day {props.day} · {TYPE_LABEL[course.type] ?? 'Race'}
              </>
            )}
          </p>
          <h1 id="race-title" class="startcard__title">
            {course.name}
          </h1>
          <p class="startcard__wind">
            {STRENGTH[course.wind.strength]} from the {compassName(course.wind.from)}.{lvl ? '' : ' Everyone sails this course today.'}
          </p>
          {lvl ? LevelIntro(course.id) : <p class="startcard__hint">Round the marks in order, then race back through the line</p>}
          <div class="startcard__chart">
            <CourseChart course={course} example />
          </div>
          <button class="painttoggle" aria-expanded={hud.paintOpen.value} onClick={() => (hud.paintOpen.value = !hud.paintOpen.value)}>
            <span class="painttoggle__hull" style={{ background: props.livery.hull, borderColor: props.livery.band }} />
            🎨 Your boat · {props.livery.sailNo}
            <span aria-hidden="true">{hud.paintOpen.value ? '▴' : '▾'}</span>
          </button>
          {hud.paintOpen.value && (
          <div class="paint" aria-label="Paint your vallam">
            {HULLS.map((c) => (
              <button class={`sw ${props.livery.hull === c ? 'is-on' : ''}`} style={{ background: c }} aria-label={`Hull colour ${c}`} onClick={() => props.onLivery({ ...props.livery, hull: c })} />
            ))}
            <i />
            {BANDS.map((c) => (
              <button class={`sw sw--band ${props.livery.band === c ? 'is-on' : ''}`} style={{ background: c }} aria-label={`Rail colour ${c}`} onClick={() => props.onLivery({ ...props.livery, band: c })} />
            ))}
            <input
              class="sailno"
              inputMode="numeric"
              maxLength={3}
              aria-label="Sail number"
              value={props.livery.sailNo}
              onChange={(e) => {
                const v = (e.target as HTMLInputElement).value.replace(/[^0-9]/g, '').slice(0, 3);
                if (v) props.onLivery({ ...props.livery, sailNo: v });
              }}
            />
          </div>
          )}
          {!lvl && DailyStatus(course)}
          <div class="startcard__row">
            <button class="btn btn--ghost" onClick={props.onHelp}>
              How to sail
            </button>
            <button class="btn btn--primary btn--grow" onClick={props.onStart}>
              {lvl ? 'Start level' : canRank(course) || !hud.daily.value ? 'Start the race' : 'Start practice'}
            </button>
          </div>
        </section>
        {guide}
      </div>
    );
  }

  return (
    <div class={`hud ${hud.inCone.value ? 'is-cone' : ''} ${flash ? 'is-hit' : ''}`}>
      {TopBar(flash, toggleSound, props)}
      {phase !== 'finished' && Instruments()}
      {Marker()}
      {Messages(phase)}
      {phase !== 'finished' && Controls(props)}
      {phase === 'finished' && Finish(props)}
      {guide}
      {exitAsk}
    </div>
  );
}

function TopBar(flash: boolean, toggleSound: () => void, props: HudProps) {
  return (
    <header class="topbar">
      <div class={`clock ${flash ? 'is-penalty' : ''}`} aria-label="Race time">
        {hud.clock.value}
        {flash && <span class="clock__pen">+2.0</span>}
      </div>
      <div class="topbar__tools">
        {hud.phase.value !== 'finished' && (
          <button class="iconbtn" onClick={props.onHelp} aria-label="How to sail (pauses the race)">
            <Icon name="help" />
          </button>
        )}
        <button class="iconbtn" onClick={toggleSound} aria-label={hud.muted.value ? 'Sound on' : 'Sound off'}>
          <Icon name={hud.muted.value ? 'mute' : 'sound'} />
        </button>
        {hud.map.value ? (
          <button class="iconbtn is-on" onClick={props.onMap} aria-label="Back to the boat">
            <Icon name="boat" />
          </button>
        ) : (
          <button class="iconbtn iconbtn--cam" onClick={props.onCamera} aria-label={`Camera: ${CAM[hud.camMode.value]}. Tap to change.`}>
            <Icon name="cam" />
            <small>{CAM[hud.camMode.value]}</small>
          </button>
        )}
        <button class="iconbtn" onClick={(e) => props.onExit(e as unknown as MouseEvent)} aria-label="Exit the game">
          <Icon name="exit" />
        </button>
      </div>
    </header>
  );
}

function Instruments() {
  const st = hud.status.value;
  return (
    <div class="instruments">
      <div class="speedbox">
        <div class="speed">
          <b>{hud.speed.value.toFixed(1)}</b> kn
        </div>
        <div class={`status status--${st}`}>{STATUS[st]}</div>
        {hud.place.value && <div class="place">{hud.place.value}</div>}
        {hud.gust.value >= 6 && <div class="chip chip--gust">Gust +{hud.gust.value}% wind</div>}
        {hud.gust.value <= -6 && <div class="chip chip--lull">Lull {hud.gust.value}% wind</div>}
      </div>
      <div class="wind" aria-label="Wind direction">
        <svg width="46" height="46" viewBox="0 0 46 46" aria-hidden="true">
          <circle cx="23" cy="23" r="21" fill="rgba(10,30,40,0.6)" stroke="rgba(244,241,234,0.35)" />
          <g style={{ transform: `rotate(${hud.windRel.value}rad)`, transformOrigin: '23px 23px' }}>
            <path d="M23 6 v26" stroke="#f4f1ea" stroke-width="2.4" stroke-linecap="round" />
            <path d="M16 26 l7 9 l7 -9" fill="none" stroke="#f4f1ea" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
          </g>
        </svg>
        <span>Wind</span>
      </div>
    </div>
  );
}

function Marker() {
  const m = hud.marker.value;
  if (!m) return null;
  return (
    <div class={`marker ${m.edge ? 'is-edge' : ''}`} style={{ transform: `translate(${m.x}px, ${m.y}px)` }} aria-hidden="true">
      <div class="marker__tag">
        <span>{m.label}</span>
        <b>{m.dist} m</b>
      </div>
      <svg class="marker__arrow" width="18" height="18" viewBox="0 0 18 18" style={{ transform: `rotate(${m.angle}rad)` }}>
        <path d="M9 1l6 12-6-3.5L3 13z" fill="currentColor" />
      </svg>
    </div>
  );
}

function Messages(phase: string) {
  const t = hud.toast.value;
  return (
    <>
      {phase === 'countdown' && hud.countdown.value > 0 && (
        <div class="countdown" key={hud.countdown.value} aria-live="assertive">
          <span>{hud.countdown.value}</span>
          <small>Get ready</small>
        </div>
      )}
      {hud.go.value && (
        <div class="countdown countdown--go" aria-live="assertive">
          <span>Go</span>
        </div>
      )}
      {hud.replay.value && phase !== 'finished' && <div class="replaytag">Replay · 3x</div>}
      {hud.banner.value && (
        <div class="banner" role="alert">
          {hud.banner.value}
        </div>
      )}
      {t && phase !== 'finished' && (
        <div class={`toast toast--${t.kind}`} key={t.id} role="status">
          <b>{t.text}</b>
          {t.sub && <span>{t.sub}</span>}
        </div>
      )}
      {hud.prompt.value && phase !== 'finished' && (
        <div class="prompt" role="status">
          {hud.prompt.value}
        </div>
      )}
    </>
  );
}

function Controls(props: HudProps) {
  const down = hud.downwind.value;
  return (
    <div class="controls">
      <div class="rudder" aria-hidden="true">
        <div class="rudder__track" />
        <div class="rudder__knob" style={{ transform: `translateX(${hud.steer.value * 56}px)` }} />
        <span class="rudder__label">Drag to steer</span>
      </div>
      <button
        class={`tackbtn ${hud.inCone.value && hud.tackWindow.value === 0 ? 'is-hot' : ''} ${hud.tackWindow.value === 1 ? 'is-turning' : ''} ${hud.tackWindow.value === 2 ? 'is-now' : ''}`}
        onPointerDown={(e) => {
          e.stopPropagation();
          props.onTack();
        }}
        aria-label={down ? 'Gybe: turn the stern through the wind' : 'Tack: turn the bow through the wind'}
      >
        {hud.tackWindow.value === 2 ? 'Tap!' : down ? 'Gybe' : 'Tack'}
      </button>
      {hud.tackWindow.value > 0 && <span class="tackhint">Tap again as the bow crosses the wind</span>}
    </div>
  );
}

function Finish(props: HudProps) {
  const res = hud.result.value;
  if (!res) return null;
  const mine = sideOf(props.course, res.route);
  const theirs = sideOf(props.course, res.ghostRoute);
  const sideName = (s: number) => (s < 0 ? 'left' : s > 0 ? 'right' : 'up the middle');
  const board = hud.board.value;
  const v = hud.verified.value;
  const sh = hud.shared.value;
  const canShare = !!v && v !== 'checking' && !('error' in v);
  const d = hud.daily.value;
  const left = d ? d.attempts.max - d.attempts.used : 0;
  const lvl = hud.tab.value === 'school-level' ? findLevel(props.course.id) : null;
  const nxt = lvl ? nextLevel(props.course.id) : null;
  return (
    <div class="finish" role="dialog" aria-labelledby="finish-time">
      <p class="finish__label">{lvl ? `Level ${lvl.stage + 1}-${lvl.level + 1} · ${props.course.name}` : `Finished ${res.place} in the fleet`}</p>
      <p id="finish-time" class="finish__time" aria-label={fmtTicks(res.ticks)}>
        <CountUp ticks={res.ticks} />
      </p>
      {res.vsGhost !== null ? (
        <p class={`finish__vs ${res.vsGhost <= 0 ? 'is-win' : ''}`}>
          {res.vsGhost <= 0 ? `You beat the Harbourmaster by ${(Math.abs(res.vsGhost) / 30).toFixed(1)} s` : `${(res.vsGhost / 30).toFixed(1)} s behind the Harbourmaster`}
        </p>
      ) : (
        <p class="finish__vs is-win">You beat the Harbourmaster home</p>
      )}
      {lvl ? LevelResult(props.course.id, res.ticks) : Verdict()}
      <div class="finish__chart">
        <CourseChart
          course={props.course}
          animKey={res.ticks}
          routes={[
            { pts: res.ghostRoute, colour: 'rgba(244,241,234,0.85)', width: 2, dash: [5, 4] },
            { pts: res.route, colour: '#ff6b1a', width: 3 },
          ]}
        />
        <div class="finish__legend">
          <span class="lg lg--you">You went {sideName(mine)}</span>
          <span class="lg lg--hm">Harbourmaster went {sideName(theirs)}</span>
        </div>
      </div>
      {!lvl && board && board.rows.length > 0 ? (
        <ol class="fleet fleet--board" aria-label="Today's board">
          {board.rows.slice(0, 5).map((b) => (
            <li class={b.me ? 'is-me' : ''}>
              <span>{b.rank}</span>
              <b>
                {MEDAL_ICON[b.medal]} u/{b.name}
                {b.stars ? <small class="boardstars"> ⛵{b.stars}★</small> : null}
              </b>
              <em>{fmtTicks(b.ticks)}</em>
            </li>
          ))}
          {board.me && board.me.rank > 5 && (
            <li class="is-me">
              <span>{board.me.rank}</span>
              <b>
                {MEDAL_ICON[board.me.medal]} You
              </b>
              <em>{fmtTicks(board.me.ticks)}</em>
            </li>
          )}
        </ol>
      ) : (
      <ol class="fleet">
        {res.fleet.slice(0, 5).map((f, i) => (
          <li class={f.me ? 'is-me' : ''}>
            <span>{i + 1}</span>
            <b>{f.name}</b>
            <em>{f.ticks === null ? 'still sailing' : fmtTicks(f.ticks)}</em>
          </li>
        ))}
      </ol>
      )}
      <dl class="finish__stats">
        <div>
          <dt>Tacks</dt>
          <dd>{res.tacks}</dd>
        </div>
        <div>
          <dt>Top speed</dt>
          <dd>{res.topSpeed.toFixed(1)} kn</dd>
        </div>
        <div>
          <dt>Penalties</dt>
          <dd>{res.penalties ? `+${(res.penalties / 30).toFixed(1)} s` : 'None'}</dd>
        </div>
      </dl>
      <div class="startcard__row finish__row">
        <button class="btn btn--ghost btn--grow" onClick={props.onReplay}>
          Watch replay
        </button>
        <button class="btn btn--ghost btn--grow" onClick={props.onPostcard}>
          Save postcard
        </button>
      </div>
      {canShare && (
        <button class="btn btn--share btn--big" disabled={sh === 'sending' || sh === 'done'} onClick={props.onShare}>
          {sh === 'done' ? 'Shared to the comments ✓' : sh === 'sending' ? 'Sharing…' : 'Share my race to the comments'}
        </button>
      )}
      {typeof sh === 'object' && <p class="verdict is-bad">{sh.error}</p>}
      {lvl ? (
        <div class="startcard__row">
          <button class="btn btn--ghost" onClick={props.onSchool}>
            School
          </button>
          <button class={`btn ${nxt ? 'btn--ghost' : 'btn--primary'} btn--grow`} onClick={props.onAgain}>
            Retry
          </button>
          {nxt && (
            <button class="btn btn--primary btn--grow" onClick={() => props.onNextLevel(nxt)}>
              Next level ›
            </button>
          )}
        </div>
      ) : (
        <button class="btn btn--primary btn--big" onClick={props.onAgain}>
          {canRank(props.course) ? `Race again (${left} left)` : 'Practise again'}
          {mine !== 0 ? `: try the ${mine < 0 ? 'right' : 'left'}` : ''}
        </button>
      )}
    </div>
  );
}
