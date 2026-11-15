# Mandaadi: progress

> Read this first. Resume from **Next**. Update at the end of every session.

## Status (2026-11-15)

**Tier A (the game) built and playable in the local harness.** Not yet on Reddit.

Done:
- Project scaffold copied from Paanai's proven setup (devvit.json permissions, Vite + public/ copy fix, CSP-safe boot.js, platform layer, harness, client mock). Launch script renamed `launch:AFTER-DEC-9-ONLY`.
- Deterministic core (integers only, ESLint-enforced): trig tables, polar (best upwind ~50 deg, downwind ~150 deg), speed lag, tack/gybe losses, one-tap tack to the mirror angle, gusts/lulls that drift, wind shifts, islands (union of circles, 2 s penalty, scrape-off), marks (sweep-angle rounding, solid), start line with over-early rule, finish line, 3-minute cap. Input-log codec (~0.5-1 KB). `simulate()` for server replay. Autopilot (`pilot.ts`) used as the Harbourmaster ghost.
- 10 unit tests: trig accuracy, polar tactics, autopilot finishes both sides in 45-100 s, encode/decode/replay exactness, fuzzed logs never crash, bad logs rejected.
- Race client: water shader (depth, shoals, caustics, gust darkening + ripples, shore foam, glitter, haze), islands with dunes/wet sand/palms that sway/bushes/rocks/palm shadows, mainland beach with a coconut grove, procedural vallam (painted hull, thwarts, mast, lateen yard, patched canvas sail with sail number, two crew, steering oar, foam collar, heel, billow, luff flutter), marks with rounding arrows, start/finish line, laylines (first 3 races), red no-go cone, foam wake, follow camera (turns to the next mark) + whole-course map, Harbourmaster ghost, synthesized audio, haptics, HUD (clock, next mark + distance, speed, wind, gust chip, countdown, over-early banner, coaching prompts first 2 races, rudder bar, Tack/Gybe button), finish card, race again. Feed card (splash) draws today's course as a chart.
- Checks: tests 10/10, tsc, lint, build clean. e2e: autopilot finishes in the real client (1:33.1), no console errors. Perf: 55 fps at dpr 2 (GPU), 51 fps at 4x CPU throttle. Bundles: splash ~9 KB gz, race 171 KB gz.

