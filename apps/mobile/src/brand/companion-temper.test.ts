import {
  calmTemper, forgiveTemper, MOOD_ORDER, MOOD_POSES, newTemper, petTemper, pokeTemper, REACTION_MS, REACTION_ORDER, REACTION_TABLE,
  REACTIONS, sulkTemper, TEMPER_WARNING, type CompanionFlavour, type Temper,
} from './companion-temper';

const always = (value: number) => () => value;

describe('tap reactions', () => {
  it('answers the first taps with happy flavours and never repeats one twice in a row', () => {
    let temper: Temper = { ...newTemper(always(0)), limit: 7 };
    const seen: CompanionFlavour[] = [];
    for (let index = 0; index < 2; index += 1) {
      const outcome = pokeTemper(temper, { random: always(0) });
      expect(outcome.swipe).toBe(false);
      seen.push(outcome.reaction);
      temper = outcome.temper;
    }
    // Hop carries the most weight; the next pick skips it.
    expect(seen).toEqual(['hop', 'nuzzle']);
    expect(temper).toMatchObject({ irritation: 2, mood: 'calm', last: 'nuzzle' });
  });

  it('greets the tap that found a hidden cat with surprise', () => {
    expect(pokeTemper(newTemper(always(0)), { found: true, random: always(0.5) }).reaction).toBe('wow');
  });

  it('warns with airplane ears before snapping at the patience limit, then resets', () => {
    let temper: Temper = { irritation: 0, limit: 5, mood: 'calm', last: null };
    const moods: string[] = [];
    let swipe = false;
    for (let index = 0; index < 5; index += 1) {
      const outcome = pokeTemper(temper, { random: always(0.99) });
      moods.push(outcome.temper.mood);
      swipe = outcome.swipe;
      temper = outcome.temper;
      if (index + 1 >= TEMPER_WARNING && index + 1 < 5) expect(outcome.reaction).toBe('hmph');
    }
    expect(moods).toEqual(['calm', 'calm', 'annoyed', 'annoyed', 'angry']);
    expect(swipe).toBe(true);
    expect(temper.irritation).toBe(0);
    expect(temper.limit).toBeGreaterThanOrEqual(5);
    expect(temper.limit).toBeLessThanOrEqual(7);
  });

  it('draws a patience limit of five to seven taps', () => {
    expect(newTemper(always(0)).limit).toBe(5);
    expect(newTemper(always(0.5)).limit).toBe(6);
    expect(newTemper(always(0.999)).limit).toBe(7);
  });

  it('only huffs while angry or sulking, and forgives one tap per quiet step', () => {
    const angry: Temper = { irritation: 0, limit: 6, mood: 'angry', last: null };
    expect(pokeTemper(angry)).toEqual({ temper: angry, reaction: 'hmph', swipe: false });
    const sulking = sulkTemper(angry);
    expect(sulking.mood).toBe('sulk');
    expect(pokeTemper(sulking).temper).toBe(sulking);
    expect(forgiveTemper(sulking)).toBe(sulking);
    expect(calmTemper(sulking)).toMatchObject({ mood: 'calm', irritation: 0 });

    const annoyed: Temper = { irritation: 4, limit: 6, mood: 'annoyed', last: 'hop' };
    expect(forgiveTemper(annoyed)).toMatchObject({ irritation: 3, mood: 'annoyed' });
    expect(forgiveTemper(forgiveTemper(annoyed))).toMatchObject({ irritation: 2, mood: 'calm' });
    const calm = newTemper();
    expect(forgiveTemper(calm)).toBe(calm);
  });

  it('lets petting forgive everything, except a cat that is still angry or sulking', () => {
    const annoyed: Temper = { irritation: 4, limit: 6, mood: 'annoyed', last: 'hop' };
    expect(petTemper(annoyed)).toMatchObject({ irritation: 0, mood: 'pet' });
    const angry: Temper = { ...annoyed, mood: 'angry' };
    expect(petTemper(angry)).toBe(angry);
    expect(forgiveTemper(petTemper(annoyed)).mood).toBe('pet');
  });
});

describe('reaction data', () => {
  it('indexes every flavour for the worklets and rests within the reaction window', () => {
    expect(REACTION_TABLE[0]).toBeNull();
    REACTION_ORDER.forEach((flavour, index) => expect(REACTION_TABLE[index + 1]).toBe(REACTIONS[flavour]));
    for (const reaction of Object.values(REACTIONS)) {
      for (const part of Object.values(reaction)) {
        expect((part?.delay ?? 0) + (part?.duration ?? 0)).toBeLessThanOrEqual(REACTION_MS);
      }
    }
  });

  it('holds a pose for every mood, with petting showing the ^ ^ eyes', () => {
    expect(Object.keys(MOOD_POSES).sort()).toEqual([...MOOD_ORDER].sort());
    expect(MOOD_POSES.pet).toMatchObject({ blink: 0, happy: 1 });
    expect(MOOD_POSES.calm).toMatchObject({ blink: 1, happy: 0, earL: 0, earR: 0 });
    expect(MOOD_POSES.angry.earL).toBeLessThan(MOOD_POSES.annoyed.earL);
  });
});
