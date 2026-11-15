import type { Course } from '../core/course';

export type ApiError = { error: { code: string; message: string } };

export type TodayResponse = {
  date: string;
  day: number;
  course: Course;
  user: { username: string | null; loggedIn: boolean };
};
