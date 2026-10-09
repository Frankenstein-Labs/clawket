import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const repoRoot = new URL('../../../', import.meta.url);
const workflow = readFileSync(fileURLToPath(new URL('.github/workflows/android-apk.yml', repoRoot)), 'utf8');
const readme = readFileSync(fileURLToPath(new URL('README.md', repoRoot)), 'utf8');

// The sideload workflow must stay a distinct, co-installable QA channel. If it ever
// builds under the store application id or without the QA suffix, an APK signed with
// the public debug key could target the store package and block its installation.
test('sideload APK build uses the QA application id suffix', () => {
  assert.match(workflow, /-Pclawket\.qa=true/, 'android-apk.yml must pass -Pclawket.qa=true');
});

test('sideload APK build keeps the debug signing escape hatch only', () => {
  assert.match(
    workflow,
    /-Pclawket\.allowDebugReleaseSigning=true/,
    'android-apk.yml must declare the debug signing escape hatch',
  );
  assert.doesNotMatch(workflow, /CLAWKET_ANDROID_KEYSTORE_PATH/, 'the sideload workflow must not use the real keystore');
});

test('sideload artifact is named as a QA build, not a release', () => {
  assert.match(workflow, /openhands-mobile-qa-\$\{\{ github\.sha \}\}/);
  assert.doesNotMatch(workflow, /name: openhands-android-release-/);
});

test('README download link does not point at an expiring Actions run', () => {
  assert.doesNotMatch(
    readme,
    /actions\/runs\/\d+/,
    'README must link to GitHub Releases, not a transient Actions run',
  );
  assert.match(readme, /com\.p697\.clawket\.qa/, 'README must document the QA application id');
});