Design decision (from Mithilesh's "cool, attractive, realistic, not AI-looking"): the art moved from v2's "stylised chart" to a realistic sunny aerial look of the Coromandel coast with traditional boats. All procedural.

## Polish pass (2026-11-15, evening) - from Mithilesh: better assets, clearer camera, easy to understand, better animation, frequent commits
Commits 67122c2 .. 5b84765:
- Camera: cinematic orbit on the start screen and after the finish; closer follow view (boat in the lower third, steady through tacks); pinch / wheel zoom (7-40 m half-width); next-mark marker (over the mark, or pinned to the edge with distance).
- Understanding: How to sail guide (3 animated cards, first visit + help button that pauses with Restart), start card with today's course chart and an example line, sailing status line, gust/lull chips, toasts (start quality, mark rounded + split, aground, final approach), finish card with your line vs the Harbourmaster's and which side each took.
- World: sky dome with clouds, vallam bow + stem post + plank seams + pot/net/anchor stone + ropes, wind-aligned whitecaps (gusts read without colour), foam rings at marks, fishing village with beached boats, gulls.
- Animation: bow spray, swell pitch/roll matched to the water shader, bow lift on acceleration, rounding ripple, Go flash, finish count-up.
- Checks: 10/10 tests, lint, tsc, build; e2e 1:33.1 no errors; 55 fps at 4x CPU throttle dpr 2; race.js 182 KB gz, splash ~9 KB gz.

## Agreed build plan (Mithilesh, 2026-11-15) - do in this order, commit after each
DONE 1. Wind ring around the boat (red no-go, green fastest angles, amber dead downwind, bow needle) + dead-downwind tip. Commit 7c43545.
DONE 2. Camera angle button cycling Chase (default) / Low cinematic (near water, horizon visible) / Top-down tactical; remember choice; pinch zoom in all.
DONE 3. GPS minimap like GTA: round, bottom-left (move the rudder bar to bottom centre), rotates with the view with N on the rim. Shows: you (orange arrow + trail + 5 s projected line), next mark highlighted + dotted route, other marks with rounding arrows, islands, start/finish, live gusts, ghost/fleet dots, wind arrow, faint cone. Tap = full map (replaces the map button).
DONE 4. Core skills in src/shared/core with tests (server replays them): perfect tack (shrinking ring, tap as the sail crosses = keep ~95% speed instead of ~84%), fish shoals (gulls dive; sail through = -1 s; placed off the obvious line), currents (tide day), wind-shift alert.
DONE 5. The Fleet: ~10 boats at the start; bots named after Ramanathapuram fishing villages (Pamban, Mandapam, Kilakarai, Thondi, Rameswaram, Devipattinam...) with different skill and side preferences, clearly bots; live position ("4th of 10"), overtake sound/toast. Real redditor ghosts replace bots in tier B.
DONE 6. Festival race day: crowds + bunting on the beach, decorated committee boat at the line, synthesized parai/thavil drums for countdown and finish, cheering.
DONE 7. Seven race types (Mon Light Air, Tue Windward-Leeward, Wed Shifty, Thu Tide Race, Fri Storm with rain, Sat Triangle, Sun Island Slalom) each with its own weather/time-of-day preset; practice course picker; autopilot test that every course finishes both sides.
DONE 8. Sea events: squall line (rain, big gust + shift), dolphins, a trawler passing (cosmetic).
DONE 9. Race replay (cinematic, 4x) + shareable postcard image.
DONE 10. Paint your vallam (hull colours, eye, sail patch, flag), unlocked by rank later.
Status 2026-11-15 night: ALL 10 DONE (commits 448bb0e..latest). Notes: sea events are dolphins + trawler (no squall yet); paint is local-only (ranks unlock later); longest courses run up to ~122 s with the autopilot (test limit 130 s) - tune towards 50-80 s when the solver lands; map view is ~37 fps unthrottled with the full fleet (racing view 53 fps at 4x throttle). Bots are named after fishing villages and are clearly bots. race.js 191 KB gz.
Then tier B (Reddit features). Avoid: speed boosts / power-ups (break "same wind, your line").

- Camera: default is now 'Behind' (GTA-style drive cam that follows the boat's heading); camera button cycles Behind / High / Low / Top.

## Next
1. **Mithilesh:** check that `mandaadi` is free as a Devvit app name (`devvit new`/upload will say), create `r/mandaadi_dev` (private test sub). If the name is taken, use `mandaadi-race` and update devvit.json `name` + `dev.subreddit`.
2. First `devvit playtest` on r/mandaadi_dev; test on a real phone in the Reddit app (drag steering inside the webview, double-tap not swallowed, fps).
3. 19 Nov feel gate: 10 testers (5 never sailed, 3 Android). "Steering and turning felt good" + "I understood why the boat stopped", 7/10 yes on both. Stop point 1 if it fails twice.
4. Feel tuning knobs if testers struggle: `TUNE.TURN_MAX`, `LAG_*`, `TACK_KEEP` in boat.ts; `FULL_PX` in steer.ts; camera `halfWidth`/pitch in cameraRig.ts.
5. Then tier B: server verification (`/api/race/start` token + `/api/race/finish` replay), daily post job, 3 attempts, board, medals, Line Honours + You ghosts, route32 + heat job + wake map in the splash, share to comments, first-run mode.

## Known gaps / ideas
- Course length: autopilot ~93 s; target Harbourmaster 50-80 s. Shorten (mark at y~210) or raise medium vmax when the solver lands.
- Glitter is a bit speckly in extreme close-ups (fine at play zoom).
- Mainland beach could get fishing huts and beached boats (polish tier).
- Wind streak effect was removed (looked like rain); `createStreaks` is still in effects.ts, unused.

## On Reddit (2026-11-15)
- App: `mandaadi-race` (the name `mandaadi` was taken), owner u/kira_-_06. Portal: https://developers.reddit.com/apps/mandaadi-race
- Playtest sub: r/mandaadi_race_dev (private). The install trigger posted "Mandaadi · Day 1"; splash and race both work in the Reddit modal, 56 fps on desktop, no console errors.
- Devvit CLI for this project uses its own login dir `~/.devvit-mandaadi` via `tools/dv.mjs` (`npm run dv -- <cmd>`); the default `~/.devvit` (u/mithileshofficial06, Paanai) is untouched.
- Browser for Reddit chores: the Playwright Chromium with profile `.mandaadi/reddit-profile`, started with `--remote-debugging-port=9333`; `tools/rb.mjs`, `rb-act.mjs`, `rb-race*.mjs` drive it over CDP (Reddit blocks headless).
- Not yet checked on Reddit: a full race to the finish, phone (Reddit app) view.

## Tier B built (2026-11-15, night) - live on r/mandaadi_race_dev as v0.0.4
- Ranked races: `/api/race/start` gives a ticket (uses 1 of 3 attempts; first-finish day gets a 4th warm-up attempt), `/api/race/finish` re-sails the input log on the server (rejects unfinished runs and runs faster than real time). Practice when logged out, out of attempts, old post, or another course.
- Medals vs the Harbourmaster par (`src/shared/core/par.ts`): gold = beat par, silver = within 15%, bronze = finish. Gold sets user flair.
- Board (top 10 + you), real-player ghosts with name tags (line honours, your best, two just ahead), wake map of everyone's routes on the splash, share to comments (postcard image + time/place/medal/side, as the player, falls back to the app).
- Daily post: scheduler `daily-rollover` 00:00 UTC; each post remembers its date (`post:<id>`); old posts are practice with the final board.
- Boat paint and "has finished" kept on the server: Reddit gives each app version a new webview origin, so localStorage resets on every upload.
- Tuning: VMAX_10 50/70/90 -> 62/86/108, Coral Triangle shortened: pars 64-85 s. `PHYSICS_VERSION` (course.ts) must be bumped on any physics change (ghosts and par cache key on it).
- Verified on Reddit: splash, start card, ranked API flow (start/finish/board/ghosts/routes/share with image), comment posted as u/kira_-_06, phone-size mobile web with touch steering + tack, no console errors.
- Not verified: a full race through the real UI on Reddit (only via API + local e2e), a real phone/Reddit app, the 00:00 UTC cron firing (first run tonight should post Day 2).
- Test data on the dev sub: u/kira_-_06 has a 1:30.7 autopilot test run on Day 1 and one test comment.
- Tools: `npx tsx tools/pars.ts` (par per course), `tools/genlog.ts`, `rb-api.mjs` (API test on Reddit), `rb-phone.mjs` (phone test), `/__harness/seed?n=40` (harness only: fake sailors for the wake map).

## Next
1. Real phone in the Reddit app (Mithilesh), and the 19 Nov feel test with 10 testers.
2. Feel tuning from tester notes (TURN_MAX, LAG_*, TACK_KEEP, camera).
3. Item 4 (left for later): demo subreddit, video, write-up, publish after 9 Dec.

## Sailing School + 30-day daily cycle (2026-11-15, late) - live as v0.0.5
- `tools/gen-courses.ts` generates 30 daily courses (one per Gulf of Mannar place, types rotate, difficulty swings through the month, 1-3 marks, islands, gusts, shoals, currents, shifts) and the School (6 stages x 5 levels: Harbour Mouth, Beating Upwind, Pressure, Reef Country, Tide Race, Monsoon) into `src/shared/content/generated.ts`, with pars. Every course is checked by the autopilot from both sides and the Harbourmaster; par windows: daily 55-98 s, School 32-98 s.
- Day N races `DAILY[(N - 1) % 30]` (`dailyCourse` in content/school.ts): a 30-day cycle that repeats.
- School: stars 3 = beat par, 2 = within 12%, 1 = finish; levels unlock in order, a stage needs 8 stars from the previous one. Progress: server hash `school:<uid>` (re-sailed on the server), merged with localStorage for logged-out play.
- Boards/runs/routes keyed by date AND course id.
- After any physics change: `npx tsx tools/gen-courses.ts` (the content test fails until pars are current).

## Rating fixes (2026-11-15, late) - live as v0.0.6
- Courses: School pars rise level by level inside each stage (per-level windows); dailies need a real side decision (autopilot left vs right differ >= 1.5 s) and no lookalikes (same type + marks + par within 4 s). Review sheets: `Daily_Courses_Sheet.png`, `School_Courses_Sheet.png` (harness page `/harness/sheet.html[?set=school]`).
- School social: fastest redditor per level (`slb:`/`srun:` keys, physics-versioned) shown on the level card and sailed as a ghost; flair = School stars + last Harbourmaster day; board rows show School stars.
- Stage gate 6 stars, or finish every level of the previous stage.
- Anti-cheat: runs more than 20% under par are not counted. Real bot detection needs human input logs from testers first (not built).
- Restart within 13 s of the ticket (3 s countdown + 10 s) refunds the attempt (`/api/race/abandon`); pause menu says so.
- Start card: paint behind a "Your boat" toggle; short screens (< 720 px) hide the wind/hint lines and shrink the chart.

## Claude's items done (2026-11-16) - live as v0.0.8
- Verified on Reddit through the real UI (dev-only autopilot: `localStorage['mandaadi.autopilot']='1'` in the webview, honoured only when the subreddit name ends in `_dev`): a full ranked daily race (server-verified, board) and School 1-1 (3 stars saved on the server). Flair shows "⛵ 3★" for u/kira_-_06. Tool: `node tools/rb-full.mjs <post url>`.
- Storm squall: storm courses get a big fast gust front (k 148-158, r 70-90, drift 32-44); "Squall!" warning when it nears. Only storm courses changed.
- Charts: currents drawn with flow arrows; the wind arrow picks a corner clear of marks, islands, shoals and the start line.
- Upgrade trigger posts today's race if missing (once per day). Old untitled Day 1 test post removed (with its test comment).
- README rewritten (with the name meaning); SUBMISSION.md draft for the hackathon form.
