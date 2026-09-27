import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { builtInAccents } from '../../theme/accents';
import { buildTheme } from '../../theme/theme';
import { ControlSize, FontSize, Space } from '../../theme/tokens';
import { ScreenHeader } from './ScreenHeader';

let mockScheme: 'light' | 'dark' = 'light';

jest.mock('react-native', () => {
  const ReactRuntime = require('react');
  const host = (name: string) => ReactRuntime.forwardRef(
    ({ children, style, ...props }: Record<string, unknown>, ref: unknown) => ReactRuntime.createElement(
      name, { ...props, ref, style: typeof style === 'function' ? style({ pressed: false }) : style }, children,
    ),
  );
  return {
    Platform: { OS: 'ios', select: (values: Record<string, unknown>) => values.ios ?? values.default },
    Pressable: host('Pressable'),
    StyleSheet: {
      absoluteFill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
      create: <T,>(styles: T) => styles,
      flatten: (style: unknown) => flattenStyle(style),
      hairlineWidth: 1,
    },
    Text: host('Text'),
    View: host('View'),
  };
});

jest.mock('react-native-reanimated', () => {
  const ReactRuntime = require('react');
  const primitive = (name: string) => ReactRuntime.forwardRef(
    ({ children, ...props }: Record<string, unknown>, ref: unknown) => ReactRuntime.createElement(name, { ...props, ref }, children),
  );
  return {
    __esModule: true,
    default: { View: primitive('AnimatedView'), createAnimatedComponent: (component: unknown) => component },
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useReducedMotion: () => false,
    useSharedValue: (value: unknown) => ({ value }),
    withTiming: (value: unknown) => value,
  };
});

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('lucide-react-native', () => new Proxy({}, {
  get: (_target, property) => (props: Record<string, unknown>) => require('react').createElement(String(property), props),
}));
jest.mock('../../theme', () => ({
  useAppTheme: () => ({ theme: buildTheme(mockScheme, mockScheme, builtInAccents.iceBlue) }),
}));

function flattenStyle(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (!Array.isArray(value)) return value as Record<string, unknown>;
  return Object.assign({}, ...value.map(flattenStyle));
}

describe.each(['light', 'dark'] as const)('ScreenHeader in %s', (scheme) => {
  beforeEach(() => { mockScheme = scheme; });
  const theme = () => buildTheme(scheme, scheme, builtInAccents.iceBlue);

  it('lays every page header out the same way: 16-point edge, plain 44-point back icon, 8 above and below', () => {
    const onBack = jest.fn();
    const view = render(<ScreenHeader testID="page" title="Agent profile" topInset={47} onBack={onBack} />);
    expect(flattenStyle(view.getByTestId('page').props.style)).toMatchObject({
      paddingHorizontal: Space.lg, paddingTop: 47 + Space.sm, paddingBottom: Space.sm, backgroundColor: theme().colors.canvas,
    });
    const back = view.getByTestId('page-back');
    expect(flattenStyle(back.props.style)).toMatchObject({
      width: ControlSize.floatingButton, height: ControlSize.floatingButton, borderRadius: ControlSize.floatingButton / 2,
      backgroundColor: 'transparent',
    });
    // A plain icon like the roster header's: no white disc, shadow or hairline in either theme (owner decision 2026-09-27).
    expect(flattenStyle(back.props.style).shadowOpacity ?? 0).toBe(0);
    expect(flattenStyle(back.props.style).borderWidth ?? 0).toBe(0);
    expect(back.props.accessibilityLabel).toBe('Back');
    fireEvent.press(back);
    expect(onBack).toHaveBeenCalledTimes(1);
    const title = view.getByTestId('page-title');
    expect(title.props.children).toBe('Agent profile');
    expect(title.props.numberOfLines).toBe(1);
    expect(flattenStyle(title.props.style)).toMatchObject({ fontSize: FontSize.title, textAlign: 'center' });
  });

  it('uses the same plain close icon for modal presentation and honors explicit test hooks', () => {
    const view = render(
      <ScreenHeader testID="modal" backTestID="modal-close" titleTestID="modal-heading" title="Draft" topInset={47}
        onBack={jest.fn()} dismissStyle="close" titleNumberOfLines={2} backAccessibilityLabel="Dismiss" />,
    );
    // Compact top inset for close-style headers on iOS.
    expect(flattenStyle(view.getByTestId('modal').props.style).paddingTop).toBe(Space.lg);
    const close = view.getByTestId('modal-close');
    expect(close.props.accessibilityLabel).toBe('Dismiss');
    expect(flattenStyle(close.props.style).backgroundColor).toBe('transparent');
    expect(view.getByTestId('modal-heading').props.numberOfLines).toBe(2);
    expect(view.queryByTestId('modal-back')).toBeNull();
  });

  it('lets connection status replace the title without growing the row', () => {
    const view = render(
      <ScreenHeader testID="page" title="Hidden" topInset={0} onBack={jest.fn()}
        status={<Text testID="pill">Reconnecting…</Text>} rightContent={<Text testID="trailing">Save</Text>} />,
    );
    expect(view.getByTestId('page-status')).toBeTruthy();
    expect(view.getByTestId('pill')).toBeTruthy();
    expect(view.queryByTestId('page-title')).toBeNull();
    expect(view.getByTestId('trailing')).toBeTruthy();
    expect(flattenStyle(view.getByTestId('page').props.style).paddingTop).toBe(Space.sm);
  });

  it('floats the dismiss control on glass when asked and renders no control without a handler', () => {
    const view = render(<ScreenHeader testID="page" title="Thread" topInset={0} onBack={jest.fn()} dismissAppearance="glass" />);
    expect(flattenStyle(view.getByTestId('page-back').props.style).backgroundColor).toContain('rgba(');
    view.rerender(<ScreenHeader testID="page" title="Thread" topInset={0} />);
    expect(view.queryByTestId('page-back')).toBeNull();
  });
});
