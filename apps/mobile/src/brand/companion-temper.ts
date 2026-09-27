import { parseKeyframes as kf, timed, type TimedFrames } from './companion-keyframes';

/**
 * Tap reactions for the loading Companion (owner-approved "一只有脾气的猫" prototype, 2026-09-27).
 * A tap presses the cat like a soft toy and plays one bold flavour; rapid taps follow a real cat's
 * over-stimulation cues (airplane ears, narrowed eyes) before a claw swipe and a sulk; a long press
 * is petting. Keyframes are the prototype's own.
 */
export type CompanionFlavour = 'hop' | 'wink' | 'ears' | 'tilt' | 'wow' | 'nuzzle' | 'hmph' | 'rage';
/** `glad` is the success exit: the cat smiles while its loader fades away. */
export type CompanionMood = 'calm' | 'annoyed' | 'angry' | 'sulk' | 'pet' | 'glad';
/** Companion layers, the right eye, the ^ ^ eyes and the manga marks (漫符) a reaction can drive. */
export type ReactionLayer = 'body' | 'earL' | 'earR' | 'gaze' | 'blink' | 'eyeR' | 'happy'
  | 'heart1' | 'heart2' | 'spark' | 'note' | 'question' | 'bang';
export type Reaction = Readonly<Partial<Record<ReactionLayer, TimedFrames>>>;

const HEART_UP = kf('0%{opacity:0;transform:translate(0,6px) scale(.3)}22%{opacity:1;transform:translate(0,0) scale(1.2)}40%{transform:translate(1px,-4px) scale(1)}100%{opacity:0;transform:translate(6px,-22px) scale(.85)}', 'ease-out');
const MARK_POP = kf('0%{opacity:0;transform:scale(.2)}18%{opacity:1;transform:scale(1.3)}30%,75%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(.9) translate(0,-4px)}', 'ease-out');
const EYES_OFF = kf('0%{transform:scaleY(1)}10%,86%{transform:scaleY(0)}100%{transform:scaleY(1)}', 'ease-out');
const HAPPY_ON = kf('0%,8%{opacity:0}14%,84%{opacity:1}92%,100%{opacity:0}', 'ease-out');

