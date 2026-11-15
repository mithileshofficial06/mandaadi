# Mandaadi

**Same wind. Your line.** A daily sailing race inside a Reddit post. Everyone in the subreddit sails the same course in the same wind. You can't sail straight into the wind, so the puzzle is your line: go left or right, chase the gust or avoid the lull, tack now or later.

**The name.** On the Tamil coast of the Gulf of Mannar, the *mandaadi* is the sailor who leads the crew in traditional *vallam* (sailboat) races: the one who reads the wind and picks the line. (It is not related to the 2026 Tamil film of the same name.)

Built for Reddit's Daily Games Hackathon on Devvit Web.

## How to play
- **Steer with one thumb:** drag left or right anywhere on the water. Let go and the boat sails straight.
- **The red cone is the wind.** Point into it and the sail flaps and the boat stops. Zigzag upwind, and tap **TACK** to turn through the wind. Tap again as the bow crosses for a *perfect tack*.
- **Dark water is more wind.** Gusts drift down the course; lulls slow you. Fish shoals take a second off if you sail through them, currents push you, and islands block the way.
- Round the marks in order, then race back through the line.

## Every day
- **One new course a day:** a 30-day cycle of different courses (each named after a place in the Gulf of Mannar) that repeats every 30 days. Seven kinds of race rotate: windward, shifty, tide race, the cup, storm (with a squall), triangle and light air.
- **3 attempts** (plus a warm-up attempt on your first day). Your best counts. Restart in the first 10 seconds and the attempt is given back.
- **Server-verified times:** the game records your inputs, and the server re-sails your race to check the time. Unfinished or impossible runs don't count.
- **Today's board and medals:** 🥇 beat the Harbourmaster (the reference boat), 🥈 within 15% of it, 🥉 finish. Gold shows in your subreddit flair.
- **Race real redditors:** the day's fastest sailor, your own best and two sailors just ahead of you sail with you as ghost boats with name tags.
- **The wake map:** every sailor's route is drawn on the post, so the community sees which side paid.
- **Share your race** to the comments with a postcard of the moment you finished.

## Sailing School
Six stages of five levels each: Harbour Mouth, Beating Upwind, Pressure, Reef Country, Tide Race, Monsoon. Earn up to three stars per level (three = beat the Harbourmaster). Open the next stage with 6 stars or by finishing every level. Each level shows its fastest redditor, who sails with you as a ghost. Your total stars show in your flair.

## Under the hood
- **Deterministic integer physics** (`src/shared/core`): positions in micrometres, angles in 1/4096 turns, lookup-table trigonometry, a fixed 30 Hz tick. The same input log gives the same race on every phone and on the server. That is what makes verified times, exact ghosts and replays possible.
- **Generated, checked courses** (`tools/gen-courses.ts`): every daily course and School level is sailed by an autopilot from both sides before it is kept. It must finish, its time must sit in a target window, and the two sides must differ, so there is always a real decision.
- **Everything is drawn in code:** the water shader, the islands and palms, the *vallam* hulls and sails, the sky, gulls, dolphins, the temple festival and the synthesized drums. There are no image or model files.
- **Stack:** Devvit Web, Hono server with Redis and the scheduler, Preact, three.js, Vite, TypeScript, Vitest and Playwright.

## Develop
```
npm install
npm run harness          # local game with an in-memory server: http://127.0.0.1:5173/race.html
npm test                 # unit and server tests
npm run deploy           # checks + upload (Mandaadi's own Devvit login, see CLAUDE.md)
npx tsx tools/gen-courses.ts   # regenerate courses after physics changes
```
