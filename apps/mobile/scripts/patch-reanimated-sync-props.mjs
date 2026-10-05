import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const REANIMATED_VERSION = '4.5.5';
const REACT_NATIVE_VERSION = '0.86.3';
const relativeSource = 'android/src/main/java/com/swmansion/reanimated/NativeProxy.kt';

// Reuse the reviewed upstream missing/preallocated-view handling. Do not evict the
// props registry: a tag without an Android view can still mount in a later batch.
const mountedTagsHelper = `    @DoNotStrip
    fun preserveMountedTags(tags: IntArray): Boolean {
        if (!UiThreadUtil.isOnUiThread()) {
            return false
        }

        for (i in tags.indices) {
            try {
                if (mFabricUIManager.resolveView(tags[i]) == null) {
                    tags[i] = -1
                }
            } catch (e: IllegalViewOperationException) {
                // \`resolveView\` is expected to return \`null\` for a tag without a
                // mounted view, but it instead throws when the tag's \`ViewState\` is
                // already registered while the Android view hasn't been created yet.
                // This happens when a view is mid-preallocation and a third-party view
                // manager (e.g. lottie-react-native) dispatches an event synchronously
                // from within \`createView\`, re-entering this code path. Treat it the
                // same as a missing view.
                // See https://github.com/software-mansion/react-native-reanimated/issues/9636.
                tags[i] = -1
            }
        }

        return true
    }`;

const before = `    @DoNotStrip
    fun synchronouslyUpdateUIProps(
        intBuffer: IntArray,
        doubleBuffer: DoubleArray,
    ) {
        SynchronousPropsBufferParser.parse(intBuffer, doubleBuffer) { viewTag, props ->
            if (BuildConfig.IS_REACT_NATIVE_86_OR_NEWER) {
                try {
                    updatePropsSynchronouslyMethod.invoke(mountingManager, viewTag, props)
                } catch (e: Exception) {
                    Log.w("Reanimated", "synchronouslyUpdateUIProps failed for tag $viewTag", e)
                }
            } else {
                mFabricUIManager.synchronouslyUpdateViewOnUIThread(viewTag, props)
            }
        }
    }`;

const after = before.replace('                try {\n', `                try {
                    // Clawket: skip only a confirmed missing view; keep pending props for a later mount.
                    val mountedTags = intArrayOf(viewTag)
                    if (preserveMountedTags(mountedTags) && mountedTags[0] == -1) return@parse
`);

function occurrences(text, fragment) {
  return text.split(fragment).length - 1;
}

export function patchReanimatedSyncProps(source, reanimatedVersion, reactNativeVersion) {
  if (reanimatedVersion !== REANIMATED_VERSION || reactNativeVersion !== REACT_NATIVE_VERSION) {
    throw new Error('Reanimated sync props patch requires reviewed Reanimated 4.5.5 and React Native 0.86.3.');
  }
  if (typeof source !== 'string' || !source.trim()) {
    throw new Error('Reanimated NativeProxy source is missing or malformed.');
  }
  const text = source.replaceAll('\r\n', '\n');
  const originalCount = occurrences(text, before);
  const patchedCount = occurrences(text, after);
  if (occurrences(text, mountedTagsHelper) !== 1
    || occurrences(text, '    fun preserveMountedTags(') !== 1
    || occurrences(text, '    fun synchronouslyUpdateUIProps(') !== 1
    || occurrences(text, 'import com.facebook.react.uimanager.IllegalViewOperationException') !== 1
    || originalCount + patchedCount !== 1) {
    throw new Error('Reanimated NativeProxy drifted from the reviewed mounted-tags and sync-props source.');
  }
  return originalCount === 1 ? text.replace(before, after) : text;
}

export function applyReanimatedSyncPropsPatch(mobileRoot) {
  // Resolve from the native app, just as its dependency consumer does. The
  // monorepo also installs a shadowed Reanimated 4.2.1 transitive dependency;
  // it is not the Android autolink target and must not be patched or accepted.
  const require = createRequire(path.join(mobileRoot, 'package.json'));
  let reanimatedPackage;
  let nativePackage;
  try {
    reanimatedPackage = fs.realpathSync(require.resolve('react-native-reanimated/package.json'));
    nativePackage = fs.realpathSync(require.resolve('react-native/package.json'));
  } catch {
    throw new Error('Reanimated or React Native dependency is missing. Install mobile dependencies first.');
  }
  const reanimatedVersion = JSON.parse(fs.readFileSync(reanimatedPackage, 'utf8')).version;
  const nativeVersion = JSON.parse(fs.readFileSync(nativePackage, 'utf8')).version;
  if (reanimatedVersion !== REANIMATED_VERSION || nativeVersion !== REACT_NATIVE_VERSION) {
    throw new Error('Reanimated sync props patch requires reviewed Reanimated 4.5.5 and React Native 0.86.3.');
  }
  const sourceFile = path.join(path.dirname(reanimatedPackage), relativeSource);
  const source = fs.readFileSync(sourceFile, 'utf8');
  const patched = patchReanimatedSyncProps(source, reanimatedVersion, nativeVersion);
  if (source !== patched) fs.writeFileSync(sourceFile, patched);
  return 1;
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  const count = applyReanimatedSyncPropsPatch(process.env.CLAWKET_MOBILE_ROOT || path.resolve(path.dirname(scriptPath), '..'));
  console.log(`Verified Reanimated Android missing-view sync props guard: ${count} NativeProxy file(s).`);
}
