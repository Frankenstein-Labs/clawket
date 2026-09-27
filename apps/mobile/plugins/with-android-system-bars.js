const { withMainActivity } = require('expo/config-plugins');

const IMPORT_START = '// @generated begin clawket-system-bars-imports';
const IMPORT_END = '// @generated end clawket-system-bars-imports';
const IMPORT_ANCHOR = 'import android.os.Bundle';
const IMPORT_BLOCK = `${IMPORT_START}
import android.content.res.Configuration
import androidx.core.view.WindowInsetsControllerCompat
${IMPORT_END}`;

const OVERRIDE_START = '  // @generated begin clawket-system-bars';
const OVERRIDE_END = '  // @generated end clawket-system-bars';
const OVERRIDE_ANCHOR = 'override fun getMainComponentName(): String = "main"';
const OVERRIDE_BLOCK = `${OVERRIDE_START}
  // React Native sets the navigation bar appearance once, when the window is created. The app theme
  // (Settings -> Theme) can differ from the system one and reaches the activity later as a uiMode
  // change, so re-apply it here; otherwise 3-button navigation keeps a light scrim under a dark app.
  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    val night = (newConfig.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
    WindowInsetsControllerCompat(window, window.decorView).isAppearanceLightNavigationBars = !night
  }
${OVERRIDE_END}`;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function upsertBlock(contents, { start, end, block, anchor, label }) {
  const hasStart = contents.includes(start);
  const hasEnd = contents.includes(end);
  if (hasStart !== hasEnd) {
    throw new Error(`MainActivity contains an incomplete generated ${label} block.`);
  }
  if (hasStart) {
    return contents.replace(new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}`, 'm'), block);
  }
  const anchorIndex = contents.indexOf(anchor);
  if (anchorIndex === -1) throw new Error(`MainActivity is missing the ${label} anchor: ${anchor}`);
  if (contents.indexOf(anchor, anchorIndex + anchor.length) !== -1) {
    throw new Error(`MainActivity has more than one ${label} anchor: ${anchor}`);
  }
  const lineEnd = contents.indexOf('\n', anchorIndex);
  const insertionPoint = lineEnd === -1 ? contents.length : lineEnd;
  return `${contents.slice(0, insertionPoint)}\n${block}${contents.slice(insertionPoint)}`;
}

/** Adds the navigation bar appearance sync to a generated Kotlin MainActivity; fails closed on drift. */
function applyAndroidSystemBars(contents) {
  if (!contents.includes('class MainActivity : ReactActivity()')) {
    throw new Error('MainActivity is not the expected Kotlin ReactActivity.');
  }
  for (const [start, end, label] of [[IMPORT_START, IMPORT_END, 'system-bars import'], [OVERRIDE_START, OVERRIDE_END, 'system-bars override']]) {
    if (contents.includes(start) !== contents.includes(end)) {
      throw new Error(`MainActivity contains an incomplete generated ${label} block.`);
    }
  }
  const withoutOwnBlock = contents.replace(
    new RegExp(`${escapeRegExp(OVERRIDE_START)}[\\s\\S]*?${escapeRegExp(OVERRIDE_END)}`, 'm'),
    '',
  );
  if (withoutOwnBlock.includes('fun onConfigurationChanged(')) {
    throw new Error('MainActivity already overrides onConfigurationChanged; merge the navigation bar sync by hand.');
  }
  const withImports = upsertBlock(contents, {
    start: IMPORT_START, end: IMPORT_END, block: IMPORT_BLOCK, anchor: IMPORT_ANCHOR, label: 'system-bars import',
  });
  return upsertBlock(withImports, {
    start: OVERRIDE_START, end: OVERRIDE_END, block: OVERRIDE_BLOCK, anchor: OVERRIDE_ANCHOR, label: 'system-bars override',
  });
}

function withAndroidSystemBars(config) {
  return withMainActivity(config, (next) => {
    if (next.modResults.language !== 'kt') {
      throw new Error('with-android-system-bars expects a Kotlin MainActivity.');
    }
    next.modResults.contents = applyAndroidSystemBars(next.modResults.contents);
    return next;
  });
}

module.exports = withAndroidSystemBars;
module.exports.applyAndroidSystemBars = applyAndroidSystemBars;
