// HUD. NOTE: sections that read signals are plain functions called inside Hud (see CLAUDE.md):
// child components do not re-render on signal changes in this Preact/signals combination.
// Components without signals (CourseChart, Guide) are fine as children.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Course } from '../../shared/core/course';
import { sfx } from '../app/audio';
import { type Route, drawChart, sideOf } from './chart';
import { Guide } from './Guide';
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

const CAM = { chase: 'Chase', low: 'Low', top: 'Top' } as const;
type IconName = 'sound' | 'mute' | 'map' | 'boat' | 'help' | 'cam';
function Icon({ name }: { name: IconName }) {
  const p = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } as const;
  switch (name) {
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
  onAgain: () => void;
  onHelp: () => void;
  onCloseGuide: () => void;
  onRestart: () => void;
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

  if (phase === 'ready') {
    return (
      <div class="hud hud--ready">
        <section class="startcard" aria-labelledby="race-title">
          <p class="startcard__day">
            Day {props.day} · {TYPE_LABEL[course.type] ?? 'Race'}
          </p>
          <h1 id="race-title" class="startcard__title">
            {course.name}
          </h1>
          <p class="startcard__wind">
            {STRENGTH[course.wind.strength]} from the {compassName(course.wind.from)}. Everyone sails this course today.
          </p>
          <p class="startcard__hint">Zigzag up to the mark, round it, race back through the line</p>
          <div class="startcard__chart">
            <CourseChart course={course} example />
          </div>
          <div class="startcard__row">
            <button class="btn btn--ghost" onClick={props.onHelp}>
              How to sail
            </button>
            <button class="btn btn--primary btn--grow" onClick={props.onStart}>
              Start the race
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
        class={`tackbtn ${hud.inCone.value ? 'is-hot' : ''}`}
        onPointerDown={(e) => {
          e.stopPropagation();
          props.onTack();
        }}
        aria-label={down ? 'Gybe: turn the stern through the wind' : 'Tack: turn the bow through the wind'}
      >
        {down ? 'Gybe' : 'Tack'}
      </button>
    </div>
  );
}

function Finish(props: HudProps) {
  const res = hud.result.value;
  if (!res) return null;
  const mine = sideOf(props.course, res.route);
  const theirs = sideOf(props.course, res.ghostRoute);
  const sideName = (s: number) => (s < 0 ? 'left' : s > 0 ? 'right' : 'up the middle');
  return (
    <div class="finish" role="dialog" aria-labelledby="finish-time">
      <p class="finish__label">Finished</p>
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
      <button class="btn btn--primary btn--big" onClick={props.onAgain}>
        Race again{mine !== 0 ? `: try the ${mine < 0 ? 'right' : 'left'}` : ''}
      </button>
    </div>
  );
}
