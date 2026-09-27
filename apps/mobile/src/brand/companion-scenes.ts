import { parseKeyframes as kf, timed, type Keyframes } from './companion-keyframes';

/**
 * The owner-approved loading scenes (2026-09-27 design canvas, "Clawket 等待动效方案").
 * Keyframes are the prototype's own, unit for unit: stage layers move in stage points of a
 * 280 × 170 stage, Companion layers in the 94 × 88 geometry of `companion.json`.
 */
export type CompanionSceneKey = 'peek' | 'fetch' | 'yarn' | 'pounce' | 'listen';

/** Companion layers a scene or reaction may drive. */
export type ActorFrames = Readonly<Partial<Record<'body' | 'earL' | 'earR' | 'gaze' | 'blink', Keyframes>>>;

/** Page scenes and their share of entries (owner decision 2026-09-27: Pounce is the rare one). */
export const SCENE_POOL: ReadonlyArray<readonly [CompanionSceneKey, number]> = [
  ['peek', 22.5], ['fetch', 22.5], ['yarn', 22.5], ['listen', 22.5], ['pounce', 10],
];
/** Sheets are too small for the wide scenes; they alternate between the two compact ones. */
export const COMPACT_SCENE_POOL: ReadonlyArray<readonly [CompanionSceneKey, number]> = [['peek', 1], ['listen', 1]];

/** Weighted pick that never repeats the previous scene (the next pick renormalises the rest). */
export function rollScene(
  pool: ReadonlyArray<readonly [CompanionSceneKey, number]>,
  previous: CompanionSceneKey | null,
  random: () => number = Math.random,
): CompanionSceneKey {
  const candidates = pool.filter(([key]) => key !== previous);
  const choices = candidates.length ? candidates : pool;
  const total = choices.reduce((sum, [, weight]) => sum + weight, 0);
  let remaining = random() * total;
  for (const [key, weight] of choices) {
    remaining -= weight;
    if (remaining < 0) return key;
  }
  return choices[choices.length - 1][0];
}

export const STAGE = { width: 280, height: 170 } as const;
/** Pounce jumps higher, so its stage is ten points taller. */
export const POUNCE_STAGE_HEIGHT = 180;

export const PEEK = {
  loop: 7_200,
  rig: kf(`0%,6%{transform:translate(0,80px);animation-timing-function:cubic-bezier(.2,.9,.3,1.25)} 10%{transform:translate(0,44px)} 12.5%,15%{transform:translate(0,48px);animation-timing-function:cubic-bezier(.2,.8,.3,1.15)} 19%{transform:translate(0,16px)} 21.5%,37%{transform:translate(0,19px);animation-timing-function:cubic-bezier(.55,0,.9,.4)} 40%{transform:translate(0,84px)} 40.01%,45%{transform:translate(46px,84px);animation-timing-function:cubic-bezier(.2,1,.3,1.3)} 48%{transform:translate(46px,1px)} 51%,64%{transform:translate(46px,8px);animation-timing-function:cubic-bezier(.55,0,.9,.4)} 67%{transform:translate(46px,84px)} 67.01%,73%{transform:translate(-46px,84px);animation-timing-function:cubic-bezier(.3,.7,.4,1)} 79%{transform:translate(-46px,32px)} 81%,90%{transform:translate(-46px,29px);animation-timing-function:cubic-bezier(.55,0,.9,.4)} 93%{transform:translate(-46px,84px)} 93.01%,100%{transform:translate(0,80px)}`),
  paws: kf(`0%,19.5%{transform:translate(0,4px);opacity:0} 21.5%,37%{transform:translate(0,0);opacity:1} 39%{transform:translate(0,5px);opacity:0} 39.01%,48.5%{transform:translate(46px,5px);opacity:0} 50.5%,64%{transform:translate(46px,0);opacity:1} 66%{transform:translate(46px,5px);opacity:0} 66.01%,100%{transform:translate(-46px,5px);opacity:0}`),
  cat: { gaze: kf(`0%,21%{transform:translate(0,0)} 23%,25.5%{transform:translate(-4px,0)} 27.5%,30%{transform:translate(4px,0)} 31.5%,54%{transform:translate(0,0)} 56.5%,62%{transform:translate(-4px,1px)} 64%,77%{transform:translate(0,0)} 80%,89%{transform:translate(4px,-1px)} 92%,100%{transform:translate(0,0)}`), blink: kf(`0%,31.5%{transform:scaleY(1);animation-timing-function:ease-in-out} 34%,35.5%{transform:scaleY(.1);animation-timing-function:ease-in-out} 38.5%,47%{transform:scaleY(1)} 48.5%{transform:scaleY(1.2)} 52%,84%{transform:scaleY(1)} 85%{transform:scaleY(.1)} 86.5%,100%{transform:scaleY(1)}`), earL: kf(`0%,9%{transform:rotate(0)}10.5%{transform:rotate(-11deg)}12%{transform:rotate(3deg)}13.5%,47%{transform:rotate(0)} 48.5%{transform:rotate(-13deg)}51%,86%{transform:rotate(0)}87%{transform:rotate(-9deg)}88.5%,100%{transform:rotate(0)}`), earR: kf(`0%,10%{transform:rotate(0)}11.5%{transform:rotate(11deg)}13%{transform:rotate(-3deg)}14.5%,47%{transform:rotate(0)} 48.5%{transform:rotate(13deg)}51%,81%{transform:rotate(0)}82%{transform:rotate(9deg)}83.5%,100%{transform:rotate(0)}`), body: kf(`0%,52%{transform:rotate(0)}55%,62%{transform:rotate(-9deg)}65%,79%{transform:rotate(0)}81.5%,90%{transform:rotate(7deg)}92%,100%{transform:rotate(0)}`) } as ActorFrames,
  /** A tap on the hidden cat brings it out to look at you. */
  wake: { rig: timed(kf(`0%{transform:translate(0,84px)}60%{transform:translate(0,1px)}100%{transform:translate(0,6px)}`, 'cubic-bezier(.2,1,.3,1.3)'), 420), paws: timed(kf(`0%,45%{opacity:0;transform:translate(0,5px)}80%,100%{opacity:1;transform:translate(0,0)}`), 420) },
} as const;

