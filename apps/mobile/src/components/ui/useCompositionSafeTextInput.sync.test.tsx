import React from 'react';
import { act, render } from '@testing-library/react-native';
import { Platform, type TextInput, type TextInputProps } from 'react-native';
import { useCompositionSafeTextInput } from './useCompositionSafeTextInput';

type NativeEditor = TextInput & { readText(): string; typeText(text: string): void };
type Commit = { value?: string; defaultValue?: string };

// Contract fixture for the installed RN TextInput: defaultValue supplies the
// React/Fabric text baseline, while value issues the event-count-aware native
// synchronization command. Native edits do not change that React baseline.
// This verifies our public-prop handoff; actual Fabric/IME behavior needs a device.
type ContractProps = TextInputProps & {
  commits: Commit[];
  afterCommit?: (value: string | undefined, editor: NativeEditor) => void;
};
const ContractInput = React.forwardRef<NativeEditor, ContractProps>(
  function ContractInput({ value, defaultValue, onChangeText, commits, afterCommit }, ref) {
    const nativeText = React.useRef(value ?? defaultValue ?? '');
    const reactText = React.useRef(value ?? defaultValue);
    const lastNativeText = React.useRef(value);
    const latestChange = React.useRef(onChangeText);
    latestChange.current = onChangeText;
    const instance = React.useMemo(() => ({
      readText: () => nativeText.current,
      typeText: (text: string) => {
        nativeText.current = text;
        lastNativeText.current = text;
        latestChange.current?.(text);
      },
      clear: () => { nativeText.current = ''; },
      // This low-level prop write does not establish the TextInput's React
      // baseline or its state-synchronization command contract.
      setNativeProps: jest.fn(),
    }) as unknown as NativeEditor, []);
    React.useImperativeHandle(ref, () => instance, [instance]);
    React.useLayoutEffect(() => {
      commits.push({ value, defaultValue });
      const text = value ?? defaultValue;
      if (reactText.current !== text) {
        nativeText.current = text ?? '';
        reactText.current = text;
      }
      if (typeof value === 'string' && lastNativeText.current !== value) {
        nativeText.current = value;
        lastNativeText.current = value;
      }
      afterCommit?.(value, instance);
    });
    return React.createElement('ContractTextInput');
  },
);

const suspendedRead = new Promise<never>(() => {});
function Editor({ value, editorRef, commits, onChangeText = () => {}, attached = true, suspend = false, afterCommit }: {
  value: string;
  editorRef: React.RefObject<NativeEditor | null> | null;
  commits: Commit[];
  onChangeText?: (text: string) => void;
  attached?: boolean;
  suspend?: boolean;
  afterCommit?: ContractProps['afterCommit'];
}) {
  const bindings = useCompositionSafeTextInput({ forwardedRef: editorRef, value, onChangeText });
  if (suspend) throw suspendedRead;
  return attached ? <ContractInput
    {...bindings.valueProps}
    ref={bindings.handleInputRef}
    onChangeText={bindings.handleChangeText}
    commits={commits}
    afterCommit={afterCommit}
  /> : null;
}

