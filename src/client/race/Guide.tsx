// "How to sail": three short cards with animated diagrams. Opens on the first visit and from the
// help button (which pauses the race). Plain SVG + CSS/SMIL animation, no images.
import { useState } from 'preact/hooks';

/** animateMotion's path attribute (missing from Preact's SVG types). */
const motionPath = (d: string) => ({ path: d }) as Record<string, string>;

const BOAT = 'M-13 0 C -7 -5, 6 -5, 14 0 C 6 5, -7 5, -13 0 Z';

function SteerArt() {
  return (
    <svg viewBox="0 0 300 190" class="gart" aria-hidden="true">
      <defs>
        <radialGradient id="gw1" cx="50%" cy="40%" r="70%">
          <stop offset="0" stop-color="#127a8e" />
          <stop offset="1" stop-color="#0b4562" />
        </radialGradient>
      </defs>
      <rect width="300" height="190" rx="14" fill="url(#gw1)" />
      <g class="g1-trail">
        <path d="M150 150 C 150 120, 150 100, 150 80" stroke="rgba(244,241,234,0.35)" stroke-width="3" fill="none" stroke-dasharray="4 5" />
      </g>
      <g transform="translate(150 78)">
        <g class="g1-boat">
          <g transform="rotate(-90)">
            <path d={BOAT} fill="#1f5fa8" stroke="#c8372d" stroke-width="2.4" />
            <path d="M2 0 L -10 9" stroke="#efe5cf" stroke-width="4" stroke-linecap="round" />
          </g>
        </g>
      </g>
      <g class="g1-finger">
        <circle cx="150" cy="152" r="15" fill="rgba(244,241,234,0.92)" />
        <circle cx="150" cy="152" r="24" fill="none" stroke="rgba(244,241,234,0.4)" stroke-width="2" />
      </g>
      <text x="40" y="158" class="gart__lbl">LEFT</text>
      <text x="260" y="158" class="gart__lbl" text-anchor="end">
        RIGHT
      </text>
    </svg>
  );
}

function WindArt() {
  const zig = 'M150 176 L 104 128 L 186 78 L 152 42';
  return (
    <svg viewBox="0 0 300 190" class="gart" aria-hidden="true">
      <rect width="300" height="190" rx="14" fill="#0e5873" />
      {[70, 150, 230].map((x) => (
        <g class="g2-wind" style={{ animationDelay: `${x / 300}s` }}>
          <path d={`M${x} 6 v18 m-6 -7 l6 8 l6 -8`} stroke="#f4f1ea" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round" />
        </g>
      ))}
      <text x="150" y="20" class="gart__lbl" text-anchor="middle" dy="-4" opacity="0">
        WIND
      </text>
      {/* the cone, from the boat's start position */}
      <path d="M150 176 L 98 114 A 80 80 0 0 1 202 114 Z" fill="rgba(229,72,77,0.28)" stroke="rgba(229,72,77,0.9)" stroke-width="1.5" />
      <circle cx="152" cy="36" r="7" fill="#ff6b1a" stroke="#fff" stroke-width="1.5" />
      <path d={zig} stroke="#ff6b1a" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round" class="g2-path" />
      <g>
        <path d={BOAT} fill="#1f5fa8" stroke="#c8372d" stroke-width="2" />
        <animateMotion dur="5s" repeatCount="indefinite" rotate="auto" keyPoints="0;0;1;1" keyTimes="0;0.1;0.85;1" calcMode="linear" {...motionPath(zig)} />
      </g>
      <text x="168" y="150" class="gart__lbl gart__lbl--red">
        NO GO
      </text>
    </svg>
  );
}

