import { useEffect, useState } from 'preact/hooks';
import { sfx } from '../app/audio';
import type { Course } from '../../shared/core/course';
import { fmtTicks, hud } from './hudState';

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
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

function compassName(angleUnits: number): string {
  return COMPASS[Math.round(((angleUnits % 4096) / 4096) * 8) % 8]!;
}

function Icon({ name }: { name: 'sound' | 'mute' | 'map' | 'boat' }) {
  const p = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } as const;
  if (name === 'sound')
    return (
      <svg {...p} aria-hidden="true">
        <path d="M4 10v4h4l5 4V6L8 10H4z" />
        <path d="M16.5 8.5a5 5 0 0 1 0 7" />
        <path d="M19 6a8.5 8.5 0 0 1 0 12" />
      </svg>
    );
  if (name === 'mute')
    return (
      <svg {...p} aria-hidden="true">
        <path d="M4 10v4h4l5 4V6L8 10H4z" />
        <path d="M17 9l5 6M22 9l-5 6" />
      </svg>
    );
  if (name === 'map')
    return (
      <svg {...p} aria-hidden="true">
        <path d="M9 4L3 6.5v13.5L9 17.5l6 2.5 6-2.5V4L15 6.5 9 4z" />
        <path d="M9 4v13.5M15 6.5V20" />
      </svg>
    );
  return (
    <svg {...p} aria-hidden="true">
      <path d="M12 3v14M12 3l6 12h-6M5 18h14l-2 3H7z" />
    </svg>
  );
}

export function Hud(props: {
  course: Course;
  day: number;
  onStart: () => void;
  onTack: () => void;
  onMap: () => void;
  onAgain: () => void;
}) {
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
            {STRENGTH[course.wind.strength]} from the {compassName(course.wind.from)}
          </p>
          <ol class="startcard__how">
            <li>
              <b>Drag</b> left or right on the water to steer.
            </li>
            <li>
              You can't sail into the <b class="red">red cone</b>. Zigzag, and tap <b>Tack</b> to turn through the wind.
            </li>
            <li>
              Round the orange mark the way the arrow shows, then race back through the line.
            </li>
          </ol>
          <button class="btn btn--primary btn--big" onClick={props.onStart}>
            Start the race
          </button>
        </section>
      </div>
    );
  }

  const res = hud.result.value;
  const twaDown = hud.downwind.value;
  return (
    <div class={`hud ${hud.inCone.value ? 'is-cone' : ''}`}>
      <header class="topbar">
        <div class={`clock ${flash ? 'is-penalty' : ''}`} aria-label="Race time">
          {hud.clock.value}
          {flash && <span class="clock__pen">+2.0</span>}
        </div>
        <div class="legpill" aria-label={`${hud.leg.value}, ${hud.legDist.value} metres`}>
          <span class="legpill__arrow" style={{ transform: `rotate(${hud.legArrow.value}rad)` }} aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 16 16">
              <path d="M8 1l5 12-5-3-5 3z" fill="currentColor" />
            </svg>
          </span>
          <span>{hud.leg.value}</span>
          <span class="legpill__dist">{hud.legDist.value} m</span>
        </div>
        <div class="topbar__tools">
          <button class="iconbtn" onClick={toggleSound} aria-label={hud.muted.value ? 'Sound on' : 'Sound off'}>
            <Icon name={hud.muted.value ? 'mute' : 'sound'} />
          </button>
          <button class={`iconbtn ${hud.map.value ? 'is-on' : ''}`} onClick={props.onMap} aria-label={hud.map.value ? 'Back to the boat' : 'Show the whole course'}>
            <Icon name={hud.map.value ? 'boat' : 'map'} />
          </button>
        </div>
      </header>

      <div class="instruments">
        <div class="speed">
          <b>{hud.speed.value.toFixed(1)}</b> kn
        </div>
        <div class="wind" aria-label="Wind direction">
          <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
            <circle cx="22" cy="22" r="20" fill="rgba(10,30,40,0.55)" stroke="rgba(244,241,234,0.35)" />
            <g style={{ transform: `rotate(${hud.windRel.value}rad)`, transformOrigin: '22px 22px' }}>
              <path d="M22 5 v26" stroke="#f4f1ea" stroke-width="2.4" stroke-linecap="round" />
              <path d="M15 25 l7 9 l7 -9" fill="none" stroke="#f4f1ea" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
            </g>
          </svg>
          <span>Wind</span>
        </div>
        {hud.gust.value >= 6 && <div class="chip chip--gust">Gust +{hud.gust.value}%</div>}
        {hud.gust.value <= -6 && <div class="chip chip--lull">Lull {hud.gust.value}%</div>}
      </div>

      {phase === 'countdown' && hud.countdown.value > 0 && (
        <div class="countdown" key={hud.countdown.value} aria-live="assertive">
          {hud.countdown.value}
        </div>
      )}
      {hud.banner.value && (
        <div class="banner" role="alert">
          {hud.banner.value}
        </div>
      )}
      {hud.prompt.value && phase !== 'finished' && (
        <div class="prompt" role="status">
          {hud.prompt.value}
        </div>
      )}

      {phase !== 'finished' && (
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
            aria-label={twaDown ? "Gybe: turn the stern through the wind" : "Tack: turn through the wind"}
          >
            {twaDown ? 'Gybe' : 'Tack'}
          </button>
        </div>
      )}

      {phase === 'finished' && res && (
        <div class="finish" role="dialog" aria-labelledby="finish-time">
          <p class="finish__label">Finished</p>
          <p id="finish-time" class="finish__time">
            {fmtTicks(res.ticks)}
          </p>
          {res.vsGhost !== null && (
            <p class={`finish__vs ${res.vsGhost <= 0 ? 'is-win' : ''}`}>
              {res.vsGhost <= 0 ? `Beat the Harbourmaster by ${(Math.abs(res.vsGhost) / 30).toFixed(1)} s` : `${(res.vsGhost / 30).toFixed(1)} s behind the Harbourmaster`}
            </p>
          )}
          <dl class="finish__stats">
            <div>
              <dt>Tacks</dt>
              <dd>{res.tacks}</dd>
            </div>
            <div>
              <dt>Penalties</dt>
              <dd>{res.penalties ? `+${(res.penalties / 30).toFixed(1)} s` : 'None'}</dd>
            </div>
          </dl>
          <button class="btn btn--primary btn--big" onClick={props.onAgain}>
            Race again
          </button>
        </div>
      )}
    </div>
  );
}
