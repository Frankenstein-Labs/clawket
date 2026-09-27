import { bezierAt, parseEase, parseKeyframes, sampleLoop, sampleTimed, sampleTrack, timed } from './companion-keyframes';

describe('parseKeyframes', () => {
  it('reads transforms, opacity and stroke offsets into per-property tracks with CSS segment easing', () => {
    const frames = parseKeyframes('0%,6%{transform:translate(0,80px);animation-timing-function:cubic-bezier(.2,.9,.3,1.25)}10%{transform:translate(4px,44px) scale(1.1,.9) rotate(-11deg);opacity:.5}to{stroke-dashoffset:2}');
    expect(frames.y?.map((key) => [key[0], key[1]])).toEqual([[0, 80], [0.06, 80], [0.1, 44]]);
    expect(frames.x?.[2][1]).toBe(4);
    expect(frames.r?.[2][1]).toBe(-11);
    expect(frames.sx?.[2][1]).toBeCloseTo(1.1);
    expect(frames.sy?.[0][1]).toBe(1);
    expect(frames.o?.map((key) => key[1])).toEqual([0.5]);
    expect(frames.dash?.map((key) => [key[0], key[1]])).toEqual([[1, 2]]);
    // The block's timing function eases the segments that start at its stops; others use the default.
    expect(frames.y?.[1].slice(2)).toEqual([0.2, 0.9, 0.3, 1.25]);
    expect(frames.y?.[2].slice(2)).toEqual([0.25, 0.1, 0.25, 1]);
  });

  it('supports single-axis functions and a custom default easing', () => {
    const frames = parseKeyframes('from{transform:scaleY(1)}to{transform:scaleY(.3) translateY(-2px)}', 'ease-out');
    expect(frames.sy?.map((key) => key[1])).toEqual([1, 0.3]);
    expect(frames.y?.[1][1]).toBe(-2);
    expect(frames.sy?.[0].slice(2)).toEqual([0, 0, 0.58, 1]);
  });

  it.each([
    ['', 'Keyframes are empty'],
    ['0%{transform:skew(4deg)}', 'Unsupported transform'],
    ['0%{transform:none}', 'Unsupported transform'],
    ['half{opacity:1}', 'Unsupported keyframe selector'],
    ['120%{opacity:1}', 'Unsupported keyframe selector'],
    ['0%{opacity:1;animation-timing-function:springy}', 'Unsupported easing'],
  ])('fails closed on malformed input %p', (source, message) => {
    expect(() => parseKeyframes(source)).toThrow(message);
  });

  it('rejects malformed cubic-bezier easing', () => {
    expect(() => parseEase('cubic-bezier(.2,1,.3)')).toThrow('Unsupported easing');
  });
});

describe('sampling', () => {
  const linear = parseKeyframes('0%{opacity:0}50%{opacity:1}50%{opacity:.2}100%{opacity:.6}', 'linear');

  it('holds both ends, interpolates, and jumps across zero-length segments', () => {
    expect(sampleTrack(linear.o, -1, 9)).toBe(0);
    expect(sampleTrack(linear.o, 0.25, 9)).toBeCloseTo(0.5);
    expect(sampleTrack(linear.o, 0.5, 9)).toBeCloseTo(0.2);
    expect(sampleTrack(linear.o, 0.75, 9)).toBeCloseTo(0.4);
    expect(sampleTrack(linear.o, 2, 9)).toBe(0.6);
    expect(sampleTrack(undefined, 0.5, 9)).toBe(9);
  });

  it('follows CSS cubic-bézier curves, including overshoot', () => {
    expect(bezierAt(0, 0, 1, 1, 0.37)).toBeCloseTo(0.37);
    expect(bezierAt(0.25, 0.1, 0.25, 1, 0)).toBe(0);
    expect(bezierAt(0.25, 0.1, 0.25, 1, 1)).toBe(1);
    expect(bezierAt(0.25, 0.1, 0.25, 1, 0.5)).toBeCloseTo(0.8024, 3);
    const peak = Math.max(...Array.from({ length: 50 }, (_, index) => bezierAt(0.2, 1, 0.3, 1.25, index / 49)));
    expect(peak).toBeGreaterThan(1);
  });

  it('plays one-shot parts after their delay and loops with CSS alternate', () => {
    const part = timed(linear, 1_000, 200);
    expect(sampleTimed(part, 'o', 0, 9)).toBe(0);
    expect(sampleTimed(part, 'o', 450, 9)).toBeCloseTo(0.5);
    expect(sampleTimed(part, 'o', 5_000, 9)).toBe(0.6);
    expect(sampleTimed(part, 'x', 450, 9)).toBe(9);
    expect(sampleTimed(undefined, 'o', 450, 9)).toBe(9);
    const pulse = parseKeyframes('from{opacity:0}to{opacity:1}', 'linear');
    expect(sampleLoop(pulse, 'o', 250, 1_000, 9)).toBeCloseTo(0.25);
    expect(sampleLoop(pulse, 'o', 1_250, 1_000, 9, true)).toBeCloseTo(0.75);
    expect(sampleLoop(pulse, 'o', -250, 1_000, 9)).toBeCloseTo(0.75);
  });
});
