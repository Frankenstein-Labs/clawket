import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { applyReanimatedSyncPropsPatch, patchReanimatedSyncProps } from './patch-reanimated-sync-props.mjs';

const mobileRoot = fileURLToPath(new URL('..', import.meta.url));
const sourceRelative = 'android/src/main/java/com/swmansion/reanimated/NativeProxy.kt';
const require = createRequire(path.join(mobileRoot, 'package.json'));
const installedPackage = require.resolve('react-native-reanimated/package.json');
assert.equal(JSON.parse(fs.readFileSync(installedPackage, 'utf8')).version, '4.5.5');
const installedSource = fs.readFileSync(path.join(path.dirname(installedPackage), sourceRelative), 'utf8');
// Exercise the real installed NativeProxy source, never a hand-written copy of its
// methods. Root/Mobile postinstall may already have inserted the reviewed guard.
const guard = / {20}\/\/ Clawket: skip only a confirmed missing view; keep pending props for a later mount\.\n {20}val mountedTags = intArrayOf\(viewTag\)\n {20}if \(preserveMountedTags\(mountedTags\) && mountedTags\[0\] == -1\) return@parse\n/g;
const source = installedSource.replace(guard, '');
const patch = value => patchReanimatedSyncProps(value, '4.5.5', '0.86.3');

test('both install entry points and the required gate include the guard', () => {
  for (const [url, prefix] of [['../package.json', './scripts/'], ['../../../package.json', 'apps/mobile/scripts/']]) {
    const manifest = JSON.parse(fs.readFileSync(fileURLToPath(new URL(url, import.meta.url)), 'utf8'));
    assert.ok(manifest.scripts.postinstall.includes(`node ${prefix}patch-reanimated-sync-props.mjs`), url);
  }
  const root = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../../../package.json', import.meta.url)), 'utf8'));
  assert.ok(root.scripts['test:required:rest'].includes('apps/mobile/scripts/patch-reanimated-sync-props.test.mjs'));
});

test('guards the actual RN86 sync consumer inside the existing exception boundary', () => {
  const patched = patch(source);
  const start = patched.indexOf('    fun synchronouslyUpdateUIProps(');
  const body = patched.slice(start, patched.indexOf('\n    @DoNotStrip', start));
  assert.match(body, /if \(BuildConfig\.IS_REACT_NATIVE_86_OR_NEWER\) \{\n {16}try \{\n {20}\/\/ Clawket:/);
  assert.match(body, /if \(preserveMountedTags\(mountedTags\) && mountedTags\[0\] == -1\) return@parse\n {20}updatePropsSynchronouslyMethod\.invoke/);
  assert.match(body, /\} catch \(e: Exception\) \{\n {20}Log\.w\("Reanimated", "synchronouslyUpdateUIProps failed for tag \$viewTag", e\)/);
  assert.match(body, /\} else \{\n {16}mFabricUIManager\.synchronouslyUpdateViewOnUIThread\(viewTag, props\)/);
  assert.equal(patched.replace(guard, ''), source, 'only the mounted-target preflight changes');
  assert.equal(patch(patched), patched);
  assert.equal(patch(source.replaceAll('\n', '\r\n')), patched);
});

test('keeps the existing missing/preallocation classification and thread-false fallback', () => {
  const patched = patch(source);
  assert.match(patched, /if \(!UiThreadUtil\.isOnUiThread\(\)\) \{\n {12}return false/);
  assert.match(patched, /if \(mFabricUIManager\.resolveView\(tags\[i\]\) == null\) \{\n {20}tags\[i\] = -1/);
  assert.match(patched, /catch \(e: IllegalViewOperationException\)/);
  // && is intentional: a false (non-UI-thread) helper result must still enter
  // the original invoke/catch path. Unknown lookup exceptions reach that same
  // catch; no new check/require/throw or props-registry removal is added.
  assert.equal((patched.match(/if \(preserveMountedTags\(mountedTags\) && mountedTags\[0\] == -1\) return@parse/g) ?? []).length, 1);
});

test('rejects unsupported versions and missing, drifted, duplicated or partial source', () => {
  for (const [reanimated, native] of [['4.5.4', '0.86.3'], ['4.5.5', '0.86.4'], [null, '0.86.3'], ['4.5.5', undefined]]) {
    assert.throws(() => patchReanimatedSyncProps(source, reanimated, native), /requires reviewed/);
  }
  const patched = patch(source);
  for (const value of [null, '', ' ', 'class NativeProxy {}', source + source, patched + source,
    source.replace('catch (e: IllegalViewOperationException)', 'catch (e: Exception)'),
    source.replace('return false', 'return true'),
    source.replace('updatePropsSynchronouslyMethod.invoke(mountingManager, viewTag, props)', 'otherUpdate(viewTag, props)'),
    patched.replace('&& mountedTags[0] == -1', '|| mountedTags[0] == -1'),
    patched.replace('val mountedTags = intArrayOf(viewTag)', 'val mountedTags = intArrayOf(-1)')]) {
    assert.throws(() => patch(value), /missing|malformed|drifted/);
  }
});

function dependency(root, name, version, nativeSource) {
  const dir = path.join(root, 'node_modules', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, version }));
  if (nativeSource !== undefined) {
    const file = path.join(dir, sourceRelative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, nativeSource);
    return file;
  }
  return dir;
}

test('fails when either reviewed dependency or its source is missing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawket-sync-props-'));
  try {
    const mobile = path.join(root, 'apps/mobile');
    assert.throws(() => applyReanimatedSyncPropsPatch(mobile), /dependency is missing/);
    dependency(root, 'react-native', '0.86.3');
    assert.throws(() => applyReanimatedSyncPropsPatch(mobile), /dependency is missing/);
    dependency(root, 'react-native-reanimated', '4.5.5');
    assert.throws(() => applyReanimatedSyncPropsPatch(mobile), /ENOENT/);
  } finally { fs.rmSync(root, { recursive: true }); }
});

