const { applyAndroidSystemBars } = require('./with-android-system-bars.js') as {
  applyAndroidSystemBars: (contents: string) => string;
};

const MAIN_ACTIVITY = `package com.p697.clawket
import expo.modules.splashscreen.SplashScreenManager

import android.os.Build
import android.os.Bundle

import com.facebook.react.ReactActivity

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    SplashScreenManager.registerOnActivity(this)
    super.onCreate(null)
  }

  override fun getMainComponentName(): String = "main"

  override fun invokeDefaultOnBackPressed() {
    super.invokeDefaultOnBackPressed()
  }
}
`;

describe('withAndroidSystemBars', () => {
  it('re-applies the navigation bar appearance when the app night mode changes', () => {
    const output = applyAndroidSystemBars(MAIN_ACTIVITY);
    expect(output).toContain('import android.content.res.Configuration');
    expect(output).toContain('import androidx.core.view.WindowInsetsControllerCompat');
    expect(output).toContain('override fun onConfigurationChanged(newConfig: Configuration)');
    expect(output).toContain('isAppearanceLightNavigationBars = !night');
    // Inside the class, after the component name and before the back handling.
    expect(output.indexOf('getMainComponentName')).toBeLessThan(output.indexOf('onConfigurationChanged'));
    expect(output.indexOf('onConfigurationChanged')).toBeLessThan(output.indexOf('invokeDefaultOnBackPressed'));
    expect(output.indexOf('super.onConfigurationChanged(newConfig)'))
      .toBeLessThan(output.indexOf('isAppearanceLightNavigationBars'));
  });

  it('is idempotent across repeated prebuilds', () => {
    const once = applyAndroidSystemBars(MAIN_ACTIVITY);
    expect(applyAndroidSystemBars(once)).toBe(once);
  });

  it('fails closed on a changed template, a duplicate anchor or a hand-written override', () => {
    expect(() => applyAndroidSystemBars(MAIN_ACTIVITY.replace('class MainActivity : ReactActivity()', 'class MainActivity : Activity()')))
      .toThrow(/Kotlin ReactActivity/);
    expect(() => applyAndroidSystemBars(MAIN_ACTIVITY.replace('import android.os.Bundle\n', '')))
      .toThrow(/import anchor/);
    expect(() => applyAndroidSystemBars(MAIN_ACTIVITY.replace('override fun getMainComponentName(): String = "main"', 'override fun getMainComponentName() = "main"')))
      .toThrow(/override anchor/);
    expect(() => applyAndroidSystemBars(`${MAIN_ACTIVITY}\n// override fun getMainComponentName(): String = "main"\n`))
      .toThrow(/more than one/);
    expect(() => applyAndroidSystemBars(MAIN_ACTIVITY.replace(
      '  override fun invokeDefaultOnBackPressed() {',
      '  override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {\n    super.onConfigurationChanged(newConfig)\n  }\n\n  override fun invokeDefaultOnBackPressed() {',
    ))).toThrow(/already overrides/);
    const truncated = applyAndroidSystemBars(MAIN_ACTIVITY).replace('  // @generated end clawket-system-bars\n', '');
    expect(() => applyAndroidSystemBars(truncated)).toThrow(/incomplete/);
  });
});
