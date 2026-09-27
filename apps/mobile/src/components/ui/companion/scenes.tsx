import React from 'react';
import { Circle, ClipPath, Defs, Ellipse, G, Path, Rect } from 'react-native-svg';
import Animated, { useAnimatedProps } from 'react-native-reanimated';
import { sampleLoop, sampleTrack } from '../../../brand/companion-keyframes';
import { FETCH, LISTEN, PEEK, POUNCE, YARN, type CompanionSceneKey } from '../../../brand/companion-scenes';
import { CompanionActor, type ActorMarks } from './CompanionActor';
import { affine, useStageLayer, type PlayValues, type SceneClock, type StageLayer } from './motion';

const AnimatedG = Animated.createAnimatedComponent(G<{ matrix?: number[]; opacity?: number }>);
const AnimatedPath = Animated.createAnimatedComponent(Path);

export type SceneColors = Readonly<{ ink: string; canvas: string; surface: string; line: string; hole: string; holeRim?: string }>;

export type StageProps = Readonly<{
  clock: SceneClock;
  play: PlayValues;
  marks: ActorMarks;
  colors: SceneColors;
  /** Unique prefix for SVG clip ids. */
  id: string;
}>;

// Stage layers, in stage points of the prototype's 280 × 170 stage. Bases are each layer's static CSS style.
const PEEK_RIG: StageLayer = { loop: PEEK.rig, wake: PEEK.wake.rig, base: { y: 80 } };
const PEEK_PAWS: StageLayer = { loop: PEEK.paws, wake: PEEK.wake.paws, base: { o: 0 } };

function PeekStage({ clock, play, marks, colors, id }: StageProps): React.JSX.Element {
  const rig = useStageLayer(clock, PEEK_RIG);
  const paws = useStageLayer(clock, PEEK_PAWS);
  return (
    <>
      <Defs><ClipPath id={`${id}peek`}><Rect x={0} y={0} width={280} height={112} /></ClipPath></Defs>
      <G clipPath={`url(#${id}peek)`}>
        <AnimatedG animatedProps={rig}>
          <CompanionActor x={100} y={37} width={80} clock={clock} play={play} frames={PEEK.cat} marks={marks} ink={colors.ink} canvas={colors.canvas} />
        </AnimatedG>
      </G>
      <Rect x={58} y={112} width={164} height={40} rx={13} fill={colors.surface} />
      <AnimatedG animatedProps={paws}>
        <Rect x={114} y={105} width={17} height={11} rx={5.5} fill={colors.ink} />
        <Rect x={149} y={105} width={17} height={11} rx={5.5} fill={colors.ink} />
      </AnimatedG>
    </>
  );
}

const FETCH_LEFT: StageLayer = { loop: FETCH.left, wake: 'hide', base: { y: 74 } };
const FETCH_RIGHT: StageLayer = { loop: FETCH.right, wake: FETCH.wake.right, base: { y: 72 } };
const FETCH_MOUND: StageLayer = { loop: FETCH.mound, wake: 'hide', base: { x: 63, o: 0 } };
const FETCH_FISH: StageLayer = { loop: FETCH.fish, wake: 'hide', base: { o: 0 }, pivot: [225, 111] };

function Dirt({ clock, x, delay, color }: Readonly<{ clock: SceneClock; x: number; delay: number; color: string }>): React.JSX.Element {
  const props = useAnimatedProps(() => {
    const elapsed = clock.loop.value * FETCH.loop - delay;
    const y = sampleLoop(FETCH.dirt, 'y', elapsed, FETCH.dirtPeriod, 0);
    return { matrix: affine(0, y, 1, 1, 0, 0, 0), opacity: sampleLoop(FETCH.dirt, 'o', elapsed, FETCH.dirtPeriod, 0) };
  });
  return <AnimatedG animatedProps={props}><Circle cx={x} cy={111} r={2} fill={color} /></AnimatedG>;
}

