import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// react-native-enriched-markdown 1.0.2 sizes the bullet column with the same
// `markerMinWidth` that keeps three-digit ordered numbers visible on Android,
// so every bullet list indented its text ~58dp at body size (owner decision
// 2026-09-27: bullets use a compact column, numbers keep their room). Both
// platforms draw the bullet at the column's trailing edge and start text one
// `gapWidth` later, so a 0.95em column puts bullet text near 28dp.
const RATIONALE = 'Clawket patch: compact bullet column; markerMinWidth reserves room for ordered numbers only.';

export const ANDROID_ANCHOR = '  private val markerColumnWidth: Float = listStyle.effectiveMarkerWidth(radius)';
export const ANDROID_PATCH = `  // ${RATIONALE}\n  private val markerColumnWidth: Float = radius.coerceAtLeast(listStyle.fontSize * 0.95f)`;

export const IOS_ANCHOR = '- (CGFloat)effectiveListMarginLeftForBullet\n{\n  return MAX(_listStyleMarkerMinWidth, _listStyleBulletSize / 2.0);\n}';
export const IOS_PATCH = `- (CGFloat)effectiveListMarginLeftForBullet\n{\n  // ${RATIONALE}\n  return MAX(_listStyleFontSize * 0.95, _listStyleBulletSize / 2.0);\n}`;

function patchOnce(source, anchor, replacement, label) {
  if (typeof source !== 'string' || !source.trim()) throw new Error(`${label} list source is empty or malformed.`);
  const originalCount = source.split(anchor).length - 1;
  const patchedCount = source.split(replacement).length - 1;
  if (originalCount === 0 && patchedCount === 1) return source;
  if (originalCount !== 1 || patchedCount !== 0) throw new Error(`${label} list source does not match reviewed 1.0.2 source.`);
  return source.replace(anchor, replacement);
}

export function patchAndroidBulletColumn(source) {
  return patchOnce(source, ANDROID_ANCHOR, ANDROID_PATCH, 'Android bullet');
}

export function patchIosBulletColumn(source) {
  return patchOnce(source, IOS_ANCHOR, IOS_PATCH, 'iOS bullet');
}

const TARGETS = [
  {
    relative: 'node_modules/react-native-enriched-markdown/android/src/main/java/com/swmansion/enriched/markdown/spans/UnorderedListSpan.kt',
    patch: patchAndroidBulletColumn,
  },
  {
    relative: 'node_modules/react-native-enriched-markdown/ios/styles/StyleConfig.mm',
    patch: patchIosBulletColumn,
  },
];

export function applyMarkdownListIndentPatch(mobileRoot) {
  let count = 0;
  const validated = [];
  for (const target of TARGETS) {
    const candidates = [path.join(mobileRoot, target.relative), path.resolve(mobileRoot, '../..', target.relative)];
    const files = [...new Set(candidates.filter(fs.existsSync).map(file => fs.realpathSync(file)))];
    if (!files.length) throw new Error(`Markdown list source is missing: ${target.relative}. Install mobile dependencies first.`);
    for (const file of files) validated.push({ file, patched: target.patch(fs.readFileSync(file, 'utf8')) });
  }
  // Validate every file before writing any, so a mismatch never leaves one platform patched.
  for (const { file, patched } of validated) {
    fs.writeFileSync(file, patched);
    count += 1;
  }
  return count;
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  const count = applyMarkdownListIndentPatch(process.env.CLAWKET_MOBILE_ROOT || path.resolve(path.dirname(scriptPath), '..'));
  console.log(`Verified enriched-markdown compact bullet column patch: ${count} source file(s).`);
}
