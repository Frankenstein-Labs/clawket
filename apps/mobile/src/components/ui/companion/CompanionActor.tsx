import React from 'react';
import { Circle, G, Path, Rect } from 'react-native-svg';
import Animated, { useAnimatedProps } from 'react-native-reanimated';
import geometry from '../../../brand/companion.json';
import { sampleLoop, sampleTimed, type TimedFrames } from '../../../brand/companion-keyframes';
import type { ActorFrames, ActorTimed } from '../../../brand/companion-scenes';
import { MOOD_LOOPS, PRESS, REACTION_TABLE, SULK_DOTS, type CompanionFlavour, type CompanionMood, type ReactionLayer } from '../../../brand/companion-temper';
import { affine, loopLayer, REST, timedLayer, type PlayValues, type SceneClock } from './motion';

// G's native host accepts a matrix directly, avoiding JS transform parsing per frame.
const AnimatedG = Animated.createAnimatedComponent(G<{ matrix?: number[]; opacity?: number }>);

type Part = { d: string; transform?: string; role?: string; pivot?: { x: number; y: number } };
const parts = geometry.parts as Part[];
const EAR_L = parts.find((part) => part.role === 'earLeft')!;
const EAR_R = parts.find((part) => part.role === 'earRight')!;
const FACE = parts.find((part) => part.role === 'face')!;
const [EYE_L, EYE_R] = geometry.eyes;
const NECK = [47, 84] as const;
const EYE_LINE = EYE_L.y + EYE_L.height / 2;
const EYE_L_CENTER = [EYE_L.x + EYE_L.width / 2, EYE_LINE] as const;
const EYE_R_CENTER = [EYE_R.x + EYE_R.width / 2, EYE_LINE] as const;
const PET = 4;
const ANNOYED = 1;
const ANGRY = 2;

const HEART = 'M0 6 L-6.6 -0.4 A3.9 3.9 0 0 1 0 -5.2 A3.9 3.9 0 0 1 6.6 -0.4 Z';
const SPARK = 'M0 -7 L1.6 -1.6 L7 0 L1.6 1.6 L0 7 L-1.6 1.6 L-7 0 L-1.6 -1.6 Z';

function reactionPart(play: PlayValues, layer: ReactionLayer): TimedFrames | undefined {
  'worklet';
  const reaction = REACTION_TABLE[play.reaction.value];
  return reaction ? reaction[layer] : undefined;
}

/** A loop/payoff layer of the Companion: the loop, or its payoff part once the payoff started. */
function motionLayer(clock: SceneClock, frames: ActorFrames | undefined, payoff: ActorTimed | undefined, key: keyof ActorFrames) {
  'worklet';
  return clock.payoff.value >= 0
    ? timedLayer(payoff?.[key], clock.payoff.value, REST)
    : loopLayer(frames?.[key], clock.loop.value, REST);
}

export type ActorMarks = Readonly<{ reaction: CompanionFlavour | null; mood: CompanionMood }>;

type ActorProps = Readonly<{
  /** Top-left corner and width of the Companion in stage units. */
  x: number;
  y: number;
  width: number;
  clock: SceneClock;
  play: PlayValues;
  frames?: ActorFrames;
  payoff?: ActorTimed;
  marks: ActorMarks;
  ink: string;
  canvas: string;
}>;

/**
 * The Companion drawn inside a scene SVG, in its own 94 × 88 geometry. Layers nest like the
 * prototype: press › reaction and mood › scene loop, so a tap never fights the running scene.
 */
