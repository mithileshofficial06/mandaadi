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
