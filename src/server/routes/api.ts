import { Hono } from 'hono';
import { BY_WEEKDAY } from '../../shared/content/courses';
import type { TodayResponse } from '../../shared/api/types';
import { platform } from '../platform';
import { dayNumber, today, weekday } from '../services/time';

export const api = new Hono();

api.get('/today', (c) => {
  const ctx = platform().ctx();
  const date = today();
  const day = dayNumber(date);
  const course = BY_WEEKDAY[weekday(date)]!;
  const res: TodayResponse = { date, day, course, user: { username: ctx.username ?? null, loggedIn: !!ctx.userId } };
  return c.json(res);
});
