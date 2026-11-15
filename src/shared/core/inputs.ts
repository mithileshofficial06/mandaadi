// Input-log codec. Only changes are stored: a new rudder value or a tack press, with tick deltas.
// Format: version byte, then per entry varint(tick delta) and one byte (steer + 16) | 64 if tack.
// Encoded as base64url. A 90-second race is typically 0.3-1 KB.
import { MAX_ENTRIES, MAX_TICKS } from './fixed';
import { TUNE, type TickInput } from './boat';

export type InputEntry = { t: number; steer: number; tack: boolean };
export type InputLog = InputEntry[];

const VERSION = 1;
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function pushVarint(out: number[], v: number): void {
  let x = v >>> 0;
  while (x >= 0x80) {
    out.push((x & 0x7f) | 0x80);
    x >>>= 7;
  }
  out.push(x);
}

export function bytesToB64url(bytes: ArrayLike<number>): string {
  let s = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    s += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + B64[n & 63]!;
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = (bytes[i] ?? 0) << 16;
    s += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!;
  } else if (rest === 2) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8);
    s += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]!;
  }
  return s;
}

export function b64urlToBytes(s: string): number[] | null {
  const out: number[] = [];
  let buf = 0;
  let bits = 0;
  for (let i = 0; i < s.length; i++) {
    const v = B64.indexOf(s[i] ?? '');
    if (v < 0) return null;
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buf >> bits) & 0xff);
    }
  }
  return out;
}

export function encodeInputs(log: InputLog): string {
  const out: number[] = [VERSION];
  let last = 0;
  for (const e of log) {
    pushVarint(out, e.t - last);
    last = e.t;
    out.push(((e.steer + TUNE.STEER_MAX) & 63) | (e.tack ? 64 : 0));
  }
  return bytesToB64url(out);
}

/** Decode and validate. Returns null for anything malformed or over the caps. */
export function decodeInputs(s: string): InputLog | null {
  if (s.length > MAX_ENTRIES * 6) return null;
  const bytes = b64urlToBytes(s);
  if (!bytes || bytes[0] !== VERSION) return null;
  const log: InputLog = [];
  let i = 1;
  let t = 0;
  while (i < bytes.length) {
    let delta = 0;
    let shift = 0;
    for (;;) {
      const b = bytes[i++];
      if (b === undefined || shift > 21) return null;
      delta |= (b & 0x7f) << shift;
      if (b < 0x80) break;
      shift += 7;
    }
    const v = bytes[i++];
    if (v === undefined || v > 127) return null;
    const steer = (v & 63) - TUNE.STEER_MAX;
    if (steer < -TUNE.STEER_MAX || steer > TUNE.STEER_MAX) return null;
    t += delta;
    if (t >= MAX_TICKS) return null;
    log.push({ t, steer, tack: (v & 64) !== 0 });
    if (log.length > MAX_ENTRIES) return null;
  }
  return log;
}

/** Replays a log tick by tick: call next(tick) once per tick, in order. */
export class InputPlayer {
  private i = 0;
  private steer = 0;
  constructor(private readonly log: InputLog) {}
  next(tick: number): TickInput {
    let tack = false;
    while (this.i < this.log.length && this.log[this.i]!.t <= tick) {
      const e = this.log[this.i++]!;
      if (e.t === tick) {
        this.steer = e.steer;
        if (e.tack) tack = true;
      } else {
        this.steer = e.steer;
      }
    }
    return { steer: this.steer, tack };
  }
}

/** Records inputs as they are applied, one call per tick. */
export class InputRecorder {
  readonly log: InputLog = [];
  private steer = 0;
  record(tick: number, input: TickInput): void {
    if (input.steer !== this.steer || input.tack) {
      if (this.log.length >= MAX_ENTRIES) return;
      this.log.push({ t: tick, steer: input.steer, tack: input.tack });
      this.steer = input.steer;
    }
  }
}
