import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { WELCOME_AGENTS, WelcomeScreen } from './WelcomeScreen';

const mockOpenExternalUrl = jest.fn(async (_url: string, _onError: () => void) => undefined);
let consoleErrorSpy: jest.SpyInstance;

jest.mock('react-native', () => {
  const ReactRuntime = require('react');
  const host = (name: string) => ({ children, ...props }: { children?: React.ReactNode }) => (
    ReactRuntime.createElement(name, props, children)
  );
  return {
    Platform: { OS: 'ios', select: (options: Record<string, unknown>) => options.ios ?? options.default },
    Image: host('Image'),
    ScrollView: host('ScrollView'),
    Pressable: host('Pressable'),
    Text: host('Text'),
    View: host('View'),
    StyleSheet: {
      hairlineWidth: 0.5,
      create: <T,>(styles: T) => styles,
      flatten: (style: unknown) => Object.assign({}, ...(Array.isArray(style) ? style : [style])),
    },
  };
});

jest.mock('react-native-reanimated', () => {
  const ReactRuntime = require('react');
  const animation = { duration: () => animation };
  return {
    __esModule: true,
    default: { View: ({ children, ...props }: { children?: React.ReactNode }) => ReactRuntime.createElement('AnimatedView', props, children) },
    FadeIn: animation,
    FadeInDown: animation,
    useReducedMotion: () => false,
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }),
}));

jest.mock('../../../assets/openhands/openhands-mark.png', () => 'openhands-mark');

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('lucide-react-native', () => ({ ArrowUpRight: () => null, Settings: () => null, X: () => null }));

jest.mock('../../theme', () => ({
  useAppTheme: () => ({
    theme: { colors: { canvas: '#ffffff', ink: '#111113', inkSecondary: '#6b6b72', line: '#e6e6ea' } },
  }),
}));

jest.mock('../../components/ui/Companion', () => ({ Companion: () => null }));

jest.mock('../../components/ui/PlatformMark', () => {
  const ReactRuntime = require('react');
  return {
    PlatformDisc: ({ platform, size }: { platform: string; size: number }) => (
      ReactRuntime.createElement('PlatformDisc', { platform, size })
    ),
  };
});

jest.mock('../../components/ui/Button', () => {
  const ReactRuntime = require('react');
  return {
    Button: ({ testID, label, onPress }: { testID?: string; label: string; onPress: () => void }) => (
      ReactRuntime.createElement('Pressable', { testID, onPress, accessibilityLabel: label })
    ),
  };
});

jest.mock('../../components/ui/FloatingButton', () => {
  const ReactRuntime = require('react');
  return {
    FloatingButton: ({ accessibilityLabel, onPress }: { accessibilityLabel: string; onPress: () => void }) => (
      ReactRuntime.createElement('Pressable', { testID: `floating-${accessibilityLabel}`, onPress })
    ),
  };
});

jest.mock('../../utils/openExternalUrl', () => ({
  openExternalUrl: (url: string, onError: () => void) => mockOpenExternalUrl(url, onError),
}));

describe('WelcomeScreen', () => {
  beforeAll(() => {
    const originalConsoleError = console.error;
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation((message?: unknown, ...rest: unknown[]) => {
      if (typeof message === 'string' && message.includes('react-test-renderer is deprecated')) return;
      originalConsoleError(message, ...rest);
    });
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  beforeEach(() => {
    mockOpenExternalUrl.mockClear();
  });

  it('leads with every pairable agent product as stacked marks and names', () => {
    const view = render(<WelcomeScreen onConnect={jest.fn()} />);

    expect(WELCOME_AGENTS.map((agent) => agent.platform)).toEqual(['openclaw', 'hermes', 'codex', 'claude-code', 'pi']);
    const discs = view.UNSAFE_getAllByType('PlatformDisc' as unknown as React.ComponentType);
    expect(discs.map((disc) => disc.props.platform)).toEqual(['openclaw', 'hermes', 'codex', 'claude-code', 'pi']);
    expect(view.getByTestId('welcome-agent-names').props.children).toBe('OpenClaw · Hermes · Codex · Claude Code · Pi');
    expect(view.getByText('The agents on your computer,\nall in one app')).toBeTruthy();
    expect(view.getByText('OpenHands')).toBeTruthy();
    expect(view.getByTestId('welcome-openhands-mark')).toBeTruthy();
    // Marks overlap their left neighbour and keep the names' left-to-right order in every locale.
    const styleOf = (testID: string) => Object.assign({}, ...[view.getByTestId(testID, { includeHiddenElements: true }).props.style].flat().filter(Boolean));
    expect(styleOf('welcome-agent-marks')).toMatchObject({ flexDirection: 'row', direction: 'ltr' });
    expect(styleOf('welcome-agent-openclaw').marginLeft).toBeUndefined();
    expect(styleOf('welcome-agent-hermes').marginLeft).toBeLessThan(0);
    expect(styleOf('welcome-agent-pi').marginLeft).toBeLessThan(0);
    // The marks are decoration for the names line, not separate accessibility stops.
    expect(view.getByTestId('welcome-agent-marks', { includeHiddenElements: true }).props.importantForAccessibility).toBe('no-hide-descendants');
    expect(view.queryByTestId('welcome-agent-openclaw')).toBeNull();
  });

  it('starts pairing from the single primary action', () => {
    const onConnect = jest.fn();
    const view = render(<WelcomeScreen onConnect={onConnect} />);

    fireEvent.press(view.getByTestId('welcome-connect'));
    expect(onConnect).toHaveBeenCalledTimes(1);
  });

  it('keeps OpenHands Cloud as an explicit secondary connection path', () => {
    const onOpenCloud = jest.fn();
    const view = render(<WelcomeScreen onConnect={jest.fn()} onOpenCloud={onOpenCloud} />);

    fireEvent.press(view.getByTestId('welcome-openhands-cloud'));
    expect(onOpenCloud).toHaveBeenCalledTimes(1);
  });

  it('opens the open-source repository under the action', () => {
    const view = render(<WelcomeScreen onConnect={jest.fn()} />);

    expect(view.getByTestId('welcome-open-source').props.accessibilityLabel).toBe('Clawket is open source');
    fireEvent.press(view.getByTestId('welcome-open-source'));
    expect(mockOpenExternalUrl).toHaveBeenCalledWith('https://github.com/Frankenstein-Labs/clawket', expect.any(Function));
  });

  it('offers settings on the root welcome and close when presented over another route', () => {
    const onSettings = jest.fn();
    const onClose = jest.fn();
    const root = render(<WelcomeScreen onConnect={jest.fn()} onSettings={onSettings} />);
    fireEvent.press(root.getByTestId('floating-Settings'));
    expect(onSettings).toHaveBeenCalledTimes(1);
    root.unmount();

    const modal = render(<WelcomeScreen onConnect={jest.fn()} onSettings={onSettings} onClose={onClose} />);
    expect(modal.queryByTestId('floating-Settings')).toBeNull();
    fireEvent.press(modal.getByTestId('floating-Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
