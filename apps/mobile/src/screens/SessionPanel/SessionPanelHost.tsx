import React, { useCallback, useImperativeHandle, useRef, useState } from 'react';
import { SessionPanel, type SessionPanelProps } from './SessionPanel';

type Scope = Readonly<{ connectionId: string; agentId: string; sessionKey: string }>;
export type SessionPanelHandle = Readonly<{
  open: (scope: Scope) => void;
  close: () => void;
}>;

/** Keep sheet presentation out of the navigator's state: opening must not
 * render every mounted screen (including long transcripts and the roster). */
export function SessionPanelHost({
  ref,
  onVisibilityChange,
  ...props
}: Omit<SessionPanelProps, 'visible' | 'onClose'> & {
  ref: React.Ref<SessionPanelHandle>;
  onVisibilityChange: (visible: boolean) => void;
}): React.JSX.Element {
  const [visible, setVisible] = useState(false);
  const [scope, setScope] = useState<Scope | null>(null);
  const visibleRef = useRef(false);
  const changeVisibility = useCallback((next: boolean) => {
    if (visibleRef.current === next) return;
    visibleRef.current = next;
    setVisible(next);
    onVisibilityChange(next);
  }, [onVisibilityChange]);
  const close = useCallback(() => changeVisibility(false), [changeVisibility]);
  useImperativeHandle(ref, () => ({
    open: (next) => { setScope(next); changeVisibility(true); },
    close,
  }), [changeVisibility, close]);
  return <SessionPanel {...props}
    connectionId={scope?.connectionId ?? props.connectionId}
    currentAgentId={scope?.agentId ?? props.currentAgentId}
    currentSessionKey={scope?.sessionKey ?? props.currentSessionKey}
    visible={visible} onClose={close} />;
}
