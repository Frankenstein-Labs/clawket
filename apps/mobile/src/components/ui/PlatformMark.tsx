import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { getGatewayBackendDescriptor } from '@clawket/agent-protocol';
import { ControlSize, Radius } from '../../theme/tokens';
import { useAppTheme } from '../../theme';

const marks = {
  'claude-code': require('../../../assets/brands/claude-code.png'),
  codex: require('../../../assets/brands/codex.png'),
  pi: require('../../../assets/brands/pi.png'),
  openclaw: require('../../../assets/brands/openclaw.png'),
  hermes: require('../../../assets/brands/hermes.png'),
  'openhands-cloud': require('../../../assets/openhands/openhands-mark.png'),
} as const;

type Platform = keyof typeof marks;
export type PlatformKind = Platform;

/** OpenHands' bundled mark is a monochrome glyph, so it is tinted to the theme ink like the Welcome wordmark. */
const TINTED_MARK_PLATFORMS: ReadonlySet<Platform> = new Set(['openhands-cloud']);

/**
 * Backends whose Agent is the product itself — one Agent per connection with no identity of its own —
 * so the official mark is that Agent's face wherever it appears (owner decision 2026-09-27). OpenClaw
 * Agents keep their own avatars and carry the mark as a corner badge instead.
 */
const PRODUCT_FACE_PLATFORMS: ReadonlySet<Platform> = new Set(['hermes', 'codex', 'claude-code', 'pi', 'openhands-cloud']);

export function isProductFacePlatform(platform: Platform | null | undefined): platform is Platform {
  return platform != null && PRODUCT_FACE_PLATFORMS.has(platform);
}

/**
 * The brand a product face shows, so a name beside it need not repeat it; null when the face is
 * the Agent's own.
 */
export function productFaceBrand(platform: Platform | null | undefined): string | null {
  return isProductFacePlatform(platform) ? getGatewayBackendDescriptor(platform).label : null;
}

/**
 * Share of its image box each bundled artwork covers (measured from the PNG alpha). App artwork is a
 * tile with its own ground, so a disc shows its inside; a bare mark sits on the disc.
 */
const ARTWORK: Readonly<Record<keyof typeof marks, Readonly<{ fill: number; tile: boolean }>>> = {
  openclaw: { fill: 0.92, tile: false },
  'claude-code': { fill: 0.85, tile: false },
  pi: { fill: 0.59, tile: false },
  codex: { fill: 0.81, tile: true },
  hermes: { fill: 0.79, tile: true },
  'openhands-cloud': { fill: 0.82, tile: false },
};

/** A dense mark reads larger than a sparse one of the same width; tuned by eye on the device roster. */
const DISC_OPTICAL_SCALE: Readonly<Partial<Record<Platform, number>>> = { openclaw: 1.08, pi: 0.92 };

/** App artwork overscans the disc slightly so its tile corners and drop shadow never show inside it. */
const TILE_OVERSCAN = 1.02;

/**
 * Drawn size of each mark in the 44-point chooser slot, tuned by eye on a device screenshot (owner
 * request 2026-09-27) so a list of brands reads as one size: app artwork brings its own tile and safe
 * area (Pi's logo keeps 20%), and a filled tile reads larger than a bare glyph of the same width.
 * Sizes above 44 only spill transparent margin.
 */
const BALANCED_SIZE: Readonly<Record<Platform, number>> = {
  openclaw: 36,
  'claude-code': 39,
  hermes: 46,
  codex: 45,
  pi: 50,
  'openhands-cloud': 44,
};

/**
 * Product marks; bundled artwork provenance is recorded in assets/brands/SOURCES.md. `balanced` sizes
 * the mark beside other brands in a slot set by `size` (44 points by default); otherwise `size` sets the image box.
 */
export function PlatformMark({ platform, size, balanced = false }: { platform: Platform; size?: number; balanced?: boolean }) {
  const { theme: { colors } } = useAppTheme();
  const drawn = balanced ? BALANCED_SIZE[platform] * ((size ?? ControlSize.floatingButton) / ControlSize.floatingButton) : size;
  const tint = TINTED_MARK_PLATFORMS.has(platform) ? { tintColor: colors.ink } : null;
  return <Image accessible={false} source={marks[platform]} resizeMode="contain" style={[platform === 'hermes' || platform === 'codex' ? styles.appIcon : styles.mark, tint, drawn ? { width: drawn, height: drawn } : null]} />;
}

/**
 * The official mark fitted to a circle of `size` points: app artwork fills the circle edge to edge (its
 * tile is the ground) and a bare mark spans `glyph` of the diameter on the `ground` surface. Used as a
 * product Agent's face (floating white with a hairline edge from the caller) and as the corner badge of
 * an Agent with its own avatar (`surface` grey: a white disc vanished on the canvas, as the conversation
 * badge showed on 2026-09-27); the caller owns rings.
 */
export function PlatformDisc({ platform, size, glyph, ground = 'floating', artworkColors, testID }: {
  platform: Platform;
  size: number;
  glyph: number;
  ground?: 'floating' | 'surface';
  /** Fixed colours for exported artwork (share posters) that must not follow the app's dark mode. */
  artworkColors?: Readonly<{ ground: string; ink: string }>;
  testID?: string;
}) {
  const { theme: { colors } } = useAppTheme();
  const artwork = ARTWORK[platform];
  const box = artwork.tile
    ? (size / artwork.fill) * TILE_OVERSCAN
    : (size * glyph * (DISC_OPTICAL_SCALE[platform] ?? 1)) / artwork.fill;
  const content = <Image testID={testID ? `${testID}-image` : undefined} accessible={false} source={marks[platform]}
    resizeMode="contain" style={{ width: box, height: box }} />;
  return <View testID={testID} style={[styles.disc, {
    width: size,
    height: size,
    backgroundColor: artworkColors?.ground ?? (ground === 'surface' ? colors.surface : colors.surfaceFloating),
  }]}>
    {content}
  </View>;
}

const styles = StyleSheet.create({
  // The official app artwork already includes its corner shape and safe area.
  appIcon: { width: ControlSize.settingsRow, height: ControlSize.settingsRow },
  mark: { width: ControlSize.pill, height: ControlSize.pill, borderRadius: Radius.settingsGroup },
  disc: { borderRadius: Radius.full, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
});
