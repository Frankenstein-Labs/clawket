import React, { useState } from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Keyboard, Platform } from 'react-native';
import { Composer, type ComposerHandle } from './Composer';

const mockFocus = jest.fn();
const mockBlur = jest.fn();
jest.mock('react-native', () => {
  const ReactRuntime = require('react');
  const host = (name: string) => ReactRuntime.forwardRef(({ children, style, ...props }: any, ref: any) =>
    ReactRuntime.createElement(name, { ...props, ref, style: typeof style === 'function' ? style({ pressed: false }) : style }, children));
  return {
    View: host('View'), Text: host('Text'), Pressable: host('Pressable'), ActivityIndicator: host('ActivityIndicator'),
    Platform: { OS: 'android', select: (values: any) => values.android ?? values.default },
    Keyboard: { dismiss: jest.fn() }, DynamicColorIOS: (value: any) => value.light,
    StyleSheet: { create: (value: any) => value, flatten: (value: any) => value, absoluteFill: {} },
    PanResponder: { create: () => ({ panHandlers: {} }) },
    useWindowDimensions: () => ({ width: 393, height: 852, fontScale: 1, scale: 3 }),
  };
});
jest.mock('./CompositionSafeTextInput', () => {
  const ReactRuntime = require('react');
  return { CompositionSafeTextInput: ReactRuntime.forwardRef((props: any, ref: any) => {
    ReactRuntime.useImperativeHandle(ref, () => ({ focus: mockFocus, blur: mockBlur, clear: jest.fn() }), []);
    return ReactRuntime.createElement('TextInput', props);
  }) };
});
jest.mock('./PasteCapableTextInput', () => ({ PasteCapableTextInput: require('./CompositionSafeTextInput').CompositionSafeTextInput }));
jest.mock('lucide-react-native', () => new Proxy({}, { get: (_, name) => (props: any) => require('react').createElement(String(name), props) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (value: string) => value }) }));
jest.mock('../../theme', () => ({ useAppTheme: () => ({
  theme: require('../../theme/theme').buildTheme('light', 'light', require('../../theme/accents').builtInAccents.iceBlue),
}) }));
jest.mock('../chat/ChatPresentation', () => ({ useChatSurfaces: () => ({ outgoing: { backgroundColor: '#007aff', textColor: '#ffffff' } }) }));

const draft = 'First line\nSecond line\nThird line';
function Editor({ composerRef, choose, sent, initiallyExpanded = true }: {
  composerRef: React.RefObject<ComposerHandle | null>; choose: boolean; sent: () => void; initiallyExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  return <Composer ref={composerRef} value={draft} placeholder='Message' onChangeText={() => undefined}
    expanded={expanded} onExpandedChange={setExpanded} isRunning
    accessibilityLabels={{ add: 'Add', voice: 'Voice', stop: 'Stop', send: 'Send' }} testID='composer'
    onSend={() => {
      // Real ThreadScreen retires editing before presenting RunInputSheet;
      // real ThreadView then collapses the same Composer in this event.
      if (choose) { composerRef.current?.blur(); Keyboard.dismiss(); }
      sent(); setExpanded(false);
    }} />;
}
const layout = { nativeEvent: { layout: { width: 320, height: 140, x: 0, y: 0 } } };
beforeEach(() => { mockFocus.mockClear(); mockBlur.mockClear(); (Keyboard.dismiss as jest.Mock).mockClear(); });

it.each(['android', 'ios'])('does not reacquire focus after an expanded send opens a chooser on %s', (platform) => {
  Platform.OS = platform as typeof Platform.OS;
  const composerRef = React.createRef<ComposerHandle>();
  const sent = jest.fn();
  const view = render(<Editor composerRef={composerRef} choose sent={sent} />);
  const input = view.getByTestId('composer-input');
  act(() => composerRef.current?.focus());
  mockFocus.mockClear();
  fireEvent.press(view.getByTestId('composer-primary'));
  expect(sent).toHaveBeenCalledTimes(1);
  expect(mockBlur).toHaveBeenCalledTimes(1);
  expect(Keyboard.dismiss).toHaveBeenCalledTimes(1);
  expect(mockFocus).not.toHaveBeenCalled();
  fireEvent(view.getByTestId('composer-input-shell'), 'layout', layout);
  expect(mockFocus).not.toHaveBeenCalled();
  expect(view.getByTestId('composer-input')).toBe(input);
  expect(input.props.value).toBe(draft);
  expect(view.queryByTestId('composer-editor-header')).toBeNull();
});

it.each(['android', 'ios'])('keeps manual expansion and collapse focusing the same editor on %s', (platform) => {
  Platform.OS = platform as typeof Platform.OS;
  const composerRef = React.createRef<ComposerHandle>();
  const view = render(<Editor composerRef={composerRef} choose={false} sent={jest.fn()} initiallyExpanded={false} />);
  const input = view.getByTestId('composer-input');
  fireEvent.press(view.getByTestId('composer-expand'));
  fireEvent(view.getByTestId('composer-input-shell'), 'layout', layout);
  expect(mockFocus).toHaveBeenCalledTimes(2);
  mockFocus.mockClear();
  fireEvent.press(view.getByTestId('composer-collapse'));
  fireEvent(view.getByTestId('composer-input-shell'), 'layout', layout);
  expect(mockFocus).toHaveBeenCalledTimes(2);
  expect(view.getByTestId('composer-input')).toBe(input);
  expect(input.props.value).toBe(draft);
  expect(Keyboard.dismiss).not.toHaveBeenCalled();
});

it('retires delayed layout focus on explicit blur and permits a later manual edit', () => {
  const composerRef = React.createRef<ComposerHandle>();
  const view = render(<Editor composerRef={composerRef} choose={false} sent={jest.fn()} initiallyExpanded={false} />);
  fireEvent.press(view.getByTestId('composer-expand'));
  mockFocus.mockClear();
  act(() => composerRef.current?.blur());
  fireEvent(view.getByTestId('composer-input-shell'), 'layout', layout);
  expect(mockFocus).not.toHaveBeenCalled();
  fireEvent.press(view.getByTestId('composer-collapse'));
  fireEvent(view.getByTestId('composer-input-shell'), 'layout', layout);
  expect(mockFocus).toHaveBeenCalledTimes(2);
});

it('does not dismiss or blur an ordinary compact send', () => {
  const composerRef = React.createRef<ComposerHandle>();
  const sent = jest.fn();
  const view = render(<Editor composerRef={composerRef} choose={false} sent={sent} initiallyExpanded={false} />);
  fireEvent.press(view.getByTestId('composer-primary'));
  expect(sent).toHaveBeenCalledTimes(1);
  expect(mockBlur).not.toHaveBeenCalled();
  expect(Keyboard.dismiss).not.toHaveBeenCalled();
});
