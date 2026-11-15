# Mandaadi: hackathon submission draft

*Draft for the Reddit Daily Games Hackathon form. Replace the links in [brackets] before submitting.*

## Name
Mandaadi

## Tagline
Same wind. Your line. A daily sailing race where everyone in the subreddit sails the same course, and the argument is about which way to go.

## Links
- App: https://developers.reddit.com/apps/mandaadi-race
- Demo subreddit: [r/... once public]
- Demo post: [link]
- Video: [link]
- Code: https://github.com/mithileshofficial06/mandaadi

## What it is
Every day the subreddit gets one new sailing course. You can't sail straight into the wind, so getting to the mark is a puzzle: left or right, chase the gust or skip it, tack now or later. Races last about a minute. You get three attempts, and the server re-sails your race from your inputs to check your time.

When you race, the day's fastest redditor and the sailors just ahead of you sail alongside you as ghost boats. When you finish, your route joins the wake map on the post, so everyone can see which side paid. Then you can share your race to the comments, and the debate starts there.

## Why it fits Reddit
- **One shared puzzle a day:** the same course and the same wind for everyone, so it plays like a daily crossword with a leaderboard.
- **Real people in the race:** other redditors' verified runs become your ghost rivals, with name tags.
- **The wake map** turns hundreds of individual races into one community picture of the course.
- **Comments as the second half of the game:** shared races post your time, medal and the side you took, which invites "the left was faster!" replies.
- **Flair:** medals and Sailing School stars show next to your name in the subreddit.

## Daily content
- A 30-day cycle of distinct courses (1-3 marks, islands, gusts and lulls, currents, wind shifts, fish shoals, storm squalls), rotating seven race types, then repeating.
- Each course is generated and then checked by an autopilot sailing it from both sides. It must be sailable, land in a target time, and have a real left-or-right decision.
- A new post every day at 00:00 UTC from the scheduler, with a fresh board.

## Sailing School
30 levels in six stages for learning and mastery, with stars, stage gates, a fastest redditor per level, and ghosts.

## Craft
- Deterministic integer physics shared by the client and the server, with exact replays and ghosts.
- All art is procedural (water, islands, boats, sky, festival, sound): no image or model files.
- A GTA-style chase camera, one-thumb steering, haptics, and a guide for non-sailors.

## Built with
Devvit Web, Redis, Scheduler, Hono, Preact, three.js, TypeScript, Vite, Vitest, Playwright.