export const REACTIONS: Readonly<Record<CompanionFlavour, Reaction>> = {
  hop: {
    body: timed(kf('0%{transform:translate(0,0) scale(1,1)}12%{transform:translate(0,2px) scale(1.08,.88)}38%{transform:translate(0,-18px) scale(.94,1.08)}62%{transform:translate(0,0) scale(1.1,.88)}78%{transform:translate(0,-4px) scale(.98,1.03)}100%{transform:translate(0,0) scale(1,1)}', 'ease-out'), 720),
    blink: timed(EYES_OFF, 950),
    happy: timed(HAPPY_ON, 950),
    earL: timed(kf('0%{transform:rotate(0)}25%{transform:rotate(-16deg)}55%{transform:rotate(5deg)}100%{transform:rotate(0)}', 'ease-out'), 700),
    earR: timed(kf('0%{transform:rotate(0)}25%{transform:rotate(16deg)}55%{transform:rotate(-5deg)}100%{transform:rotate(0)}', 'ease-out'), 700),
    heart1: timed(HEART_UP, 1_100, 100),
    heart2: timed(HEART_UP, 1_100, 280),
  },
  wink: {
    eyeR: timed(kf('0%{transform:scaleY(1)}14%,70%{transform:scaleY(.07)}100%{transform:scaleY(1)}', 'ease-out'), 800),
    body: timed(kf('0%{transform:rotate(0)}20%,70%{transform:rotate(10deg)}100%{transform:rotate(0)}', 'ease-out'), 800),
    spark: timed(kf('0%{opacity:0;transform:scale(.2) rotate(0)}25%{opacity:1;transform:scale(1.35) rotate(45deg)}60%{opacity:1;transform:scale(1) rotate(90deg)}100%{opacity:0;transform:scale(.6) rotate(120deg)}', 'ease-out'), 850, 80),
  },
  ears: {
    earL: timed(kf('0%{transform:rotate(0)}14%{transform:rotate(-28deg)}28%{transform:rotate(9deg)}42%{transform:rotate(-24deg)}56%{transform:rotate(7deg)}72%{transform:rotate(-12deg)}100%{transform:rotate(0)}', 'ease-out'), 660),
    earR: timed(kf('0%{transform:rotate(0)}14%{transform:rotate(28deg)}28%{transform:rotate(-9deg)}42%{transform:rotate(24deg)}56%{transform:rotate(-7deg)}72%{transform:rotate(12deg)}100%{transform:rotate(0)}', 'ease-out'), 660, 60),
    body: timed(kf('0%{transform:translate(0,0)}20%{transform:translate(0,-5px)}40%{transform:translate(0,0)}60%{transform:translate(0,-4px)}80%,100%{transform:translate(0,0)}', 'ease-out'), 660),
    note: timed(kf('0%{opacity:0;transform:translate(0,4px) scale(.4) rotate(-10deg)}25%{opacity:1;transform:translate(0,0) scale(1.15) rotate(8deg)}100%{opacity:0;transform:translate(8px,-16px) scale(.9) rotate(-6deg)}', 'ease-out'), 950),
  },
  tilt: {
    body: timed(kf('0%{transform:rotate(0)}20%,72%{transform:rotate(17deg)}100%{transform:rotate(0)}', 'ease-out'), 950),
    gaze: timed(kf('0%{transform:translate(0,0)}20%,72%{transform:translate(3px,-1px)}100%{transform:translate(0,0)}', 'ease-out'), 950),
    question: timed(MARK_POP, 950),
  },
  wow: {
    blink: timed(kf('0%{transform:scaleY(1)}16%,66%{transform:scaleY(1.42)}100%{transform:scaleY(1)}', 'ease-out'), 800),
    body: timed(kf('0%{transform:translate(0,0)}30%{transform:translate(0,-11px) scale(.96,1.06)}60%{transform:translate(0,0) scale(1.06,.93)}100%{transform:translate(0,0)}', 'ease-out'), 500),
    earL: timed(kf('0%{transform:rotate(0)}20%,55%{transform:rotate(-15deg)}100%{transform:rotate(0)}', 'ease-out'), 700),
    earR: timed(kf('0%{transform:rotate(0)}20%,55%{transform:rotate(15deg)}100%{transform:rotate(0)}', 'ease-out'), 700),
    bang: timed(MARK_POP, 900),
  },
  nuzzle: {
    body: timed(kf('0%{transform:rotate(0)}16%{transform:rotate(-12deg)}36%{transform:rotate(11deg)}56%{transform:rotate(-8deg)}76%{transform:rotate(5deg)}100%{transform:rotate(0)}', 'ease-out'), 950),
    blink: timed(EYES_OFF, 950),
    happy: timed(HAPPY_ON, 950),
    heart1: timed(HEART_UP, 1_100, 220),
  },
  hmph: {
    body: timed(kf('0%{transform:rotate(0)}20%{transform:rotate(-8deg)}45%{transform:rotate(7deg)}70%{transform:rotate(-3deg)}100%{transform:rotate(0)}', 'ease-out'), 340),
  },
  rage: {
    body: timed(kf('0%{transform:rotate(0) scale(1)}20%{transform:rotate(-8deg) scale(1.04)}40%{transform:rotate(8deg) scale(1.06)}60%{transform:rotate(-6deg) scale(1.08,.94)}100%{transform:rotate(0) scale(1.03)}', 'ease-out'), 340),
  },
};

/** Worklets address reactions by index; 0 is "none". */
export const REACTION_ORDER: ReadonlyArray<CompanionFlavour> = ['hop', 'wink', 'ears', 'tilt', 'wow', 'nuzzle', 'hmph', 'rage'];
export const REACTION_TABLE: ReadonlyArray<Reaction | null> = [null, ...REACTION_ORDER.map((flavour) => REACTIONS[flavour])];
/** Longer than every reaction, so an idle reaction clock rests past its end. */
export const REACTION_MS = 1_400;