function FetchStage({ clock, play, marks, colors, id }: StageProps): React.JSX.Element {
  const left = useStageLayer(clock, FETCH_LEFT);
  const right = useStageLayer(clock, FETCH_RIGHT);
  const mound = useStageLayer(clock, FETCH_MOUND);
  const fish = useStageLayer(clock, FETCH_FISH);
  return (
    <>
      <Defs>
        <ClipPath id={`${id}left`}><Rect x={26} y={0} width={100} height={124} /></ClipPath>
        <ClipPath id={`${id}right`}><Rect x={154} y={0} width={100} height={124} /></ClipPath>
      </Defs>
      <Rect x={14} y={123} width={252} height={2} rx={1} fill={colors.line} />
      <Ellipse cx={76} cy={124} rx={31} ry={7} fill={colors.hole} stroke={colors.holeRim} strokeWidth={colors.holeRim ? 1.5 : 0} />
      <Ellipse cx={204} cy={124} rx={31} ry={7} fill={colors.hole} stroke={colors.holeRim} strokeWidth={colors.holeRim ? 1.5 : 0} />
      <G clipPath={`url(#${id}left)`}>
        <AnimatedG animatedProps={left}>
          <CompanionActor x={41} y={58} width={70} clock={clock} play={play} frames={FETCH.leftCat} marks={marks} ink={colors.ink} canvas={colors.canvas} />
        </AnimatedG>
      </G>
      <G clipPath={`url(#${id}right)`}>
        <AnimatedG animatedProps={right}>
          <CompanionActor x={169} y={58} width={70} clock={clock} play={play} frames={FETCH.rightCat} marks={marks} ink={colors.ink} canvas={colors.canvas} />
        </AnimatedG>
      </G>
      <AnimatedG animatedProps={mound}>
        <Path d="M0 124 A13 10 0 0 1 26 124 Z" fill={colors.ink} />
        <Dirt clock={clock} x={5} delay={0} color={colors.ink} />
        <Dirt clock={clock} x={20} delay={FETCH.dirtPeriod / 2} color={colors.ink} />
      </AnimatedG>
      <AnimatedG animatedProps={fish}>
        <G transform="translate(210 103)">
          <Path d="M2.5 8 C6.5 1.8 16.5 1.8 21 8 C16.5 14.2 6.5 14.2 2.5 8 Z M21 8 L28 2.6 L28 13.4 Z" fill={colors.canvas} stroke={colors.ink} strokeWidth={1.7} strokeLinejoin="round" />
          <Circle cx={7.6} cy={7} r={1.3} fill={colors.ink} />
        </G>
      </AnimatedG>
    </>
  );
}

const YARN_BALL: StageLayer = { loop: YARN.ball, pivot: [115, 129] };
const YARN_PAW: StageLayer = { loop: YARN.paw, base: { x: -8, y: 2, o: 0 }, pivot: [79.5, 133] };

function YarnStage({ clock, play, marks, colors }: StageProps): React.JSX.Element {
  const ball = useStageLayer(clock, YARN_BALL);
  const paw = useStageLayer(clock, YARN_PAW);
  // The unrolled thread is a stroke reveal, like the prototype's dash offset.
  const thread = useAnimatedProps(() => ({ strokeDashoffset: sampleTrack(YARN.thread.dash, clock.loop.value, 93) }));
  return (
    <>
      <AnimatedPath animatedProps={thread} d="M92 139.5 L206 139.5" stroke={colors.ink} strokeWidth={2} strokeLinecap="round" strokeDasharray={[116, 200]} fill="none" />
      <CompanionActor x={20} y={68} width={76} clock={clock} play={play} frames={YARN.cat} marks={marks} ink={colors.ink} canvas={colors.canvas} />
      <AnimatedG animatedProps={paw}><Rect x={70} y={127} width={19} height={12} rx={6} fill={colors.ink} /></AnimatedG>
      <AnimatedG animatedProps={ball}>
        <G transform="translate(103 117)">
          <Circle cx={12} cy={12} r={11} fill={colors.ink} />
          <Path d="M4.2 7.6 Q12 3.4 19.8 7.6 M2.4 12.6 Q12 8.2 21.6 12.6 M4.6 17.6 Q12 13.2 19.4 17.6 M9 1.8 Q5.4 12 9.4 22.2" stroke={colors.canvas} strokeWidth={1.4} strokeLinecap="round" fill="none" />
        </G>
      </AnimatedG>
      <G transform="translate(224 108)">
        <Rect x={6} y={2} width={34} height={23} rx={3.5} fill="none" stroke={colors.ink} strokeWidth={2.2} />
        <Path d="M2 30.5 H44" stroke={colors.ink} strokeWidth={2.6} strokeLinecap="round" />
      </G>
    </>
  );
}