export const FETCH = {
  loop: 9_600,
  left: kf(`0%,1%{transform:translate(0,72px);animation-timing-function:cubic-bezier(.2,1,.3,1.3)} 3.5%,10%{transform:translate(0,18px);animation-timing-function:ease-out} 11.2%{transform:translate(0,11px);animation-timing-function:cubic-bezier(.6,0,.9,.5)} 13%{transform:translate(0,74px)} 13.01%,51%{transform:translate(0,72px);animation-timing-function:cubic-bezier(.2,1,.3,1.3)} 53.5%,60%{transform:translate(0,18px);animation-timing-function:ease-out} 61.2%{transform:translate(0,11px);animation-timing-function:cubic-bezier(.6,0,.9,.5)} 63%{transform:translate(0,74px)} 63.01%,100%{transform:translate(0,72px)}`),
  right: kf(`0%,24%{transform:translate(0,72px);animation-timing-function:cubic-bezier(.2,1,.3,1.3)} 26.5%{transform:translate(0,18px)} 28.5%{transform:translate(0,21px)}29.3%{transform:translate(0,18px)}30.1%{transform:translate(0,21px)}30.9%,37%{transform:translate(0,18px);animation-timing-function:ease-out} 37.8%{transform:translate(0,11px);animation-timing-function:cubic-bezier(.6,0,.9,.5)} 39.5%{transform:translate(0,74px)} 39.51%,74%{transform:translate(0,72px);animation-timing-function:cubic-bezier(.2,1,.3,1.3)} 76.5%,84%{transform:translate(0,-2px);animation-timing-function:ease-out} 86.8%{transform:translate(0,11px);animation-timing-function:cubic-bezier(.6,0,.9,.5)} 89%{transform:translate(0,74px)} 89.01%,100%{transform:translate(0,72px)}`),
  leftCat: { gaze: kf(`0%,3%{transform:translate(0,0)}5%,12%{transform:translate(4px,-1px)}14%,53%{transform:translate(0,0)}55%,62%{transform:translate(4px,-1px)}64%,100%{transform:translate(0,0)}`), earR: kf(`0%,5%{transform:rotate(0)}6.2%{transform:rotate(12deg)}7.4%{transform:rotate(-2deg)}8.4%,55%{transform:rotate(0)}56.2%{transform:rotate(12deg)}57.4%{transform:rotate(-2deg)}58.4%,100%{transform:rotate(0)}`) } as ActorFrames,
  rightCat: { gaze: kf(`0%,27%{transform:translate(0,0)}28.5%,31%{transform:translate(-4px,0)}32.5%,35.5%{transform:translate(4px,0)}37%,77%{transform:translate(0,2px)}79%,82%{transform:translate(0,2px)}84%,100%{transform:translate(0,0)}`), blink: kf(`0%,76.5%{transform:scaleY(1)}77.5%{transform:scaleY(.5)}79%,84%{transform:scaleY(.5)}85%,100%{transform:scaleY(1)}`), body: kf(`0%,79%{transform:rotate(0)}80%{transform:rotate(-8deg)}81%{transform:rotate(7deg)}82%{transform:rotate(-6deg)}83%{transform:rotate(4deg)}84%,100%{transform:rotate(0)}`) } as ActorFrames,
  mound: kf(`0%,13.4%{opacity:0;transform:translate(63px,0)} 13.5%{opacity:1;transform:translate(63px,0)} 16%{transform:translate(95px,-2px)}18.5%{transform:translate(127px,0)}21%{transform:translate(159px,-2px)} 23.5%{opacity:1;transform:translate(191px,0)} 23.6%,39.9%{opacity:0;transform:translate(191px,0)} 40%{opacity:1;transform:translate(191px,0)} 42.5%{transform:translate(159px,-2px)}45%{transform:translate(127px,0)}47.5%{transform:translate(95px,-2px)} 49.9%{opacity:1;transform:translate(63px,0)} 50%,63.4%{opacity:0;transform:translate(63px,0)} 63.5%{opacity:1;transform:translate(63px,0)} 66%{transform:translate(95px,-2px)}68.5%{transform:translate(127px,0)}71%{transform:translate(159px,-2px)} 73.5%{opacity:1;transform:translate(191px,0)} 73.6%,89.9%{opacity:0;transform:translate(191px,0)} 90%{opacity:1;transform:translate(191px,0)} 92.5%{transform:translate(159px,-2px)}95%{transform:translate(127px,0)}97.5%{transform:translate(95px,-2px)} 99.9%{opacity:1;transform:translate(63px,0)} 100%{opacity:0;transform:translate(63px,0)}`),
  dirt: kf(`0%{opacity:0;transform:translate(0,4px)}40%{opacity:1;transform:translate(0,-3px)}100%{opacity:0;transform:translate(0,2px)}`),
  dirtPeriod: 360,
  fish: kf(`0%,76%{opacity:0;transform:translate(0,14px) rotate(0)} 77.5%,83.8%{opacity:1;transform:translate(0,0) rotate(0);animation-timing-function:cubic-bezier(.2,.6,.4,1)} 87.5%{opacity:1;transform:translate(46px,-66px) rotate(-220deg)} 89.5%,100%{opacity:0;transform:translate(58px,-78px) rotate(-300deg)}`),
  wake: { right: timed(kf(`0%{transform:translate(0,74px)}60%{transform:translate(0,4px)}100%{transform:translate(0,10px)}`, 'cubic-bezier(.2,1,.3,1.3)'), 420) },
} as const;