/** Every tap first squashes the head like a soft toy, whatever the flavour. */
export const PRESS = timed(kf('0%{transform:scale(1,1)}26%{transform:scale(1.15,.8)}60%{transform:scale(.95,1.07)}100%{transform:scale(1,1)}', 'ease-out'), 340);

export type MoodPose = Readonly<{ earL: number; earR: number; blink: number; eyeL: number; eyeR: number; body: number; gazeX: number; gazeY: number; happy: number }>;
const REST: MoodPose = { earL: 0, earR: 0, blink: 1, eyeL: 0, eyeR: 0, body: 0, gazeX: 0, gazeY: 0, happy: 0 };
/** Held poses over the scene loop: ear and eye angles in degrees, blink as eye height, gaze in Companion units. */
export const MOOD_POSES: Readonly<Record<CompanionMood, MoodPose>> = {
  calm: REST,
  annoyed: { ...REST, earL: -24, earR: 24, blink: 0.6, eyeL: 14, eyeR: -14 },
  angry: { ...REST, earL: -36, earR: 36, blink: 0.36, eyeL: 28, eyeR: -28 },
  sulk: { ...REST, body: -12, gazeX: -6, gazeY: 1, blink: 0.42, earL: -18, earR: 18 },
  pet: { ...REST, earL: -9, earR: 9, blink: 0, body: 6, happy: 1 },
  glad: { ...REST, earL: -6, earR: 6, blink: 0, happy: 1 },
};
export const MOOD_ORDER: ReadonlyArray<CompanionMood> = ['calm', 'annoyed', 'angry', 'sulk', 'pet', 'glad'];

/** Loops that play while a mood holds (alternate ones ping-pong like CSS `alternate`). */
export const MOOD_LOOPS = {
  vein: { frames: kf('from{transform:scale(.8)}to{transform:scale(1.15)}', 'ease-in-out'), period: 450 },
  purr: { frames: kf('from{transform:translate(-.6px,0)}to{transform:translate(.6px,0)}', 'linear'), period: 70 },
  purrLines: { frames: kf('from{transform:translate(0,-1.2px)}to{transform:translate(0,1.2px)}', 'linear'), period: 200 },
  hearts: { frames: kf('0%{opacity:0;transform:translate(0,6px) scale(.3)}20%{opacity:1;transform:translate(0,0) scale(1.15)}100%{opacity:0;transform:translate(5px,-22px) scale(.8)}'), period: 1_200 },
} as const;
const DOT = kf('from{opacity:0;transform:translate(0,3px)}to{opacity:1;transform:translate(0,0)}');
/** "…" appears one dot at a time while the cat sulks. */
export const SULK_DOTS: ReadonlyArray<TimedFrames> = [timed(DOT, 250, 200), timed(DOT, 250, 550), timed(DOT, 250, 900)];

const DRAW = kf('from{stroke-dashoffset:1}to{stroke-dashoffset:0}', 'ease-out');
/** The swipe across the glass: a paw sweep, three scratches that stay a beat, and a shake. */
export const CLAW = {
  fade: timed(kf('0%{opacity:1}70%{opacity:1}100%{opacity:0}'), 1_500),
  paw: timed(kf('0%{transform:translate(275px,-277px)}100%{transform:translate(-335px,393px)}', 'cubic-bezier(.5,0,.8,.6)'), 260),
  scratches: [timed(DRAW, 130, 70), timed(DRAW, 130, 100), timed(DRAW, 130, 130)],
  shake: timed(kf('0%{transform:translate(0,0)}15%{transform:translate(-8px,3px)}35%{transform:translate(7px,-3px)}55%{transform:translate(-5px,2px)}75%{transform:translate(3px,-1px)}100%{transform:translate(0,0)}', 'ease-out'), 340),
} as const;
export const CLAW_MS = 1_500;

