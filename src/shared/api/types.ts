import type { Course } from '../core/course';
import type { Medal } from '../core/par';

export type ApiError = { error: { code: string; message: string } };

/** A boat's look, as the player painted it. */
export type LiveryDto = { hull: string; band: string; sailNo: string };

export type BoardRow = { rank: number; name: string; ticks: number; medal: Medal; me?: boolean };

export type TodayResponse = {
  date: string;
  day: number;
  course: Course;
  user: { username: string | null; loggedIn: boolean };
  /** True when this post is today's race (older posts are practice only). */
  live: boolean;
  par: number;
  attempts: { used: number; max: number };
  best: BoardRow | null;
  sailors: number;
  top: BoardRow | null;
  /** Kept on the server because Reddit gives every app version a fresh browser storage. */
  profile: { livery: LiveryDto | null; finishedEver: boolean };
};

export type StartResponse = { ranked: true; token: string; attempts: { used: number; max: number } } | { ranked: false; reason: 'login' | 'attempts' | 'old-day' | 'course' };

export type FinishResponse = {
  ticks: number;
  medal: Medal;
  par: number;
  improved: boolean;
  best: BoardRow;
  sailors: number;
  attempts: { used: number; max: number };
};

export type BoardResponse = { rows: BoardRow[]; me: BoardRow | null; sailors: number; par: number };

export type Ghost = { name: string; log: string; ticks: number; livery: LiveryDto | null; kind: 'top' | 'you' | 'rival' };
export type GhostsResponse = { ghosts: Ghost[] };

/** Everyone's route today: 32 points each, decimetres. */
export type RoutesResponse = { routes: Array<Array<[number, number]>>; mine: Array<[number, number]> | null };

export type ShareResponse = { ok: true; commentId: string };
