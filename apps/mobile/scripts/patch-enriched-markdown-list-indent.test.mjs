import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  ANDROID_ANCHOR,
  ANDROID_PATCH,
  applyMarkdownListIndentPatch,
  IOS_ANCHOR,
  IOS_PATCH,
  patchAndroidBulletColumn,
  patchIosBulletColumn,
} from './patch-enriched-markdown-list-indent.mjs';

test('gives bullets a compact column on both platforms and is idempotent', () => {
  const android = patchAndroidBulletColumn(`class A {\n${ANDROID_ANCHOR}\n}`);
  assert.equal(android, `class A {\n${ANDROID_PATCH}\n}`);
  assert.equal(patchAndroidBulletColumn(android), android);
  const ios = patchIosBulletColumn(`@implementation\n${IOS_ANCHOR}\n@end`);
  assert.equal(ios, `@implementation\n${IOS_PATCH}\n@end`);
  assert.equal(patchIosBulletColumn(ios), ios);
});

test('rejects empty, missing, duplicate and corrupted list sources', () => {
  for (const source of [null, '', 'unknown upstream', ANDROID_ANCHOR + ANDROID_ANCHOR, ANDROID_ANCHOR + ANDROID_PATCH, ANDROID_PATCH.replace('0.95f', '2f')]) {
    assert.throws(() => patchAndroidBulletColumn(source));
  }
  for (const source of [null, '', IOS_ANCHOR + IOS_ANCHOR, IOS_PATCH.replace('0.95', '3')]) {
    assert.throws(() => patchIosBulletColumn(source));
  }
});

test('patches standalone and hoisted installs, and writes nothing when any file mismatches', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawket-markdown-list-'));
  const mobile = path.join(root, 'apps/mobile');
  const androidRelative = 'node_modules/react-native-enriched-markdown/android/src/main/java/com/swmansion/enriched/markdown/spans/UnorderedListSpan.kt';
  const iosRelative = 'node_modules/react-native-enriched-markdown/ios/styles/StyleConfig.mm';
  try {
    assert.throws(() => applyMarkdownListIndentPatch(mobile), /missing/);
    const androidFiles = [path.join(root, androidRelative), path.join(mobile, androidRelative)];
    const iosFile = path.join(mobile, iosRelative);
    for (const file of androidFiles) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, ANDROID_ANCHOR); }
    fs.mkdirSync(path.dirname(iosFile), { recursive: true });
    fs.writeFileSync(iosFile, 'corrupted');
    assert.throws(() => applyMarkdownListIndentPatch(mobile), /reviewed/);
    for (const file of androidFiles) assert.equal(fs.readFileSync(file, 'utf8'), ANDROID_ANCHOR);
    fs.writeFileSync(iosFile, IOS_ANCHOR);
    assert.equal(applyMarkdownListIndentPatch(mobile), 3);
    for (const file of androidFiles) assert.equal(fs.readFileSync(file, 'utf8'), ANDROID_PATCH);
    assert.equal(fs.readFileSync(iosFile, 'utf8'), IOS_PATCH);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
