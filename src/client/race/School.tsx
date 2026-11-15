// Sailing School screens: the stage list, a level's start header and its finish result.
// Plain functions called inside Hud (signals re-render Hud), not child components.
import { PARS, SCHOOL, STAGE_GATE, findLevel, levelOpen, stageOpen, stageStars, starsFor } from '../../shared/content/school';
import { fmtTicks, hud } from './hudState';

const starStr = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n);

export function totalStars(): number {
  return SCHOOL.reduce((n, _, s) => n + stageStars(s, hud.school.value), 0);
}

export function SchoolList(onPick: (id: string) => void) {
  const best = hud.school.value;
  return (
    <div class="school" aria-label="Sailing School">
      {SCHOOL.map((st, s) => {
        const open = stageOpen(s, best);
        const got = stageStars(s, best);
        return (
          <section class={`stage ${open ? '' : 'is-locked'}`}>
            <header class="stage__head">
              <b>
                {s + 1}. {st.name}
              </b>
              <span>{open ? `${got} / 15 ★` : `🔒 ${STAGE_GATE} ★ or all of stage ${s}`}</span>
            </header>
            {open && <p class="stage__lesson">{st.lesson}</p>}
            <div class="stage__levels">
              {st.levels.map((c, l) => {
                const lo = levelOpen(s, l, best);
                const stars = starsFor(best[c.id] ?? 0, PARS[c.id] ?? 0);
                return (
                  <button class={`lvl ${lo ? '' : 'is-locked'} ${stars ? 'is-done' : ''}`} disabled={!lo} aria-label={`Level ${s + 1}-${l + 1} ${c.name}${lo ? `, ${stars} stars` : ', locked'}`} onClick={() => onPick(c.id)}>
                    <span class="lvl__no">
                      {s + 1}-{l + 1}
                    </span>
                    <span class="lvl__stars">{lo ? starStr(stars) : '🔒'}</span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** Start card header for a School level: lesson and star targets. */
export function LevelIntro(id: string) {
  const lv = findLevel(id);
  if (!lv) return null;
  const par = PARS[id] ?? 0;
  const best = hud.school.value[id];
  return (
    <div class="lvlintro">
      <p class="lvlintro__lesson">{SCHOOL[lv.stage]!.lesson}</p>
      <p class="lvlintro__targets">
        <span>★★★ {fmtTicks(par)}</span>
        <span>★★ {fmtTicks(Math.floor((par * 112) / 100))}</span>
        <span>★ finish</span>
        {best ? <span class="is-best">Best {fmtTicks(best)}</span> : null}
      </p>
      {hud.levelTop.value && (
        <p class="lvlintro__top">
          Fastest redditor <b>u/{hud.levelTop.value.name}</b> {fmtTicks(hud.levelTop.value.ticks)}: their boat sails with you
        </p>
      )}
    </div>
  );
}

/** Next open level after this one, if any. */
export function nextLevel(id: string): string | null {
  const lv = findLevel(id);
  if (!lv) return null;
  const st = SCHOOL[lv.stage]!;
  const nxt = lv.level + 1 < st.levels.length ? { s: lv.stage, l: lv.level + 1 } : lv.stage + 1 < SCHOOL.length ? { s: lv.stage + 1, l: 0 } : null;
  if (!nxt || !levelOpen(nxt.s, nxt.l, hud.school.value)) return null;
  return SCHOOL[nxt.s]!.levels[nxt.l]!.id;
}

/** Finish card verdict for a School level. */
export function LevelResult(id: string, ticks: number) {
  const r = hud.schoolResult.value;
  const par = PARS[id] ?? 0;
  const stars = r && r !== 'checking' && !('error' in r) ? r.stars : starsFor(ticks, par);
  return (
    <div class="lvlres">
      <p class="lvlres__stars" aria-label={`${stars} of 3 stars`}>
        {[0, 1, 2].map((i) => (
          <span class={i < stars ? 'is-on' : ''} style={{ animationDelay: `${0.25 + i * 0.25}s` }}>
            ★
          </span>
        ))}
      </p>
      <p class="lvlres__note">
        {r === 'checking'
          ? 'Saving your time…'
          : r && 'error' in r
            ? r.error
            : stars === 3
              ? 'You beat the Harbourmaster!'
              : stars === 2
                ? `★★★ needs ${fmtTicks(par)}: ${((ticks - par) / 30).toFixed(1)} s to find`
                : `★★ needs ${fmtTicks(Math.floor((par * 112) / 100))}`}
      </p>
    </div>
  );
}
