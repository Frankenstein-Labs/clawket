import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { OpenHandsCloudAuthScreen } from './OpenHandsCloudAuthScreen';
import { openHandsCredentialStore } from '../../connection/openhands/credential-store';
import { pollOpenHandsCloudToken, startOpenHandsCloudDeviceFlow } from '../../connection/openhands/device-flow';
import { verifyOpenHandsCloudSession } from '../../connection/openhands/cloud-client';

jest.mock('react-native', () => {
  const ReactRuntime = require('react');
  const host = (name: string) => ({ children, ...props }: { children?: React.ReactNode }) => (
    ReactRuntime.createElement(name, props, children)
  );
  return {
    Platform: { OS: 'ios', select: (options: Record<string, unknown>) => options.ios ?? options.default },
    ActivityIndicator: host('ActivityIndicator'),
    Linking: { openURL: jest.fn(async () => undefined) },
    Pressable: host('Pressable'),
    Text: host('Text'),
    View: host('View'),
    StyleSheet: { hairlineWidth: 0.5, create: <T,>(styles: T) => styles, flatten: (style: unknown) => style },
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }),
}));

jest.mock('lucide-react-native', () => ({ ArrowLeft: () => null, ExternalLink: () => null }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => undefined) }));
jest.mock('expo-linking', () => ({ openURL: jest.fn(async () => undefined) }));

jest.mock('../../theme', () => ({
  useAppTheme: () => ({
    theme: { colors: { canvas: '#ffffff', ink: '#111113', inkSecondary: '#6b6b72', line: '#e6e6ea' } },
  }),
}));

jest.mock('../../components/ui/Button', () => {
  const ReactRuntime = require('react');
  return {
    Button: ({ testID, label, onPress }: { testID?: string; label: string; onPress: () => void }) => (
      ReactRuntime.createElement(
        'Pressable',
        { testID, onPress, accessibilityLabel: label },
        ReactRuntime.createElement('Text', null, label),
      )
    ),
  };
});

jest.mock('../../components/ui/FloatingButton', () => ({ FloatingButton: () => null }));

jest.mock('../../connection/openhands/credential-store', () => ({
  openHandsCredentialStore: {
    getAccessToken: jest.fn(),
    saveAccessToken: jest.fn(),
    clearAccessToken: jest.fn(),
  },
}));

jest.mock('../../connection/openhands/device-flow', () => ({
  OPENHANDS_CLOUD_HOST: 'https://app.all-hands.dev',
  startOpenHandsCloudDeviceFlow: jest.fn(),
  pollOpenHandsCloudToken: jest.fn(),
}));

jest.mock('../../connection/openhands/cloud-client', () => ({
  isUnauthorizedCloudError: () => false,
  verifyOpenHandsCloudSession: jest.fn(),
}));

const getAccessToken = openHandsCredentialStore.getAccessToken as jest.Mock;
const clearAccessToken = openHandsCredentialStore.clearAccessToken as jest.Mock;
const saveAccessToken = openHandsCredentialStore.saveAccessToken as jest.Mock;
const verifySession = verifyOpenHandsCloudSession as jest.Mock;
const startDeviceFlow = startOpenHandsCloudDeviceFlow as jest.Mock;
const pollToken = pollOpenHandsCloudToken as jest.Mock;

/** Lets the screen's mount probe and device-flow promises settle. */
async function flush(): Promise<void> {
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });
}

const deviceFlowResponse = {
  device_code: 'device-code',
  user_code: 'ABCD-EFGH',
  verification_uri: 'https://app.all-hands.dev/device',
  verification_uri_complete: 'https://app.all-hands.dev/device?code=ABCD-EFGH',
  expires_in: 900,
  interval: 5,
};

describe('OpenHandsCloudAuthScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAccessToken.mockResolvedValue(null);
    saveAccessToken.mockResolvedValue(undefined);
    clearAccessToken.mockResolvedValue(undefined);
    verifySession.mockResolvedValue({ items: [], currentOrgId: null });
    startDeviceFlow.mockResolvedValue(deviceFlowResponse);
    pollToken.mockResolvedValue({ access_token: 'cloud-token' });
  });

  test('re-arms the handoff after a disconnect so a later login still redirects', async () => {
    const onConnected = jest.fn();
    getAccessToken.mockResolvedValue('stored-token');
    const screen = render(<OpenHandsCloudAuthScreen onConnected={onConnected} />);

    // The stored session is probed on mount and hands off exactly once.
    await flush();
    expect(onConnected).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByText('Déconnecter'));
    await flush();
    expect(screen.getByTestId('openhands-login')).toBeTruthy();

    fireEvent.press(screen.getByTestId('openhands-login'));
    await flush();

    // The guard must re-arm for the new attempt, or the redirect never fires again.
    expect(onConnected).toHaveBeenCalledTimes(2);
  });
});