export const YARN = {
  loop: 4_400,
  ball: kf(`0%,14.6%{transform:translate(0,0) rotate(0);animation-timing-function:cubic-bezier(.12,.75,.3,1)} 36%{transform:translate(91px,0) rotate(474deg);animation-timing-function:ease-in-out} 38.5%{transform:translate(86px,0) rotate(448deg)}41%{transform:translate(90px,0) rotate(469deg)} 43%,45%{transform:translate(88px,0) rotate(459deg);animation-timing-function:cubic-bezier(.45,0,.35,1)} 71%,100%{transform:translate(0,0) rotate(0)}`),
  thread: kf(`0%,14.6%{stroke-dashoffset:93;animation-timing-function:cubic-bezier(.12,.75,.3,1)} 36%{stroke-dashoffset:2;animation-timing-function:ease-in-out} 38.5%{stroke-dashoffset:7}41%{stroke-dashoffset:3} 43%,45%{stroke-dashoffset:5;animation-timing-function:cubic-bezier(.45,0,.35,1)} 71%,100%{stroke-dashoffset:93}`),
  paw: kf(`0%,9%{opacity:0;transform:translate(-8px,2px) rotate(0)}11%{opacity:1;transform:translate(-4px,0) rotate(8deg)}14.6%{opacity:1;transform:translate(16px,-2px) rotate(-14deg)}18%{opacity:1;transform:translate(2px,0) rotate(0)}21%,100%{opacity:0;transform:translate(-8px,2px) rotate(0)}`),
  cat: { body: kf(`0%,6%{transform:rotate(0)}12%{transform:rotate(5deg)}15%{transform:rotate(9deg)}22%,36%{transform:rotate(6deg)}40%{transform:rotate(9deg)}48%,64%{transform:rotate(-4deg)}72%,100%{transform:rotate(0)}`), gaze: kf(`0%,4%{transform:translate(0,0)}8%,15%{transform:translate(3px,2px)}24%,44%{transform:translate(4px,1px)}58%{transform:translate(4px,2px)}70%,80%{transform:translate(2px,2px)}86%,100%{transform:translate(0,0)}`), blink: kf(`0%,38%{transform:scaleY(1)}40%{transform:scaleY(1.18)}44%,84%{transform:scaleY(1)}85.5%{transform:scaleY(.1)}87%,100%{transform:scaleY(1)}`), earL: kf(`0%,5%{transform:rotate(0)}9%,15%{transform:rotate(7deg)}20%,40%{transform:rotate(0)}41.5%{transform:rotate(-10deg)}44%,100%{transform:rotate(0)}`), earR: kf(`0%,5%{transform:rotate(0)}9%,15%{transform:rotate(-7deg)}20%,39%{transform:rotate(0)}40.5%{transform:rotate(11deg)}43%,100%{transform:rotate(0)}`) } as ActorFrames,
} as const;

