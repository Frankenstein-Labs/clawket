/**
 * Keyframe tracks for the Companion loading scenes and tap reactions.
 *
 * The choreography is written in the CSS keyframe syntax of the owner-approved prototype
 * (2026-09-27 design canvas) and parsed once at import, so the numbers stay identical to what
 * the owner reviewed. Worklets sample the parsed tracks on the UI thread.
 */

/** Cubic bézier control points (x1, y1, x2, y2), as in CSS `cubic-bezier()`. */
export type Bezier = readonly [number, number, number, number];
/** One key: time (0–1 of the animation), value, then the easing of the segment that starts here. */
export type TrackKey = readonly [number, number, number, number, number, number];
export type Track = ReadonlyArray<TrackKey>;
/** Translation (x, y), rotation in degrees (r), scale (sx, sy), opacity (o) and stroke offset (dash). */
export type TrackProp = 'x' | 'y' | 'r' | 'sx' | 'sy' | 'o' | 'dash';
export type Keyframes = Readonly<Partial<Record<TrackProp, Track>>>;

const NAMED_EASES: Readonly<Record<string, Bezier>> = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
};

export function parseEase(value: string): Bezier {
  const named = NAMED_EASES[value.trim()];
  if (named) return named;
  const match = /^cubic-bezier\(([^)]*)\)$/.exec(value.trim());
  const points = match?.[1].split(',').map((part) => Number(part.trim()));
  if (!points || points.length !== 4 || points.some((point) => !Number.isFinite(point))) {
    throw new Error(`Unsupported easing: ${value}`);
  }
  return [points[0], points[1], points[2], points[3]];
}

function parseTransform(value: string): Record<'x' | 'y' | 'r' | 'sx' | 'sy', number> {
  const parsed = { x: 0, y: 0, r: 0, sx: 1, sy: 1 };
  let matched = 0;
  for (const [, name, args] of value.matchAll(/([a-zA-Z]+)\(([^)]*)\)/g)) {
    const numbers = args.split(',').map((part) => Number.parseFloat(part));
    if (numbers.some((number) => !Number.isFinite(number))) throw new Error(`Unsupported transform: ${value}`);
    matched += 1;
    switch (name) {
      case 'translate': parsed.x = numbers[0]; parsed.y = numbers[1] ?? 0; break;
      case 'translateX': parsed.x = numbers[0]; break;
      case 'translateY': parsed.y = numbers[0]; break;
      case 'scale': parsed.sx = numbers[0]; parsed.sy = numbers[1] ?? numbers[0]; break;
      case 'scaleX': parsed.sx = numbers[0]; break;
      case 'scaleY': parsed.sy = numbers[0]; break;
      case 'rotate': parsed.r = numbers[0]; break;
      default: throw new Error(`Unsupported transform: ${name}`);
    }
  }
  if (!matched) throw new Error(`Unsupported transform: ${value}`);
  return parsed;
}

function parseStop(selector: string): number {
  const trimmed = selector.trim();
  if (trimmed === 'from') return 0;
  if (trimmed === 'to') return 1;
  const percent = Number.parseFloat(trimmed);
  if (!trimmed.endsWith('%') || !Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new Error(`Unsupported keyframe selector: ${selector}`);
  }
  return percent / 100;
}

/**
 * Parses keyframe blocks (`0%,6%{transform:…;animation-timing-function:…}10%{…}`). A block's
 * timing function eases the segment that starts at it, as in CSS; `ease` is the default.
 */
