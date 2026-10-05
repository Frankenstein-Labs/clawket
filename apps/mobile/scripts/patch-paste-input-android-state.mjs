import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Match RN 0.86.3's BaseTextShadowNode: text fragments use the ShadowView's
// tag, event emitter and layout, but must not own the input's previous state.
// The paste component's copied AndroidTextInput implementation otherwise
// retains a state chain on each controlled edit and destroys it recursively.
export const STATE_ANCHOR = '    fragment.parentShadowView = ShadowView(*this);\n    attributedString.prependFragment(std::move(fragment));';
export const STATE_PATCH = '    fragment.parentShadowView = ShadowView(*this);\n    fragment.parentShadowView.props = nullptr;\n    fragment.parentShadowView.state = nullptr;\n    attributedString.prependFragment(std::move(fragment));';
export const SHADOW_NODE_RELATIVE = 'android/src/codegen-patch/react/renderer/components/PasteTextInputSpecs/ShadowNodes.cpp';

export function patchPasteInputAndroidState(source) {
  if (typeof source !== 'string' || !source.trim()) throw new Error('Paste input Android source is empty or malformed.');
  const originalCount = source.split(STATE_ANCHOR).length - 1;
  const patchedCount = source.split(STATE_PATCH).length - 1;
  if (originalCount === 0 && patchedCount === 1) return source;
  if (originalCount !== 1 || patchedCount !== 0) throw new Error('Paste input Android state anchor does not match reviewed source.');
  return source.replace(STATE_ANCHOR, STATE_PATCH);
}

function requireVersion(file, name, version) {
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { throw new Error('Paste input Android dependency manifest is missing or malformed.'); }
  if (manifest?.name !== name || manifest?.version !== version) throw new Error('Paste input Android dependency version needs review.');
}

export function applyPasteInputAndroidStatePatch(mobileRoot) {
  const relative = 'node_modules/@mattermost/react-native-paste-input';
  const candidates = [path.join(mobileRoot, relative), path.resolve(mobileRoot, '../..', relative)];
  const roots = [...new Set(candidates.filter(fs.existsSync).map(root => fs.realpathSync(root)))];
  if (!roots.length) throw new Error('Paste input Android dependency is missing. Install mobile dependencies first.');
  // Validate every install before modifying any of them. An upgrade or a
  // partial upstream patch requires a fresh ownership/consumer review.
  const validated = roots.map(root => {
    const manifest = path.join(root, 'package.json');
    requireVersion(manifest, '@mattermost/react-native-paste-input', '2.0.1');
    let reactNativeManifest;
    try { reactNativeManifest = createRequire(manifest).resolve('react-native/package.json'); } catch { throw new Error('Paste input React Native dependency is missing.'); }
    requireVersion(reactNativeManifest, 'react-native', '0.86.3');
    const file = path.join(root, SHADOW_NODE_RELATIVE);
    let source;
    try { source = fs.readFileSync(file, 'utf8'); } catch { throw new Error('Paste input Android shadow node source is missing.'); }
    return { file, source, patched: patchPasteInputAndroidState(source) };
  });
  for (const { file, source, patched } of validated) {
    if (source !== patched) fs.writeFileSync(file, patched);
  }
  return validated.length;
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  const count = applyPasteInputAndroidStatePatch(process.env.CLAWKET_MOBILE_ROOT || path.resolve(path.dirname(scriptPath), '..'));
  console.log(`Verified paste input Android state ownership patch: ${count} source file(s), paste input 2.0.1 / React Native 0.86.3.`);
}
