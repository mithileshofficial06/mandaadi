import type { AbandonResponse, SchoolLevelResponse, SchoolFinishResponse, SchoolResponse, ApiError, BoardResponse, FinishResponse, GhostsResponse, LiveryDto, RoutesResponse, ShareResponse, StartResponse, TodayResponse } from '../../shared/api/types';

export class ApiFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

async function req<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/${path}`, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiFailure('network', 'No connection to the harbour. Check your network and try again.', 0);
  }
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const e = (json as ApiError | null)?.error;
    throw new ApiFailure(e?.code ?? 'http', e?.message ?? `Request failed (${res.status}).`, res.status);
  }
  return json as T;
}

export const api = {
  today: () => req<TodayResponse>('GET', 'today'),
  start: (date: string, courseId: string) => req<StartResponse>('POST', 'race/start', { date, courseId }),
  finish: (token: string, log: string, livery: LiveryDto) => req<FinishResponse>('POST', 'race/finish', { token, log, livery }),
  board: () => req<BoardResponse>('GET', 'board'),
  ghosts: () => req<GhostsResponse>('GET', 'ghosts'),
  routes: () => req<RoutesResponse>('GET', 'routes'),
  school: () => req<SchoolResponse>('GET', 'school'),
  schoolFinish: (levelId: string, log: string, livery: LiveryDto) => req<SchoolFinishResponse>('POST', 'school/finish', { levelId, log, livery }),
  schoolLevel: (id: string) => req<SchoolLevelResponse>('GET', `school/level?id=${encodeURIComponent(id)}`),
  abandon: (token: string) => req<AbandonResponse>('POST', 'race/abandon', { token }),
  livery: (livery: LiveryDto) => req<{ ok: true }>('POST', 'livery', { livery }),
  share: (image: string | null) => req<ShareResponse>('POST', 'share', { image }),
};