test('patches only the Mobile consumer, rejects its version drift, and supports hoisting/links', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawket-sync-props-'));
  try {
    const mobile = path.join(root, 'apps/mobile');
    dependency(mobile, 'react-native', '0.86.3');
    const shadowed = dependency(root, 'react-native-reanimated', '4.2.1', 'unrelated transitive source');
    const local = dependency(mobile, 'react-native-reanimated', '4.5.5', 'drifted');
    assert.throws(() => applyReanimatedSyncPropsPatch(mobile), /drifted/);
    assert.equal(fs.readFileSync(shadowed, 'utf8'), 'unrelated transitive source');
    fs.writeFileSync(local, source);
    dependency(mobile, 'react-native', '0.86.4');
    assert.throws(() => applyReanimatedSyncPropsPatch(mobile), /requires reviewed/);
    assert.equal(fs.readFileSync(local, 'utf8'), source);
    dependency(mobile, 'react-native', '0.86.3');
    assert.equal(applyReanimatedSyncPropsPatch(mobile), 1);
    assert.equal(fs.readFileSync(local, 'utf8'), patch(source));
    assert.equal(fs.readFileSync(shadowed, 'utf8'), 'unrelated transitive source');
    const hoistedRoot = path.join(root, 'hoisted');
    const hoistedMobile = path.join(hoistedRoot, 'apps/mobile');
    dependency(hoistedRoot, 'react-native', '0.86.3');
    dependency(hoistedRoot, 'react-native-reanimated', '4.2.1', 'unreviewed native consumer');
    assert.throws(() => applyReanimatedSyncPropsPatch(hoistedMobile), /requires reviewed/);
    const hoisted = dependency(hoistedRoot, 'react-native-reanimated', '4.5.5', source);
    assert.equal(applyReanimatedSyncPropsPatch(hoistedMobile), 1);
    assert.equal(fs.readFileSync(hoisted, 'utf8'), patch(source));
    const linkedMobile = path.join(root, 'linked/apps/mobile');
    dependency(path.join(root, 'linked'), 'react-native', '0.86.3');
    fs.mkdirSync(path.join(linkedMobile, 'node_modules'), { recursive: true });
    fs.symlinkSync(path.join(hoistedRoot, 'node_modules/react-native-reanimated'), path.join(linkedMobile, 'node_modules/react-native-reanimated'), 'junction');
    assert.equal(applyReanimatedSyncPropsPatch(linkedMobile), 1);
  } finally { fs.rmSync(root, { recursive: true }); }
});
