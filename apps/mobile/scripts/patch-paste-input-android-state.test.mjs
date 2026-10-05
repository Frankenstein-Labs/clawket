import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { applyPasteInputAndroidStatePatch, patchPasteInputAndroidState, SHADOW_NODE_RELATIVE, STATE_ANCHOR, STATE_PATCH } from './patch-paste-input-android-state.mjs';

const source = `void PasteTextInputShadowNode::updateStateIfNeeded() {\n  setStateData(AndroidTextInputState{AttributedStringBox(newAttributedString), reactTreeAttributedString, props.paragraphAttributes, newEventCount});\n}\nAttributedString PasteTextInputShadowNode::getAttributedString() {\n    fragment.string = getConcreteProps().text;\n    fragment.textAttributes = textAttributes;\n${STATE_ANCHOR}\n  return attributedString;\n}\n`;

function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawket-paste-state-'));
  const mobile = path.join(root, 'apps/mobile');
  const install = (base, options = {}) => {
    const dependency = path.join(base, 'node_modules/@mattermost/react-native-paste-input');
    const file = path.join(dependency, SHADOW_NODE_RELATIVE);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(path.join(dependency, 'package.json'), JSON.stringify({ name: '@mattermost/react-native-paste-input', version: options.pasteVersion ?? '2.0.1' }));
    fs.writeFileSync(file, options.source ?? source);
    const rn = path.join(base, 'node_modules/react-native');
    fs.mkdirSync(rn, { recursive: true });
    fs.writeFileSync(path.join(rn, 'package.json'), JSON.stringify({ name: 'react-native', version: options.rnVersion ?? '0.86.3' }));
    const stockSource = path.join(rn, 'AndroidTextInputShadowNode.cpp');
    fs.writeFileSync(stockSource, source);
    return { file, dependency, rn, stockSource };
  };
  try { run({ root, mobile, install }); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test('clears fragment ownership before prepend and preserves all other source', () => {
  const patched = patchPasteInputAndroidState(source);
  assert.equal(patched, source.replace(STATE_ANCHOR, STATE_PATCH));
  assert.equal(patched.replace(STATE_PATCH, STATE_ANCHOR), source);
  assert.match(patched, /ShadowView\(\*this\);\n    fragment.parentShadowView.props = nullptr;\n    fragment.parentShadowView.state = nullptr;\n    attributedString.prependFragment/);
  assert.equal(patchPasteInputAndroidState(patched), patched);
});

test('rejects empty, missing, duplicate, mixed and partially patched anchors', () => {
  for (const input of [null, '', 'unknown upstream', STATE_ANCHOR + STATE_ANCHOR, STATE_ANCHOR + STATE_PATCH, STATE_PATCH + STATE_PATCH,
    STATE_PATCH.replace('    fragment.parentShadowView.state = nullptr;\n', ''),
    STATE_PATCH.replace('    fragment.parentShadowView.props = nullptr;\n', ''),
    STATE_ANCHOR.replace('ShadowView(*this)', 'ShadowView(other)')]) {
    assert.throws(() => patchPasteInputAndroidState(input));
  }
});

test('patches standalone and hoisted installs, with no rewrite on repeated application', () => fixture(({ root, mobile, install }) => {
  const installs = [install(root), install(mobile)];
  assert.equal(applyPasteInputAndroidStatePatch(mobile), 2);
  for (const { file, stockSource } of installs) {
    assert.equal(fs.readFileSync(file, 'utf8'), source.replace(STATE_ANCHOR, STATE_PATCH));
    assert.equal(fs.readFileSync(stockSource, 'utf8'), source);
    fs.utimesSync(file, 1, 1);
  }
  assert.equal(applyPasteInputAndroidStatePatch(mobile), 2);
  for (const { file } of installs) assert.equal(fs.statSync(file).mtimeMs, 1000);
}));

test('deduplicates a mobile dependency symlink to the hoisted install', () => fixture(({ root, mobile, install }) => {
  const { dependency } = install(root);
  const local = path.join(mobile, 'node_modules/@mattermost/react-native-paste-input');
  fs.mkdirSync(path.dirname(local), { recursive: true });
  fs.symlinkSync(dependency, local, process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(applyPasteInputAndroidStatePatch(mobile), 1);
}));

test('rejects unreviewed paste or React Native versions before any source write', () => {
  for (const options of [{ pasteVersion: '2.0.2' }, { rnVersion: '0.86.4' }, { pasteVersion: 2.0 }, { rnVersion: null }]) fixture(({ root, mobile, install }) => {
    const first = install(mobile);
    const second = install(root, options.rnVersion === null ? { rnVersion: 'unknown' } : options);
    assert.throws(() => applyPasteInputAndroidStatePatch(mobile), /version needs review/);
    for (const { file } of [first, second]) assert.equal(fs.readFileSync(file, 'utf8'), source);
  });
});

test('rejects source drift in either install without partially patching the other', () => fixture(({ root, mobile, install }) => {
  const first = install(mobile);
  const second = install(root, { source: 'upstream drift' });
  assert.throws(() => applyPasteInputAndroidStatePatch(mobile), /reviewed source/);
  assert.equal(fs.readFileSync(first.file, 'utf8'), source);
  assert.equal(fs.readFileSync(second.file, 'utf8'), 'upstream drift');
}));

test('fails on missing dependencies, source and malformed or missing manifests', () => fixture(({ root, mobile, install }) => {
  assert.throws(() => applyPasteInputAndroidStatePatch(mobile), /dependency is missing/);
  const target = install(root);
  fs.rmSync(target.file);
  assert.throws(() => applyPasteInputAndroidStatePatch(mobile), /source is missing/);
  fs.writeFileSync(target.file, source);
  fs.writeFileSync(path.join(target.dependency, 'package.json'), '{broken');
  assert.throws(() => applyPasteInputAndroidStatePatch(mobile), /manifest is missing or malformed/);
  fs.writeFileSync(path.join(target.dependency, 'package.json'), JSON.stringify({ name: '@mattermost/react-native-paste-input', version: '2.0.1' }));
  fs.rmSync(path.join(target.rn, 'package.json'));
  assert.throws(() => applyPasteInputAndroidStatePatch(mobile), /(?:React Native dependency is missing|manifest is missing or malformed)/);
}));

test('both install entrypoints and the CI-safe script gate apply and verify this patch', () => {
  const mobile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const root = path.resolve(mobile, '../..');
  const rootManifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const mobileManifest = JSON.parse(fs.readFileSync(path.join(mobile, 'package.json'), 'utf8'));
  assert.match(rootManifest.scripts.postinstall, /node apps\/mobile\/scripts\/patch-paste-input-android-state\.mjs/);
  assert.match(mobileManifest.scripts.postinstall, /node \.\/scripts\/patch-paste-input-android-state\.mjs/);
  assert.match(mobileManifest.scripts['paste-input:patch'], /patch-paste-input-podspec\.mjs.*patch-paste-input-android-state\.mjs/);
  assert.match(rootManifest.scripts['test:required:rest'], /apps\/mobile\/scripts\/patch-paste-input-android-state\.test\.mjs/);
});
