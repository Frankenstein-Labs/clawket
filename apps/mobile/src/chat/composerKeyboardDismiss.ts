/** Points of downward travel before a drag on the composer toolbar means "put the keyboard away". */
export const COMPOSER_KEYBOARD_DISMISS_DRAG_THRESHOLD = 10;

export type ComposerKeyboardDismissGesture = Readonly<{
  dx: number;
  dy: number;
  inputFocused: boolean;
  /** The draft is taller than the compact cap, so a drag inside it must scroll the text instead. */
  inputScrollable: boolean;
  numberActiveTouches: number;
}>;

/**
 * Capture only a deliberate, mostly vertical, one-finger downward drag that
 * starts on the toolbar while its input owns the keyboard. Attach this only
 * outside the editor ancestry: direction alone cannot identify selection drags.
 */
export function shouldCaptureComposerKeyboardDismiss({
  dx,
  dy,
  inputFocused,
  inputScrollable,
  numberActiveTouches,
}: ComposerKeyboardDismissGesture): boolean {
  return inputFocused
    && !inputScrollable
    && numberActiveTouches === 1
    && dy > COMPOSER_KEYBOARD_DISMISS_DRAG_THRESHOLD
    && dy > Math.abs(dx);
}
