import { useCallback, useLayoutEffect, useRef, useState, type ForwardedRef } from 'react';
import { Platform, type TextInput, type TextInputProps } from 'react-native';

type Params = {
  forwardedRef: ForwardedRef<TextInput>;
  value: string;
  onChangeText?: TextInputProps['onChangeText'];
};

type CompositionSafeTextInputBindings = {
  handleChangeText: NonNullable<TextInputProps['onChangeText']>;
  handleInputRef: (input: TextInput | null | undefined) => void;
  valueProps: Pick<TextInputProps, 'defaultValue' | 'value'>;
};

function assignRef<T>(ref: ForwardedRef<T>, value: T | null): void {
  if (typeof ref === 'function') {
    ref(value);
    return;
  }
  if (ref) ref.current = value;
}

export function useCompositionSafeTextInput({
  forwardedRef,
  value,
  onChangeText,
}: Params): CompositionSafeTextInputBindings {
  const nativeValueRef = useRef(value);
  const nativeEditRevisionRef = useRef(0);
  const [sync, setSync] = useState({
    propValue: value,
    defaultValue: value,
    pending: false,
    nativeEditRevision: 0,
  });

  // Track prop transitions in React state, so an abandoned render cannot consume
  // a draft restore. Native typing echoes leave the React text baseline alone.
  if (Platform.OS === 'ios' && value !== sync.propValue) {
    const external = value !== nativeValueRef.current;
    setSync({
      propValue: value,
      defaultValue: external ? value : sync.defaultValue,
      pending: external,
      nativeEditRevision: nativeEditRevisionRef.current,
    });
  }

  const handleInputRef = useCallback((input: TextInput | null | undefined) => {
    assignRef(forwardedRef, input ?? null);
  }, [forwardedRef]);

  const handleChangeText = useCallback((nextValue: string) => {
    nativeEditRevisionRef.current += 1;
    nativeValueRef.current = nextValue;
    onChangeText?.(nextValue);
  }, [onChangeText]);

  // The child RN TextInput layout effect first synchronizes one external value
  // with its own native event count. Then release value, retaining the updated
  // defaultValue for later Fabric commits/late host attachment. setNativeProps
  // alone leaves that React text baseline stale, while defaultValue alone cannot
  // restore A after native editing B when the previous React baseline is also A.
  useLayoutEffect(() => {
    if (Platform.OS !== 'ios' || !sync.pending) return;
    if (nativeEditRevisionRef.current === sync.nativeEditRevision) {
      nativeValueRef.current = sync.defaultValue;
    }
    setSync(current => current === sync ? { ...current, pending: false } : current);
  }, [sync]);

  return {
    handleChangeText,
    handleInputRef,
    valueProps: Platform.OS === 'ios'
      ? { defaultValue: sync.defaultValue, ...(sync.pending ? { value: sync.defaultValue } : {}) }
      : { value },
  };
}
