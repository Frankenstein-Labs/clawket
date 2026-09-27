import * as Haptics from 'expo-haptics';

function fireAndForget(task: Promise<unknown> | void): void {
  void Promise.resolve(task).catch(() => {});
}

export function triggerLightImpact(): void {
  fireAndForget(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

export function triggerRigidImpact(): void {
  fireAndForget(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid));
}

export function triggerSelectionHaptic(): void {
  fireAndForget(Haptics.selectionAsync());
}

export function triggerMediumImpact(): void {
  fireAndForget(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

/** A hard knock for the Companion's claw swipe. */
export function triggerHeavyImpact(): void {
  fireAndForget(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
}

export function triggerDragStartHaptic(): void {
  triggerLightImpact();
}

export function triggerDragEndHaptic(): void {
  triggerLightImpact();
}