export const POUNCE = {
  loop: 4_800,
  cursor: kf(`0%{transform:translate(206px,30px);animation-timing-function:cubic-bezier(.2,.8,.2,1)} 4%{transform:translate(52px,50px)}8%{transform:translate(56px,46px)} 11%{transform:translate(55px,47px);animation-timing-function:cubic-bezier(.2,.8,.2,1)} 15%,23%{transform:translate(228px,64px);animation-timing-function:cubic-bezier(.2,.8,.2,1)} 27%,37%{transform:translate(206px,128px)}38%{transform:translate(209px,126px)} 39.5%,46.4%{transform:translate(206px,128px);animation-timing-function:cubic-bezier(.1,.9,.2,1)} 48.2%,62%{transform:translate(38px,26px)} 64%{transform:translate(45px,23px)}66%{transform:translate(34px,29px)}68%{transform:translate(43px,24px)} 70%{transform:translate(38px,26px);animation-timing-function:cubic-bezier(.45,0,.25,1)} 82%,88%{transform:translate(128px,18px);animation-timing-function:cubic-bezier(.45,0,.25,1)} 100%{transform:translate(206px,30px)}`),
  rig: kf(`0%,27%{transform:translate(0,0) scale(1,1)} 30%{transform:translate(0,3px) scale(1.05,.92)} 31.5%{transform:translate(-2px,3px) scale(1.05,.92)}33%{transform:translate(2px,3px) scale(1.05,.92)} 34.5%{transform:translate(-2px,3px) scale(1.05,.92)}36%{transform:translate(2px,3px) scale(1.05,.92)} 37.5%{transform:translate(-2px,3px) scale(1.05,.92)}39%{transform:translate(2px,3px) scale(1.05,.92)} 40.5%{transform:translate(-2px,3px) scale(1.05,.92)}42%{transform:translate(0,3px) scale(1.05,.92)} 44%{transform:translate(0,5px) scale(1.09,.85);animation-timing-function:cubic-bezier(.3,0,.6,1)} 46.2%{transform:translate(36px,-42px) scale(.92,1.1) rotate(9deg);animation-timing-function:cubic-bezier(.45,0,.85,.6)} 48.5%{transform:translate(66px,0) scale(1.13,.84) rotate(0)} 51%{transform:translate(66px,0) scale(.97,1.04)} 53%,70%{transform:translate(66px,0) scale(1,1)} 73%{transform:translate(33px,-16px) scale(.97,1.04)} 76%{transform:translate(0,0) scale(1.05,.94)} 78%,100%{transform:translate(0,0) scale(1,1)}`),
  shadow: kf(`0%,42%{transform:translate(0,0) scale(1);opacity:1} 44%{transform:translate(0,0) scale(1.1,1)} 46.2%{transform:translate(36px,0) scale(.55);opacity:.45} 48.5%{transform:translate(66px,0) scale(1.12,1);opacity:1} 53%,70%{transform:translate(66px,0) scale(1)} 73%{transform:translate(33px,0) scale(.8);opacity:.7} 76%,100%{transform:translate(0,0) scale(1);opacity:1}`),
  cat: { body: kf(`0%,2%{transform:rotate(0)}6%,12%{transform:rotate(-5deg)}17%,23%{transform:rotate(5deg)}29%,44%{transform:rotate(3deg)}49%,54%{transform:rotate(0)}56%{transform:rotate(-7deg)}58.5%{transform:rotate(6deg)}61%{transform:rotate(-4deg)}63%,76%{transform:rotate(0)}84%,88%{transform:rotate(-3deg)}96%,100%{transform:rotate(0)}`), gaze: kf(`0%{transform:translate(2px,-2px)}5%,12%{transform:translate(-4px,-2px)}16%,24%{transform:translate(4px,-1px)}28%,46%{transform:translate(4px,2px)}49.5%,72%{transform:translate(-4px,-3px)}83%,90%{transform:translate(0,-3px)}100%{transform:translate(2px,-2px)}`), blink: kf(`0%,10%{transform:scaleY(1)}11%{transform:scaleY(.1)}12.5%,48.5%{transform:scaleY(1)}50%,57%{transform:scaleY(1.22)}60%,90%{transform:scaleY(1)}91%{transform:scaleY(.1)}92.5%,100%{transform:scaleY(1)}`), earL: kf(`0%,3%{transform:rotate(0)}6%,12%{transform:rotate(-10deg)}17%,24%{transform:rotate(4deg)}29%,46%{transform:rotate(8deg)}49.5%,56%{transform:rotate(-15deg)}62%,100%{transform:rotate(0)}`), earR: kf(`0%,3%{transform:rotate(0)}6%,12%{transform:rotate(-3deg)}17%,24%{transform:rotate(10deg)}29%,46%{transform:rotate(-8deg)}49.5%,56%{transform:rotate(15deg)}62%,100%{transform:rotate(0)}`) } as ActorFrames,
} as const;

