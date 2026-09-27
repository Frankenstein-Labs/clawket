import * as ExpoHaptics from 'expo-haptics';
import {
  triggerDragEndHaptic,
  triggerDragStartHaptic,
  triggerHeavyImpact,
  triggerLightImpact,
  triggerMediumImpact,
  triggerRigidImpact,
  triggerSelectionHaptic,
} from './haptics';

describe('haptics service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('triggers light impact haptics', () => {
    triggerLightImpact();

    expect(ExpoHaptics.impactAsync).toHaveBeenCalledWith(ExpoHaptics.ImpactFeedbackStyle.Light);
  });

  it('triggers rigid impact haptics', () => {
    triggerRigidImpact();

    expect(ExpoHaptics.impactAsync).toHaveBeenCalledWith(ExpoHaptics.ImpactFeedbackStyle.Rigid);
  });

  it('triggers selection haptics', () => {
    triggerSelectionHaptic();

    expect(ExpoHaptics.selectionAsync).toHaveBeenCalled();
  });

  it('triggers medium and heavy impacts', () => {
    triggerMediumImpact();
    triggerHeavyImpact();

    expect(ExpoHaptics.impactAsync).toHaveBeenNthCalledWith(1, ExpoHaptics.ImpactFeedbackStyle.Medium);
    expect(ExpoHaptics.impactAsync).toHaveBeenNthCalledWith(2, ExpoHaptics.ImpactFeedbackStyle.Heavy);
  });

  it('uses light impact for drag start and end', () => {
    triggerDragStartHaptic();
    triggerDragEndHaptic();

    expect(ExpoHaptics.impactAsync).toHaveBeenNthCalledWith(1, ExpoHaptics.ImpactFeedbackStyle.Light);
    expect(ExpoHaptics.impactAsync).toHaveBeenNthCalledWith(2, ExpoHaptics.ImpactFeedbackStyle.Light);
  });
});
