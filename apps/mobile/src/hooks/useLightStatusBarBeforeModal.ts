import { useLayoutEffect, useState } from 'react';
import { Platform, StatusBar } from 'react-native';

/**
 * Android copies the activity's status bar icon appearance into a Modal's own window once, when the
 * dialog is created (`ReactModalHostView.updateSystemAppearance`), so a `StatusBar` inside a dark
 * Modal only restyles the window behind it and the Modal keeps dark icons (Samsung A56,
 * 2026-09-27). Switch the activity to light icons first and present the Modal a frame later.
 * Returns whether the dark Modal may be presented now.
 */
export function useLightStatusBarBeforeModal(active: boolean): boolean {
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    if (!active || Platform.OS !== 'android') return undefined;
    const entry = StatusBar.pushStackEntry({ barStyle: 'light-content', animated: false });
    const frame = requestAnimationFrame(() => setReady(true));
    return () => {
      cancelAnimationFrame(frame);
      StatusBar.popStackEntry(entry);
      setReady(false);
    };
  }, [active]);
  return Platform.OS !== 'android' || ready;
}
