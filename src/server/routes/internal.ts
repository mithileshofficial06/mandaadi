import { Hono } from 'hono';
import { platform } from '../platform';
import { claimDailyPost, courseFor, rememberPost } from '../services/race';
import { dayNumber, today } from '../services/time';

export const internal = new Hono();

const TYPE: Record<string, string> = { light: 'Light air', windward: 'Windward-leeward', shifty: 'Shifty breeze', tide: 'Tide race', storm: 'Storm', community: 'Community course', cup: 'The Cup' };

/** Posts a date's race (once per date unless forced) and remembers which day the post races. */
async function postDay(date: string, force = false): Promise<{ id: string; url: string } | null> {
  if (!(await claimDailyPost(date)) && !force) return null;
  const course = courseFor(date);
  const post = await platform().reddit.submitPost({
    title: `Mandaadi · Day ${dayNumber(date)} · ${course.name} (${TYPE[course.type] ?? 'Race'}) · Same wind. Your line.`,
    entry: 'default',
    postData: { date },
    textFallback: 'A daily sailing race. Open this post in the Reddit app or on the web to race.',
  });
  await rememberPost(post.id, date);
  return post;
}

// First install: put today's race up straight away so the subreddit is never empty.
internal.post('/triggers/install', async (c) => {
  try {
    await postDay(today());
  } catch (e) {
    console.warn('install post failed:', String(e).slice(0, 200));
  }
  return c.json({ status: 'ok' });
});
// Every new version: make sure today's race is posted (once per day, so this is safe to repeat).
internal.post('/triggers/upgrade', async (c) => {
  try {
    await postDay(today());
  } catch (e) {
    console.warn('upgrade post failed:', String(e).slice(0, 200));
  }
  return c.json({ status: 'ok' });
});

// Scheduler, 00:00 UTC: a new race every day.
internal.post('/cron/daily-rollover', async (c) => {
  const post = await postDay(today());
  return c.json({ status: 'ok', posted: post?.id ?? null });
});

internal.post('/menu/post-today', async (c) => {
  const post = await postDay(today(), true);
  return c.json({ showToast: { text: "Posted today's race.", appearance: 'success' }, ...(post ? { navigateTo: post.url } : {}) });
});