export function CompanionActor({ x, y, width, clock, play, frames, payoff, marks, ink, canvas }: ActorProps): React.JSX.Element {
  const scale = width / geometry.width;

  const pressProps = useAnimatedProps(() => {
    const elapsed = play.press.value;
    const sx = elapsed >= 0 ? sampleTimed(PRESS, 'sx', elapsed, 1) : 1;
    const sy = elapsed >= 0 ? sampleTimed(PRESS, 'sy', elapsed, 1) : 1;
    return { matrix: affine(0, 0, sx, sy, 0, NECK[0], NECK[1]) };
  });
  const reactBodyProps = useAnimatedProps(() => {
    const part = reactionPart(play, 'body');
    const at = play.reactionAt.value;
    const purr = play.moodIndex.value === PET ? sampleLoop(MOOD_LOOPS.purr.frames, 'x', play.ambient.value, MOOD_LOOPS.purr.period, 0, true) : 0;
    return {
      matrix: affine(
        sampleTimed(part, 'x', at, 0) + purr,
        sampleTimed(part, 'y', at, 0),
        sampleTimed(part, 'sx', at, 1),
        sampleTimed(part, 'sy', at, 1),
        sampleTimed(part, 'r', at, 0) + play.pose.body.value,
        NECK[0], NECK[1],
      ),
    };
  });
  const bodyProps = useAnimatedProps(() => {
    const layer = motionLayer(clock, frames, payoff, 'body');
    return { matrix: affine(layer.x, layer.y, layer.sx, layer.sy, layer.r, NECK[0], NECK[1]) };
  });
  const earLProps = useAnimatedProps(() => {
    const own = motionLayer(clock, frames, payoff, 'earL');
    const turn = own.r + sampleTimed(reactionPart(play, 'earL'), 'r', play.reactionAt.value, 0) + play.pose.earL.value;
    return { matrix: affine(0, 0, 1, 1, turn, EAR_L.pivot!.x, EAR_L.pivot!.y) };
  });
  const earRProps = useAnimatedProps(() => {
    const own = motionLayer(clock, frames, payoff, 'earR');
    const turn = own.r + sampleTimed(reactionPart(play, 'earR'), 'r', play.reactionAt.value, 0) + play.pose.earR.value;
    return { matrix: affine(0, 0, 1, 1, turn, EAR_R.pivot!.x, EAR_R.pivot!.y) };
  });
  const gazeProps = useAnimatedProps(() => {
    const own = motionLayer(clock, frames, payoff, 'gaze');
    const part = reactionPart(play, 'gaze');
    const at = play.reactionAt.value;
    return {
      matrix: affine(
        own.x + sampleTimed(part, 'x', at, 0) + play.pose.gazeX.value,
        own.y + sampleTimed(part, 'y', at, 0) + play.pose.gazeY.value,
        1, 1, 0, 0, 0,
      ),
    };
  });
  const blinkProps = useAnimatedProps(() => {
    const own = motionLayer(clock, frames, payoff, 'blink');
    const height = own.sy * sampleTimed(reactionPart(play, 'blink'), 'sy', play.reactionAt.value, 1) * play.pose.blink.value;
    return { matrix: affine(0, 0, 1, height, 0, 47, EYE_LINE) };
  });
  const eyeLProps = useAnimatedProps(() => ({
    matrix: affine(0, 0, 1, 1, play.pose.eyeL.value, EYE_L_CENTER[0], EYE_L_CENTER[1]),
  }));
  const eyeRProps = useAnimatedProps(() => ({
    matrix: affine(0, 0, 1, sampleTimed(reactionPart(play, 'eyeR'), 'sy', play.reactionAt.value, 1), play.pose.eyeR.value, EYE_R_CENTER[0], EYE_R_CENTER[1]),
  }));
  const happyProps = useAnimatedProps(() => ({
    opacity: Math.max(sampleTimed(reactionPart(play, 'happy'), 'o', play.reactionAt.value, 0), play.pose.happy.value),
  }));

  return (
    <G transform={`translate(${x} ${y}) scale(${scale})`}>
      <AnimatedG animatedProps={pressProps}>
        <AnimatedG animatedProps={reactBodyProps}>
          <AnimatedG animatedProps={bodyProps}>
            <AnimatedG animatedProps={earLProps}><Path d={EAR_L.d} transform={EAR_L.transform} fill={ink} /></AnimatedG>
            <AnimatedG animatedProps={earRProps}><Path d={EAR_R.d} transform={EAR_R.transform} fill={ink} /></AnimatedG>
            <Path d={FACE.d} fill={ink} />
            <AnimatedG animatedProps={gazeProps}>
              <AnimatedG animatedProps={blinkProps}>
                <AnimatedG animatedProps={eyeLProps}><Rect x={EYE_L.x} y={EYE_L.y} width={EYE_L.width} height={EYE_L.height} rx={EYE_L.rx} fill={canvas} /></AnimatedG>
                <AnimatedG animatedProps={eyeRProps}><Rect x={EYE_R.x} y={EYE_R.y} width={EYE_R.width} height={EYE_R.height} rx={EYE_R.rx} fill={canvas} /></AnimatedG>
              </AnimatedG>
              <AnimatedG animatedProps={happyProps}>
                <Path d="M24.2 54 Q30.3 43.5 36.4 54" stroke={canvas} strokeWidth={4.4} strokeLinecap="round" fill="none" />
                <Path d="M57.6 54 Q63.7 43.5 69.8 54" stroke={canvas} strokeWidth={4.4} strokeLinecap="round" fill="none" />
              </AnimatedG>
            </AnimatedG>
          </AnimatedG>
        </AnimatedG>
      </AnimatedG>
      <ActorMarksLayer play={play} marks={marks} ink={ink} />
    </G>
  );
}

