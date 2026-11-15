import { Hono } from 'hono';
import { platform } from '../platform';
import { dayNumber, today } from '../services/time';

export const internal = new Hono();

const postToday = () =>
  platform().reddit.submitPost({
    title: `Mandaadi · Day ${dayNumber(today())} · Same wind. Your line.`,
    entry: 'default',
    textFallback: 'A daily sailing race. Open this post in the Reddit app or on the web to race.',
  });

// First install: put today's race up straight away so the subreddit is never empty.
internal.post('/triggers/install', async (c) => {
  try {
    await postToday();
  } catch (e) {
    console.warn('install post failed:', String(e).slice(0, 200));
  }
  return c.json({ status: 'ok' });
});
internal.post('/triggers/upgrade', (c) => c.json({ status: 'ok' }));

internal.post('/menu/post-today', async (c) => {
  const post = await postToday();
  return c.json({ showToast: { text: 'Posted today\'s race.', appearance: 'success' }, navigateTo: post.url });
});
