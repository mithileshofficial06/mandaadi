# Mandaadi: hackathon rating (2026-11-15)

Reddit Daily Games Hackathon. Four equally weighted criteria. Rated on the build as it stands today (commit 4cf8b93), plus where it could get by 7 Dec.

## Scores

| Criterion | Today | If tier B lands well |
|---|---|---|
| Delightful UX | 6.5 | 7.5 |
| Polish | 7 | 8 |
| Reddit-y | 2 | 7.5 |
| Daily Content | 5 | 7.5 |
| **Overall** | **5 / 10** | **7.5 / 10** |

## Why only 5 today
It is a good-looking single-player sailing game that is not on Reddit yet. Half the judging (Reddit-y, Daily Content) rewards things that do not exist yet: a daily post, real players, a leaderboard, a community wake map, comments.

## Findings, ranked

| # | Severity | Finding | Status | Fix |
|---|---|---|---|---|
| 1 | Critical | Never run on Reddit: no app upload, no playtest subreddit, no post. | Confirmed | Create r/mandaadi_dev, check the app name, `devvit playtest` this week. |
| 2 | Critical | No community loop: no server-verified times, leaderboard, real ghosts, wake map or share. That loop is the whole pitch. | Confirmed | Tier B next, before any more visuals. |
| 3 | High | Touch steering never tested on a phone or inside the Reddit webview. | Confirmed | Phone test plus the 19 Nov feel gate with 10 testers. |
| 4 | High | Sailing has a learning curve; first-timers may stall in the cone. The guide helps but is untested on real players. | Suspected | Watch 5 non-sailors play without help; tune the prompts. |
| 5 | High | Bot fleet makes it feel busy, but judges may read it as single-player until real ghosts replace the bots. | Suspected | Swap bots for real redditor ghosts in tier B; keep bots only to fill quiet days. |
| 6 | Medium | Some courses take about 2 minutes; the pitch says 60-90 s. | Confirmed | Shorten legs or tune speeds once the solver exists. |
| 7 | Medium | Heavy scene; mid-range Android performance is unknown (51-55 fps at 4x CPU throttle on desktop is only a proxy; map view drops to ~37 fps). | Suspected | Real-device test; drop crowd, bunting or bot detail if needed. |
| 8 | Medium | Time is split with Paanai (entry #1) and QDay; whether prizes stack across two entries is unconfirmed. | Confirmed (risk) | Ask on the Devvit Discord; keep the stop points. |
| 9 | Low | A 2026 Tamil film shares the name; searches show the film first. | Confirmed | One-line meaning in the README and pinned post; no film imagery. |

## Strengths
- Original: no sailing game among 2,437 past entries, and route choice (not reflexes) decides the race.
- Strong visual identity: procedural Coromandel coast, vallams, festival, synthesized drums. Nothing generic or AI-looking.
- Deterministic integer core with input-log replay: server verification and exact ghosts are already possible.
- Real depth: tacking, gusts, shifts, currents, perfect tacks, fish shoals, seven race types.

## Verdict
**Fix, then build.** The game layer is strong enough. Stop adding visuals and spend the next 10 days on getting it onto Reddit and building the community loop (tier B). Odds today: an honourable mention is unlikely and Best Daily Game is very unlikely. With tier B live and a demo subreddit that looks busy, a $1k honourable mention is realistic and the top prize is a long shot.

---

# Re-rating after tier B (2026-11-15, night, v0.0.4 live on r/mandaadi_race_dev)

| Criterion | Morning | Now | Ceiling (with players + phone test) |
|---|---|---|---|
| Delightful UX | 6.5 | 7 | 8 |
| Polish | 7 | 7.5 | 8 |
| Reddit-y | 2 | 6.5 | 8 |
| Daily Content | 5 | 6.5 | 7.5 |
| **Overall** | **5** | **6.5 / 10** | **8 / 10** |

## What moved it
Runs on Reddit; server-verified times; attempts; board; medals and flair; real-player ghosts with name tags; wake map on the splash; share to comments with a postcard; daily post job; races now 64-85 s par; GTA-style camera.

## Findings, ranked
| # | Severity | Finding | Status | Fix |
|---|---|---|---|---|
| 1 | Critical | No real players yet. The board, ghosts and wake map, which are the pitch, are empty, so a judge sees a lone bot race. | Confirmed | Item 4: get 20-50 real sailors into the dev sub for several days before judging. |
| 2 | High | Daily content repeats weekly: 7 fixed courses, so day 8 equals day 1. | Confirmed | Seed per-date variation (wind angle, gust positions, mark offsets) from the date; keep the course type per weekday. |
| 3 | High | Never played on a real phone in the Reddit app, and no full race through the real UI on Reddit (API flow and emulated phone only). | Confirmed | Phone race tonight; 19 Nov tester round. |
| 4 | Medium | Any physically valid log passes, so a scripted autopilot can post Harbourmaster times. | Confirmed | Accept for a hackathon; optional plausibility checks (input count and variety) and hiding Harbourmaster-level times that look bot-like. |
| 5 | Medium | Attempts are used at the start, so restarting from the pause menu burns one. This may feel harsh. | Confirmed | Label it ("restart uses an attempt") or refund attempts abandoned in the first 10 s. |
| 6 | Medium | Sailing is still unproven with non-sailors. | Suspected | Watch 5 non-sailors play. |
| 7 | Low | The finish card is long on small phones. | Suspected | Collapse stats on heights under 700 px. |
| 8 | Low | 🥇 flair is untested on Reddit. | Suspected | Check after the next gold run. |

## Verdict
**Build on.** The game is now a real Reddit daily game, not a demo. What keeps it at 6.5 is not code but people (empty board) and the weekly repeat. Fix #2 (a day of work), then spend the rest on #1 and #3.