const POUNCE_RIG: StageLayer = { loop: POUNCE.rig, pivot: [140, 159] };
const POUNCE_SHADOW: StageLayer = { loop: POUNCE.shadow, pivot: [140, 158] };
const POUNCE_CURSOR: StageLayer = { loop: POUNCE.cursor, base: { x: 206, y: 30 } };

function PounceStage({ clock, play, marks, colors }: StageProps): React.JSX.Element {
  const rig = useStageLayer(clock, POUNCE_RIG);
  const shadow = useStageLayer(clock, POUNCE_SHADOW);
  const cursor = useStageLayer(clock, POUNCE_CURSOR);
  return (
    <>
      <AnimatedG animatedProps={shadow}><Ellipse cx={140} cy={158} rx={29} ry={4} fill={colors.line} /></AnimatedG>
      <AnimatedG animatedProps={rig}>
        <CompanionActor x={102} y={87} width={76} clock={clock} play={play} frames={POUNCE.cat} marks={marks} ink={colors.ink} canvas={colors.canvas} />
      </AnimatedG>
      <AnimatedG animatedProps={cursor}>
        <Path d="M2.5 1.5 L2.5 20.5 L7.2 16 L10.4 23.2 L13.8 21.8 L10.7 14.8 L17 14.8 Z" fill={colors.ink} stroke={colors.canvas} strokeWidth={1.5} strokeLinejoin="round" />
      </AnimatedG>
    </>
  );
}

const LISTEN_PONG: StageLayer = { loop: LISTEN.pong, base: { o: 0 }, pivot: [226, 88] };
const LEFT_ARC = 'M57.15 75.15 A21 21 0 0 0 57.15 104.85';
const RIGHT_ARC = 'M222.85 75.15 A21 21 0 0 1 222.85 104.85';

function ListenArc({ clock, spec, d, color }: Readonly<{ clock: SceneClock; spec: StageLayer; d: string; color: string }>): React.JSX.Element {
  const props = useStageLayer(clock, spec);
  return <AnimatedG animatedProps={props}><Path d={d} stroke={color} strokeWidth={2} strokeLinecap="round" fill="none" /></AnimatedG>;
}

const LISTEN_ARCS: ReadonlyArray<Readonly<{ spec: StageLayer; d: string }>> = [
  ...LISTEN.ringsL.map((loop) => ({ spec: { loop, base: { o: 0 }, pivot: [94, 90] } as StageLayer, d: LEFT_ARC })),
  ...LISTEN.ringsR.map((loop) => ({ spec: { loop, base: { o: 0 }, pivot: [186, 90] } as StageLayer, d: RIGHT_ARC })),
];

function ListenStage({ clock, play, marks, colors }: StageProps): React.JSX.Element {
  const pong = useStageLayer(clock, LISTEN_PONG);
  return (
    <>
      {LISTEN_ARCS.map((arc, index) => <ListenArc key={index} clock={clock} spec={arc.spec} d={arc.d} color={colors.ink} />)}
      <AnimatedG animatedProps={pong}><Path d="M233.15 73.15 A21 21 0 0 0 233.15 102.85" stroke={colors.ink} strokeWidth={2} strokeLinecap="round" fill="none" /></AnimatedG>
      <CompanionActor x={93} y={60} width={94} clock={clock} play={play} frames={LISTEN.cat} marks={marks} ink={colors.ink} canvas={colors.canvas} />
    </>
  );
}

/** Scene registry: loop length, stage height and the stage drawing. */
export const SCENES: Readonly<Record<CompanionSceneKey, Readonly<{ loop: number; height: number; canHide: boolean; Stage: (props: StageProps) => React.JSX.Element }>>> = {
  peek: { loop: PEEK.loop, height: 170, canHide: true, Stage: PeekStage },
  fetch: { loop: FETCH.loop, height: 170, canHide: true, Stage: FetchStage },
  yarn: { loop: YARN.loop, height: 170, canHide: false, Stage: YarnStage },
  pounce: { loop: POUNCE.loop, height: 180, canHide: false, Stage: PounceStage },
  listen: { loop: LISTEN.loop, height: 170, canHide: false, Stage: ListenStage },
};

