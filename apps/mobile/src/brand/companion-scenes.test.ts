import { sampleTrack, type Keyframes } from './companion-keyframes';
import { COMPACT_SCENE_POOL, FETCH, LISTEN, PEEK, POUNCE, rollScene, SCENE_POOL, YARN, type CompanionSceneKey } from './companion-scenes';

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

describe('scene pool', () => {
  it('keeps Pounce rare and never repeats the previous scene', () => {
    const random = seeded(7);
    const counts = new Map<CompanionSceneKey, number>();
    let previous: CompanionSceneKey | null = null;
    for (let index = 0; index < 20_000; index += 1) {
      const scene = rollScene(SCENE_POOL, previous, random);
      expect(scene).not.toBe(previous);
      counts.set(scene, (counts.get(scene) ?? 0) + 1);
      previous = scene;
    }
    const share = (scene: CompanionSceneKey) => (counts.get(scene) ?? 0) / 20_000;
    // Excluding the previous pick renormalises the rest: Pounce settles near 11 %, the others near 22 %.
    expect(share('pounce')).toBeGreaterThan(0.09);
    expect(share('pounce')).toBeLessThan(0.13);
    for (const scene of ['peek', 'fetch', 'yarn', 'listen'] as const) {
      expect(share(scene)).toBeGreaterThan(0.2);
      expect(share(scene)).toBeLessThan(0.245);
    }
  });

  it('alternates the two compact scenes in sheets', () => {
    expect(rollScene(COMPACT_SCENE_POOL, 'peek', () => 0.99)).toBe('listen');
    expect(rollScene(COMPACT_SCENE_POOL, 'listen', () => 0)).toBe('peek');
    expect(new Set(COMPACT_SCENE_POOL.map(([scene]) => scene))).toEqual(new Set(['peek', 'listen']));
  });

  it('still answers when the pool has a single scene', () => {
    expect(rollScene([['peek', 1]], 'peek', () => 0.5)).toBe('peek');
  });
});

describe('approved choreography', () => {
  const loops: ReadonlyArray<readonly [string, Keyframes]> = [
    ['peek rig', PEEK.rig], ['peek paws', PEEK.paws], ...Object.entries(PEEK.cat),
    ['fetch left', FETCH.left], ['fetch right', FETCH.right], ['fetch mound', FETCH.mound], ['fetch fish', FETCH.fish],
    ...Object.entries(FETCH.leftCat), ...Object.entries(FETCH.rightCat),
    ['yarn ball', YARN.ball], ['yarn thread', YARN.thread], ['yarn paw', YARN.paw], ...Object.entries(YARN.cat),
    ['pounce cursor', POUNCE.cursor], ['pounce rig', POUNCE.rig], ['pounce shadow', POUNCE.shadow], ...Object.entries(POUNCE.cat),
    ['listen pong', LISTEN.pong], ...LISTEN.ringsL.map((frames, index) => [`listen left ${index}`, frames] as const),
    ...LISTEN.ringsR.map((frames, index) => [`listen right ${index}`, frames] as const), ...Object.entries(LISTEN.cat),
  ] as ReadonlyArray<readonly [string, Keyframes]>;

  it.each(loops)('%s loops without a visible jump', (_name, frames) => {
    // A layer that is fully transparent at the seam may reset its position there, as in the prototype.
    const hiddenAtSeam = frames.o !== undefined && sampleTrack(frames.o, 0, 1) === 0 && sampleTrack(frames.o, 1, 1) === 0;
    for (const [prop, track] of Object.entries(frames)) {
      expect(track?.[0][0]).toBe(0);
      expect(track?.[track.length - 1][0]).toBe(1);
      if (hiddenAtSeam && prop !== 'o') continue;
      expect(sampleTrack(track, 1, NaN)).toBeCloseTo(sampleTrack(track, 0, NaN), 5);
    }
  });

  it('keeps every scene loop within a few seconds so the first beat lands early', () => {
    for (const loop of [PEEK.loop, FETCH.loop, YARN.loop, POUNCE.loop, LISTEN.loop]) {
      expect(loop).toBeGreaterThanOrEqual(4_000);
      expect(loop).toBeLessThanOrEqual(10_000);
    }
  });
});
