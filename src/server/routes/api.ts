import { Hono } from 'hono';
import { COURSES } from '../../shared/content/courses';
import type { TodayResponse } from '../../shared/api/types';
import { platform } from '../platform';
import { dayNumber, today } from '../services/time';

export const api = new Hono();

api.get('/today', (c) => {
  const ctx = platform().ctx();
  const date = today();
  const day = dayNumber(date);
  const course = COURSES[(day - 1 + COURSES.length * 1000) % COURSES.length]!;
  const res: TodayResponse = { date, day, course, user: { username: ctx.username ?? null, loggedIn: !!ctx.userId } };
  return c.json(res);
});
