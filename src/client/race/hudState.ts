import { signal } from '@preact/signals';

export type RaceResult = { ticks: number; tacks: number; hits: number; penalties: number; vsGhost: number | null; finished: boolean };

export const hud = {
  phase: signal<'loading' | 'ready' | 'countdown' | 'racing' | 'finished'>('loading'),
  clock: signal('0:00.0'),
  countdown: signal(3),
  leg: signal(''),
  legDist: signal(0),
  /** Relative bearing of the next mark on screen (rad, 0 = straight up). */
  legArrow: signal(0),
  speed: signal(0),
  gust: signal(0),
  banner: signal<string | null>(null),
  prompt: signal<string | null>(null),
  penaltyFlash: signal(0),
  steer: signal(0),
  inCone: signal(false),
  downwind: signal(false),
  map: signal(false),
  muted: signal(false),
  result: signal<RaceResult | null>(null),
  windRel: signal(0),
  marker: signal<{ x: number; y: number; edge: boolean; angle: number; label: string; dist: number } | null>(null),
  error: signal<string | null>(null),
};

export function fmtTicks(ticks: number): string {
  const t = Math.max(0, ticks) / 30;
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
}