/** Taps inside this window count as "rapid"; each quiet step afterwards forgives one tap. */
export const TEMPER_TIMING = { forgiveAfter: 650, forgiveEvery: 380, angryFor: 420, sulkFor: 1_880, petAfter: 450 } as const;
/** From this many rapid taps the cat warns before it snaps. */
export const TEMPER_WARNING = 3;

export type Temper = Readonly<{ irritation: number; limit: number; mood: CompanionMood; last: CompanionFlavour | null }>;
export type PokeOutcome = Readonly<{ temper: Temper; reaction: CompanionFlavour; swipe: boolean }>;

/** Happy flavours come up more often (owner feedback 2026-09-27: make the happy feedback obvious). */
const FLAVOUR_WEIGHTS: ReadonlyArray<readonly [CompanionFlavour, number]> = [
  ['hop', 3], ['nuzzle', 2], ['wink', 2], ['ears', 2], ['tilt', 1], ['wow', 1],
];

function patienceLimit(random: () => number): number {
  // Five to seven rapid taps, so nobody can predict the snap.
  return 5 + Math.min(2, Math.floor(random() * 3));
}

export function newTemper(random: () => number = Math.random): Temper {
  return { irritation: 0, limit: patienceLimit(random), mood: 'calm', last: null };
}

function pickFlavour(last: CompanionFlavour | null, random: () => number): CompanionFlavour {
  const choices = FLAVOUR_WEIGHTS.filter(([flavour]) => flavour !== last);
  const total = choices.reduce((sum, [, weight]) => sum + weight, 0);
  let remaining = random() * total;
  for (const [flavour, weight] of choices) {
    remaining -= weight;
    if (remaining < 0) return flavour;
  }
  return choices[choices.length - 1][0];
}

/** One tap. `found` means the tap brought a hidden cat out, which always reads as surprise. */
export function pokeTemper(temper: Temper, options: Readonly<{ found?: boolean; random?: () => number }> = {}): PokeOutcome {
  const random = options.random ?? Math.random;
  if (temper.mood === 'angry' || temper.mood === 'sulk') return { temper, reaction: 'hmph', swipe: false };
  const irritation = temper.irritation + 1;
  if (irritation >= temper.limit) {
    return { temper: { irritation: 0, limit: patienceLimit(random), mood: 'angry', last: temper.last }, reaction: 'rage', swipe: true };
  }
  if (irritation >= TEMPER_WARNING) return { temper: { ...temper, irritation, mood: 'annoyed' }, reaction: 'hmph', swipe: false };
  const reaction = options.found ? 'wow' : pickFlavour(temper.last, random);
  return { temper: { ...temper, irritation, mood: 'calm', last: reaction }, reaction, swipe: false };
}

/** One forgiving step after a quiet moment; held moods are left to their own timers. */
export function forgiveTemper(temper: Temper): Temper {
  if (temper.irritation === 0 || temper.mood === 'angry' || temper.mood === 'sulk' || temper.mood === 'pet') return temper;
  const irritation = temper.irritation - 1;
  return { ...temper, irritation, mood: irritation >= TEMPER_WARNING ? 'annoyed' : 'calm' };
}

export function sulkTemper(temper: Temper): Temper {
  return temper.mood === 'angry' ? { ...temper, mood: 'sulk' } : temper;
}

export function calmTemper(temper: Temper): Temper {
  return temper.mood === 'calm' ? temper : { ...temper, irritation: 0, mood: 'calm' };
}

/** The wait succeeded: whatever the mood, the cat smiles on its way out. */
export function gladTemper(temper: Temper): Temper {
  return temper.mood === 'glad' ? temper : { ...temper, irritation: 0, mood: 'glad' };
}

/** Petting forgives everything; a cat that is still angry or sulking will not be petted yet. */
export function petTemper(temper: Temper): Temper {
  if (temper.mood === 'angry' || temper.mood === 'sulk') return temper;
  return { ...temper, irritation: 0, mood: 'pet' };
}
