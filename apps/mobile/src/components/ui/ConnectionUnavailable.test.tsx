import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ConnectionUnavailable } from './ConnectionUnavailable';

jest.mock('react-native', () => {
  const ReactRuntime = require('react');
  const host = (name: string) => ({ children, ...props }: { children?: React.ReactNode }) => (
    ReactRuntime.createElement(name, props, children)
  );
  return {
    Platform: { OS: 'ios', select: (options: Record<string, unknown>) => options.ios ?? options.default },
    ScrollView: host('ScrollView'),
    Text: host('Text'),
    View: host('View'),
    StyleSheet: { create: <T,>(styles: T) => styles, flatten: (style: unknown) => style },
  };
});

jest.mock('lucide-react-native', () => ({ Laptop: () => null }));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => key.replace(
      /\{\{(\w+)\}\}/g,
      (_match, name: string) => String(options?.[name] ?? ''),
    ),
  }),
}));

jest.mock('../../theme', () => ({
  useAppTheme: () => ({ theme: { colors: { ink: '#111', inkSecondary: '#666' } } }),
}));

jest.mock('./Button', () => {
  const ReactRuntime = require('react');
  return {
    Button: ({ testID, label, onPress }: { testID?: string; label: string; onPress: () => void }) => (
      ReactRuntime.createElement('Pressable', { testID, onPress, accessibilityLabel: label })
    ),
  };
});

describe('ConnectionUnavailable', () => {
  it('shows the last connection as a relative time, not a full timestamp', () => {
    const view = render(<ConnectionUnavailable name="Hermes" message="Connection paused" lastReadyAt={Date.now() - 5 * 60_000} />);
    expect(view.getByText('Last connected: 5m ago')).toBeTruthy();
    expect(view.queryByText(/\d{4}/)).toBeNull();
  });

  it('omits an unknown last connection and routes its actions', () => {
    const onRetry = jest.fn();
    const onManage = jest.fn();
    const view = render(<ConnectionUnavailable name="Hermes" lastReadyAt={null} onRetry={onRetry} onManage={onManage} />);
    expect(view.queryByText(/Last connected/)).toBeNull();
    fireEvent.press(view.getByTestId('connection-unavailable-retry'));
    fireEvent.press(view.getByTestId('connection-unavailable-manage'));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onManage).toHaveBeenCalledTimes(1);
  });
});