export const LISTEN = {
  loop: 4_200,
  cat: { earL: kf(`0%{transform:rotate(0)}5%,30%{transform:rotate(-22deg)}36%,70%{transform:rotate(0)}74%,84%{transform:rotate(8deg)}89%,100%{transform:rotate(0)}`), earR: kf(`0%,34%{transform:rotate(0)}39%,62%{transform:rotate(22deg)}68%,70%{transform:rotate(0)}74%,84%{transform:rotate(-8deg)}89%,100%{transform:rotate(0)}`), body: kf(`0%{transform:rotate(0)}6%,30%{transform:rotate(-4deg)}36%{transform:rotate(0)}40%,62%{transform:rotate(4deg)}68%,70%{transform:rotate(0)}75%,84%{transform:rotate(11deg)}91%,100%{transform:rotate(0)}`), gaze: kf(`0%{transform:translate(0,0)}6%,30%{transform:translate(-4px,0)}36%{transform:translate(0,0)}40%,62%{transform:translate(4px,0)}68%,70%{transform:translate(0,0)}75%,84%{transform:translate(2px,-2px)}91%,100%{transform:translate(0,0)}`), blink: kf(`0%,72%{transform:scaleY(1)}75%,84%{transform:scaleY(1.14)}88%{transform:scaleY(1)}89.5%{transform:scaleY(.1)}91%,100%{transform:scaleY(1)}`) } as ActorFrames,
  ringsL: [kf(`0%,8%{opacity:0;transform:scale(.4)}12%{opacity:.85}27%,100%{opacity:0;transform:scale(1.7)}`), kf(`0%,15%{opacity:0;transform:scale(.4)}19%{opacity:.85}34%,100%{opacity:0;transform:scale(1.7)}`)],
  ringsR: [kf(`0%,42%{opacity:0;transform:scale(.4)}46%{opacity:.85}61%,100%{opacity:0;transform:scale(1.7)}`), kf(`0%,49%{opacity:0;transform:scale(.4)}53%{opacity:.85}68%,100%{opacity:0;transform:scale(1.7)}`)],
  pong: kf(`0%,64%{opacity:0;transform:translate(26px,0) scale(1.5)}68%{opacity:.8}74%,100%{opacity:0;transform:translate(-18px,0) scale(.5)}`),
} as const;