function MarkArt() {
  const route = 'M160 176 L 172 66 C 176 34, 134 26, 130 52 L 140 176';
  return (
    <svg viewBox="0 0 300 190" class="gart" aria-hidden="true">
      <rect width="300" height="190" rx="14" fill="#0e5873" />
      <circle cx="232" cy="110" r="36" fill="rgba(3,22,34,0.45)" />
      {[0, 1, 2].map((i) => (
        <path d={`M${212 + i * 6} ${96 + i * 10} q 8 -4 16 0 q 8 4 16 0`} stroke="rgba(190,240,247,0.6)" stroke-width="1.5" fill="none" />
      ))}
      <text x="232" y="160" class="gart__lbl" text-anchor="middle">
        GUST
      </text>
      <path d="M110 176 L 190 176" stroke="#f4f1ea" stroke-width="2.5" stroke-dasharray="6 5" />
      <circle cx="110" cy="176" r="3.5" fill="#f2c230" />
      <circle cx="190" cy="176" r="3.5" fill="#f2c230" />
      <path d="M163 44 A 15 15 0 1 0 140 58" stroke="rgba(255,255,255,0.85)" stroke-width="2" fill="none" />
      <path d="M136 52 l 4 7 l 5 -6" stroke="rgba(255,255,255,0.85)" stroke-width="2" fill="none" />
      <circle cx="150" cy="50" r="7" fill="#ff6b1a" stroke="#fff" stroke-width="1.5" />
      <path d={route} stroke="#ff6b1a" stroke-width="3" fill="none" stroke-linecap="round" class="g3-path" />
      <g>
        <path d={BOAT} fill="#1f5fa8" stroke="#c8372d" stroke-width="2" />
        <animateMotion dur="5.5s" repeatCount="indefinite" rotate="auto" {...motionPath(route)} />
      </g>
      <text x="64" y="182" class="gart__lbl" text-anchor="middle">
        FINISH
      </text>
    </svg>
  );
}

const STEPS = [
  {
    title: 'Steer with one thumb',
    art: SteerArt,
    text: (
      <>
        Drag <b>left or right</b> anywhere on the water. Let go and the boat sails straight.
      </>
    ),
  },
  {
    title: "You can't sail into the wind",
    art: WindArt,
    text: (
      <>
        Point into the <b class="red">red cone</b> and the sail flaps and the boat stops. Sail at an angle, then tap <b>Tack</b> to turn through the
        wind. Zigzag up to the mark.
      </>
    ),
  },
  {
    title: 'Round the mark, race home',
    art: MarkArt,
    text: (
      <>
        Go around the <b class="orange">orange mark</b> the way its arrow points, then race back through the line. <b>Dark, rippled water</b> is a gust: more
        wind, more speed.
      </>
    ),
  },
];

export function Guide(props: { onClose: () => void; onRestart?: () => void; paused?: boolean }) {
  const [i, setI] = useState(0);
  const step = STEPS[i]!;
  const last = i === STEPS.length - 1;
  const Art = step.art;
  return (
    <div class="guide" role="dialog" aria-modal="true" aria-labelledby="guide-title">
      <div class="guide__card">
        <p class="guide__kicker">{props.paused ? 'Paused · How to sail' : 'How to sail'}</p>
        <div class="guide__art" key={i}>
          <Art />
        </div>
        <h2 id="guide-title" class="guide__title">
          {step.title}
        </h2>
        <p class="guide__text">{step.text}</p>
        <div class="guide__dots" aria-hidden="true">
          {STEPS.map((_, k) => (
            <span class={k === i ? 'is-on' : ''} />
          ))}
        </div>
        <div class="guide__row">
          {i > 0 ? (
            <button class="btn btn--ghost" onClick={() => setI(i - 1)}>
              Back
            </button>
          ) : props.onRestart ? (
            <button class="btn btn--ghost" onClick={props.onRestart}>
              Restart race
            </button>
          ) : (
            <button class="btn btn--ghost" onClick={props.onClose}>
              Skip
            </button>
          )}
          <button class="btn btn--primary" onClick={() => (last ? props.onClose() : setI(i + 1))}>
            {last ? (props.paused ? 'Back to the race' : 'Got it') : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
