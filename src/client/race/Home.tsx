// Home screen: the first thing a player sees. The bay orbits behind it.
// A plain function called inside Hud (signals re-render Hud), not a child component.
import { SCHOOL, STAGE_GATE, stageOpen, stageStars } from '../../shared/content/school';
import { fmtTicks, hud } from './hudState';
import { totalStars } from './School';

const TYPE: Record<string, string> = { light: 'Light air', windward: 'Windward-leeward', shifty: 'Shifty breeze', tide: 'Tide race', storm: 'Storm', community: 'Triangle', cup: 'The Cup' };
const MEDAL_ICON = { harbourmaster: '🥇', navigator: '🥈', deckhand: '🥉' } as const;
const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;

/** Time left until the next race (00:00 UTC), e.g. "5 h 12 m". */
function untilNext(): string {
  const now = Date.now();
  const next = (Math.floor(now / 86_400_000) + 1) * 86_400_000;
  const m = Math.max(0, Math.floor((next - now) / 60_000));
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} m` : `${m} m`;
}

export type HomeProps = { onDaily: () => void; onSchool: () => void; onHelp: () => void; onExit: (e: MouseEvent) => void };

export function Home(p: HomeProps) {
  const d = hud.daily.value;
  const best = hud.school.value;
  const stars = totalStars();
  // the furthest open stage, for the School card
  let stage = 0;
  while (stage + 1 < SCHOOL.length && stageOpen(stage + 1, best)) stage++;
  const left = d ? Math.max(0, d.attempts.max - d.attempts.used) : 0;
  return (
    <div class="home" role="main" aria-label="Mandaadi home">
      <button class="cardexit home__exit" onClick={(e) => p.onExit(e as unknown as MouseEvent)} aria-label="Exit the game">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
      <header class="home__brand">
        <svg class="home__mark" viewBox="0 0 132 70" aria-hidden="true">
          <path d="M6 62 C 30 60, 44 46, 52 30 C 58 18, 62 10, 66 8 C 70 10, 74 18, 80 30 C 88 46, 102 58, 126 60" />
        </svg>
        <h1 class="home__name">MANDAADI</h1>
        <p class="home__tag">Same wind. Your line.</p>
      </header>

      <button class="homecard homecard--today" onClick={p.onDaily}>
        <span class="homecard__kicker">{d ? `Today · Day ${d.day} · ${TYPE[d.course.type] ?? 'Race'}` : "Today's race"}</span>
        <span class="homecard__title">{d ? d.course.name : 'Race the bay'}</span>
        <span class="homecard__line">
          {!d
            ? 'Sail today’s course'
            : d.best
              ? `Your best ${fmtTicks(d.best.ticks)} · ${ordinal(d.best.rank)} of ${d.sailors} ${MEDAL_ICON[d.best.medal]}`
              : d.top
                ? `Line honours u/${d.top.name} ${fmtTicks(d.top.ticks)} · ${d.sailors} ${d.sailors === 1 ? 'sailor' : 'sailors'}`
                : 'No one on the board yet. Be first.'}
        </span>
        <span class="homecard__cta">{!d || !d.user.loggedIn || !d.live ? 'Sail' : left > 0 ? `Race · ${left} ${left === 1 ? 'attempt' : 'attempts'} left` : 'Practise'} ›</span>
      </button>

      <button class="homecard homecard--school" onClick={p.onSchool}>
        <span class="homecard__kicker">Sailing School · 30 levels</span>
        <span class="homecard__title">
          {stars} <small>/ 90 ★</small>
        </span>
        <span class="homecard__line">
          Stage {stage + 1}: {SCHOOL[stage]!.name}
          {stage + 1 < SCHOOL.length ? ` · ${Math.max(0, STAGE_GATE - stageStars(stage, best))} ★ to open the next` : ''}
        </span>
        <span class="homecard__cta">Learn and earn stars ›</span>
      </button>

      <div class="home__row">
        <button class="btn btn--ghost btn--grow" onClick={p.onHelp}>
          How to sail
        </button>
      </div>
      <p class="home__foot">Next race in {untilNext()} · new course every day</p>
    </div>
  );
}