export function parseKeyframes(source: string, ease = 'ease'): Keyframes {
  const fallback = parseEase(ease);
  const tracks: Partial<Record<TrackProp, TrackKey[]>> = {};
  let blocks = 0;
  for (const [, selectors, body] of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    blocks += 1;
    const declarations = new Map<string, string>();
    for (const declaration of body.split(';')) {
      const colon = declaration.indexOf(':');
      if (colon > 0) declarations.set(declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim());
    }
    const timing = declarations.get('animation-timing-function');
    const segment = timing ? parseEase(timing) : fallback;
    const values: Partial<Record<TrackProp, number>> = {};
    const transform = declarations.get('transform');
    if (transform !== undefined) Object.assign(values, parseTransform(transform));
    const opacity = declarations.get('opacity');
    if (opacity !== undefined) values.o = Number.parseFloat(opacity);
    const dash = declarations.get('stroke-dashoffset');
    if (dash !== undefined) values.dash = Number.parseFloat(dash);
    for (const stop of selectors.split(',').map(parseStop)) {
      for (const [prop, value] of Object.entries(values) as Array<[TrackProp, number]>) {
        (tracks[prop] ??= []).push([stop, value, segment[0], segment[1], segment[2], segment[3]]);
      }
    }
  }
  if (!blocks) throw new Error('Keyframes are empty');
  for (const track of Object.values(tracks)) track?.sort((a, b) => a[0] - b[0]);
  return tracks;
}

/** CSS cubic-bézier easing at progress `x`; y may overshoot 0–1 like the CSS curve does. */
export function bezierAt(x1: number, y1: number, x2: number, y2: number, x: number): number {
  'worklet';
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  if (x1 === y1 && x2 === y2) return x;
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  let t = x;
  for (let step = 0; step < 8; step += 1) {
    const error = ((ax * t + bx) * t + cx) * t - x;
    if (Math.abs(error) < 1e-5) break;
    const slope = (3 * ax * t + 2 * bx) * t + cx;
    if (Math.abs(slope) < 1e-6) break;
    t -= error / slope;
  }
  if (t < 0 || t > 1 || Math.abs(((ax * t + bx) * t + cx) * t - x) > 1e-3) {
    let low = 0;
    let high = 1;
    t = x;
    for (let step = 0; step < 24; step += 1) {
      const value = ((ax * t + bx) * t + cx) * t;
      if (Math.abs(value - x) < 1e-5) break;
      if (value < x) low = t; else high = t;
      t = (low + high) / 2;
    }
  }
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  return ((ay * t + by) * t + cy) * t;
}

/** Value of `track` at `t` (0–1); `fallback` when the track is absent. */
export function sampleTrack(track: Track | undefined, t: number, fallback: number): number {
  'worklet';
  if (!track || track.length === 0) return fallback;
  const last = track.length - 1;
  if (t <= track[0][0]) return track[0][1];
  if (t >= track[last][0]) return track[last][1];
  for (let index = 0; index < last; index += 1) {
    const from = track[index];
    const to = track[index + 1];
    if (t < to[0]) {
      const span = to[0] - from[0];
      if (span <= 0) return to[1];
      return from[1] + (to[1] - from[1]) * bezierAt(from[2], from[3], from[4], from[5], (t - from[0]) / span);
    }
  }
  return track[last][1];
}

/** A one-shot animation: keyframes played over `duration` ms after `delay` ms, holding both ends. */
export type TimedFrames = Readonly<{ frames: Keyframes; duration: number; delay?: number }>;

export function timed(frames: Keyframes, duration: number, delay = 0): TimedFrames {
  return { frames, duration, delay };
}

/** Samples a one-shot animation `elapsed` ms after it started; `fallback` when absent. */
export function sampleTimed(part: TimedFrames | undefined, prop: TrackProp, elapsed: number, fallback: number): number {
  'worklet';
  if (!part) return fallback;
  const track = part.frames[prop];
  if (!track) return fallback;
  const progress = (elapsed - (part.delay ?? 0)) / part.duration;
  return sampleTrack(track, progress < 0 ? 0 : progress > 1 ? 1 : progress, fallback);
}

/** Samples a repeating animation (`alternate` plays every other cycle backwards, as in CSS). */
export function sampleLoop(frames: Keyframes, prop: TrackProp, elapsed: number, period: number, fallback: number, alternate = false): number {
  'worklet';
  const track = frames[prop];
  if (!track) return fallback;
  const cycles = elapsed / period;
  const whole = Math.floor(cycles);
  let progress = cycles - whole;
  if (alternate && whole % 2 === 1) progress = 1 - progress;
  return sampleTrack(track, progress, fallback);
}