describe('iOS external text synchronization contract', () => {
  const originalPlatform = Platform.OS;
  beforeEach(() => { Platform.OS = 'ios'; });
  afterAll(() => { Platform.OS = originalPlatform; });

  it('restores a late draft through the child commit before releasing native ownership', () => {
    const editorRef = React.createRef<NativeEditor>();
    const commits: Commit[] = [];
    const view = render(<Editor value="" editorRef={editorRef} commits={commits} />);
    const originalInput = editorRef.current;
    view.rerender(<Editor value="restored draft" editorRef={editorRef} commits={commits} />);
    expect(editorRef.current?.readText()).toBe('restored draft');
    expect(commits.slice(-2)).toEqual([
      { value: 'restored draft', defaultValue: 'restored draft' },
      { value: undefined, defaultValue: 'restored draft' },
    ]);
    view.rerender(<Editor value="restored draft" editorRef={editorRef} commits={commits} />);
    expect(editorRef.current).toBe(originalInput);
    expect(editorRef.current?.readText()).toBe('restored draft');
  });

  it('restores the same React baseline after native editing and clears it', () => {
    const editorRef = React.createRef<NativeEditor>();
    const commits: Commit[] = [];
    const view = render(<Editor value="saved" editorRef={editorRef} commits={commits} />);
    act(() => { editorRef.current?.typeText('saved and edited'); });
    view.rerender(<Editor value="saved and edited" editorRef={editorRef} commits={commits} />);
    view.rerender(<Editor value="saved" editorRef={editorRef} commits={commits} />);
    expect(editorRef.current?.readText()).toBe('saved');
    view.rerender(<Editor value="" editorRef={editorRef} commits={commits} />);
    expect(editorRef.current?.readText()).toBe('');
    expect(commits.at(-1)).toEqual({ value: undefined, defaultValue: '' });
  });

  it('does not write a controlled value for Chinese composing echoes, including after a replacement', () => {
    const editorRef = React.createRef<NativeEditor>();
    const commits: Commit[] = [];
    const onChangeText = jest.fn();
    const view = render(<Editor value="" editorRef={editorRef} commits={commits} onChangeText={onChangeText} />);
    view.rerender(<Editor value="restored" editorRef={editorRef} commits={commits} onChangeText={onChangeText} />);
    commits.length = 0;
    for (const text of ['p', 'pin', '拼', '拼音']) {
      act(() => { editorRef.current?.typeText(text); });
      view.rerender(<Editor value={text} editorRef={editorRef} commits={commits} onChangeText={onChangeText} />);
      expect(editorRef.current?.readText()).toBe(text);
    }
    expect(commits.every(commit => commit.value === undefined)).toBe(true);
    expect(onChangeText.mock.calls.map(([text]) => text)).toEqual(['p', 'pin', '拼', '拼音']);
  });

  it('retains a restored baseline when the native host attaches after the external replacement', () => {
    const editorRef = React.createRef<NativeEditor>();
    const commits: Commit[] = [];
    const view = render(<Editor value="" editorRef={editorRef} commits={commits} attached={false} />);
    view.rerender(<Editor value="late host draft" editorRef={editorRef} commits={commits} attached={false} />);
    view.rerender(<Editor value="late host draft" editorRef={editorRef} commits={commits} />);
    expect(editorRef.current?.readText()).toBe('late host draft');
    expect(commits.at(-1)?.value).toBeUndefined();
  });

  it('does not overwrite new native editing while its parent echo is delayed after a clear', () => {
    const editorRef = React.createRef<NativeEditor>();
    const commits: Commit[] = [];
    const view = render(<Editor value="draft to send" editorRef={editorRef} commits={commits} />);
    view.rerender(<Editor value="" editorRef={editorRef} commits={commits} />);
    commits.length = 0;
    act(() => { editorRef.current?.typeText('new draft'); });
    view.rerender(<Editor value="" editorRef={editorRef} commits={commits} />);
    expect(editorRef.current?.readText()).toBe('new draft');
    view.rerender(<Editor value="new draft" editorRef={editorRef} commits={commits} />);
    expect(commits.every(commit => commit.value === undefined)).toBe(true);
    expect(editorRef.current?.readText()).toBe('new draft');
  });

  it('does not consume an external replacement in an abandoned render', () => {
    const editorRef = React.createRef<NativeEditor>();
    const commits: Commit[] = [];
    const tree = (value: string, suspend = false) => <React.Suspense fallback={null}>
      <Editor value={value} editorRef={editorRef} commits={commits} suspend={suspend} />
    </React.Suspense>;
    const view = render(tree(''));
    view.rerender(tree('restored after suspension', true));
    view.rerender(tree('restored after suspension'));
    expect(editorRef.current?.readText()).toBe('restored after suspension');
    expect(commits.some(commit => commit.value === 'restored after suspension')).toBe(true);
    expect(commits.at(-1)?.value).toBeUndefined();
  });

  it('keeps the same native input and restored text when its forwarded ref detaches briefly', () => {
    const editorRef = React.createRef<NativeEditor>();
    const commits: Commit[] = [];
    const view = render(<Editor value="" editorRef={editorRef} commits={commits} />);
    const originalInput = editorRef.current;
    view.rerender(<Editor value="restored" editorRef={null} commits={commits} />);
    view.rerender(<Editor value="restored" editorRef={editorRef} commits={commits} />);
    expect(editorRef.current).toBe(originalInput);
    expect(editorRef.current?.readText()).toBe('restored');
    expect(commits.at(-1)?.value).toBeUndefined();
  });

  it('does not treat a newer native edit as another external replacement during the handoff', () => {
    const editorRef = React.createRef<NativeEditor>();
    const commits: Commit[] = [];
    let edited = false;
    const afterCommit = (value: string | undefined, editor: NativeEditor) => {
      if (value === 'replacement' && !edited) {
        edited = true;
        editor.typeText('new native edit');
      }
    };
    const view = render(<Editor value="" editorRef={editorRef} commits={commits} afterCommit={afterCommit} />);
    view.rerender(<Editor value="replacement" editorRef={editorRef} commits={commits} afterCommit={afterCommit} />);
    expect(editorRef.current?.readText()).toBe('new native edit');
    commits.length = 0;
    view.rerender(<Editor value="new native edit" editorRef={editorRef} commits={commits} />);
    expect(commits.every(commit => commit.value === undefined)).toBe(true);
    expect(editorRef.current?.readText()).toBe('new native edit');
  });
});