/** Manga marks (漫符) beside the head. Mounted only while a reaction or mood shows them. */
function ActorMarksLayer({ play, marks, ink }: Readonly<{ play: PlayValues; marks: ActorMarks; ink: string }>): React.JSX.Element {
  const { reaction, mood } = marks;
  const hearts = reaction === 'hop' || reaction === 'nuzzle' || mood === 'pet';
  return (
    <>
      {hearts ? <>
        <ReactionMark layer="heart1" at={[84, 4]} play={play}><Path d={HEART} fill={ink} /></ReactionMark>
        <ReactionMark layer="heart2" at={[97, 16]} play={play} petOffset={MOOD_LOOPS.hearts.period / 2}><Path d={HEART} fill={ink} /></ReactionMark>
      </> : null}
      {reaction === 'wink' ? <ReactionMark layer="spark" at={[82, 28]} play={play}><Path d={SPARK} fill={ink} /></ReactionMark> : null}
      {reaction === 'ears' ? (
        <ReactionMark layer="note" at={[98, 6]} play={play}>
          <Path d="M-5.8 4.6 A3.4 2.6 0 1 0 1 4.6 A3.4 2.6 0 1 0 -5.8 4.6 Z M0.2 -8 H2.2 V4.4 H0.2 Z" fill={ink} />
          <Path d="M2.2 -8 Q7 -6 6 -1.5" stroke={ink} strokeWidth={2.6} strokeLinecap="round" fill="none" />
        </ReactionMark>
      ) : null}
      {reaction === 'tilt' ? (
        <ReactionMark layer="question" at={[92, -2]} play={play}>
          <Path d="M-4 -6 A4.2 4.2 0 1 1 1.4 -2 C0 -1 -0.4 0.2 -0.4 2.4" stroke={ink} strokeWidth={2.6} strokeLinecap="round" fill="none" />
          <Circle cx={-0.4} cy={7} r={2} fill={ink} />
        </ReactionMark>
      ) : null}
      {reaction === 'wow' ? (
        <ReactionMark layer="bang" at={[92, -2]} play={play}>
          <Rect x={-2} y={-11} width={4} height={12} rx={2} fill={ink} />
          <Circle cx={0} cy={5.5} r={2.3} fill={ink} />
        </ReactionMark>
      ) : null}
      {mood === 'annoyed' || mood === 'angry' ? <VeinMark play={play} ink={ink} /> : null}
      {mood === 'sulk' ? <SulkDots play={play} ink={ink} /> : null}
      {mood === 'pet' ? <PurrLines play={play} ink={ink} /> : null}
    </>
  );
}

