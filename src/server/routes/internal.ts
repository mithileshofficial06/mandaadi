import { Hono } from 'hono';
import { platform } from '../platform';
import { dayNumber, today } from '../services/time';

export const internal = new Hono();

internal.post('/triggers/install', (c) => c.json({ status: 'ok' }));
internal.post('/triggers/upgrade', (c) => c.json({ status: 'ok' }));

internal.post('/menu/post-today', async (c) => {
  const date = today();
  const post = await platform().reddit.submitPost({
    title: `Mandaadi · Day ${dayNumber(date)} · Same wind. Your line.`,
    entry: 'default',
    textFallback: 'A daily sailing race. Open this post in the Reddit app or on the web to race.',
  });
  return c.json({ showToast: { text: 'Posted today\'s race.', appearance: 'success' }, navigateTo: post.url });
});