function ReactionMark({ layer, at, play, petOffset = 0, children }: Readonly<{
  layer: ReactionLayer;
  at: readonly [number, number];
  play: PlayValues;
  /** The second heart of the petting loop runs half a period behind the first. */
  petOffset?: number;
  children: React.ReactNode;
}>): React.JSX.Element {
  const props = useAnimatedProps(() => {
    const part = reactionPart(play, layer);
    const layerState = part
      ? timedLayer(part, play.reactionAt.value, { ...REST, o: 0 })
      : play.moodIndex.value === PET
        ? {
          x: sampleLoop(MOOD_LOOPS.hearts.frames, 'x', play.ambient.value + petOffset, MOOD_LOOPS.hearts.period, 0),
          y: sampleLoop(MOOD_LOOPS.hearts.frames, 'y', play.ambient.value + petOffset, MOOD_LOOPS.hearts.period, 0),
          sx: sampleLoop(MOOD_LOOPS.hearts.frames, 'sx', play.ambient.value + petOffset, MOOD_LOOPS.hearts.period, 1),
          sy: sampleLoop(MOOD_LOOPS.hearts.frames, 'sy', play.ambient.value + petOffset, MOOD_LOOPS.hearts.period, 1),
          r: 0,
          o: sampleLoop(MOOD_LOOPS.hearts.frames, 'o', play.ambient.value + petOffset, MOOD_LOOPS.hearts.period, 0),
        }
        : { ...REST, o: 0 };
    return { matrix: affine(layerState.x, layerState.y, layerState.sx, layerState.sy, layerState.r, 0, 0), opacity: layerState.o };
  });
  return <G testID={`companion-mark-${layer}`} transform={`translate(${at[0]} ${at[1]}) scale(1.3)`}><AnimatedG animatedProps={props}>{children}</AnimatedG></G>;
}

function VeinMark({ play, ink }: Readonly<{ play: PlayValues; ink: string }>): React.JSX.Element {
  const props = useAnimatedProps(() => {
    const scale = play.moodIndex.value === ANGRY
      ? 1.5
      : play.moodIndex.value === ANNOYED
        ? sampleLoop(MOOD_LOOPS.vein.frames, 'sx', play.ambient.value, MOOD_LOOPS.vein.period, 1, true)
        : 0;
    return { matrix: affine(0, 0, scale, scale, 0, 0, 0), opacity: scale > 0 ? 1 : 0 };
  });
  return (
    <G testID="companion-mark-vein" transform="translate(86 6) scale(1.3)">
      <AnimatedG animatedProps={props}>
        <Path d="M-8 -2.6 Q-2.6 -2.6 -2.6 -8 M2.6 -8 Q2.6 -2.6 8 -2.6 M8 2.6 Q2.6 2.6 2.6 8 M-2.6 8 Q-2.6 2.6 -8 2.6"
          stroke={ink} strokeWidth={2.6} strokeLinecap="round" fill="none" />
      </AnimatedG>
    </G>
  );
}

function SulkDot({ play, ink, index }: Readonly<{ play: PlayValues; ink: string; index: number }>): React.JSX.Element {
  const props = useAnimatedProps(() => {
    const layer = timedLayer(SULK_DOTS[index], play.moodAt.value, { ...REST, o: 0 });
    return { matrix: affine(layer.x, layer.y, 1, 1, 0, 0, 0), opacity: layer.o };
  });
  return <AnimatedG animatedProps={props}><Circle cx={100 + index * 7} cy={40} r={3} fill={ink} /></AnimatedG>;
}

function SulkDots({ play, ink }: Readonly<{ play: PlayValues; ink: string }>): React.JSX.Element {
  return <G testID="companion-mark-dots">{SULK_DOTS.map((_, index) => <SulkDot key={index} play={play} ink={ink} index={index} />)}</G>;
}

function PurrLines({ play, ink }: Readonly<{ play: PlayValues; ink: string }>): React.JSX.Element {
  const props = useAnimatedProps(() => ({
    matrix: affine(0, sampleLoop(MOOD_LOOPS.purrLines.frames, 'y', play.ambient.value, MOOD_LOOPS.purrLines.period, 0, true), 1, 1, 0, 0, 0),
  }));
  return (
    <AnimatedG testID="companion-mark-purr" animatedProps={props}>
      <Path d="M-10 58 Q-7.5 54.5 -5 58 Q-2.5 61.5 0 58" stroke={ink} strokeWidth={2.6} strokeLinecap="round" fill="none" />
      <Path d="M94 58 Q96.5 54.5 99 58 Q101.5 61.5 104 58" stroke={ink} strokeWidth={2.6} strokeLinecap="round" fill="none" />
    </AnimatedG>
  );
}
