import React, { createRef } from 'react';
import { act, render } from '@testing-library/react-native';
import { SessionPanelHost, type SessionPanelHandle } from './SessionPanelHost';
import { SessionPanel } from './SessionPanel';

jest.mock('./SessionPanel', () => ({ SessionPanel: jest.fn(() => null) }));
const panel = jest.mocked(SessionPanel);
const current = () => panel.mock.calls.at(-1)![0];
const scope = { connectionId: 'claude-device', agentId: 'claude-code', sessionKey: 'native-history' };

it('opens and closes without rendering the parent, retains dismissal, and scopes each opening', () => {
  const ref = createRef<SessionPanelHandle>();
  const onVisibilityChange = jest.fn();
  const onAfterClose = jest.fn();
  let parentRenders = 0;
  function Parent() {
    parentRenders += 1;
    return <SessionPanelHost ref={ref} currentAgentId="main" currentSessionKey="main"
      onVisibilityChange={onVisibilityChange} onAfterClose={onAfterClose} onSelectSession={jest.fn()} />;
  }
  render(<Parent />);
  expect(current().visible).toBe(false);
  act(() => ref.current!.open(scope));
  expect(parentRenders).toBe(1);
  expect(current()).toMatchObject({ visible: true, connectionId: scope.connectionId, currentAgentId: scope.agentId, currentSessionKey: scope.sessionKey });
  act(() => ref.current!.open(scope));
  expect(onVisibilityChange.mock.calls).toEqual([[true]]);
  act(() => current().onClose());
  expect(current().visible).toBe(false);
  expect(current().onAfterClose).toBe(onAfterClose);
  act(() => current().onAfterClose!());
  expect(onAfterClose).toHaveBeenCalledTimes(1);
  act(() => ref.current!.close());
  expect(onVisibilityChange.mock.calls).toEqual([[true], [false]]);
  act(() => ref.current!.open({ connectionId: 'openclaw', agentId: 'main', sessionKey: 'main' }));
  expect(current()).toMatchObject({ visible: true, connectionId: 'openclaw', currentAgentId: 'main', currentSessionKey: 'main' });
  expect(parentRenders).toBe(1);
});

it('uses current action callbacks without remounting the presentation host', () => {
  const ref = createRef<SessionPanelHandle>();
  const props = { ref, currentAgentId: 'main', currentSessionKey: 'main', onVisibilityChange: jest.fn(), onSelectSession: jest.fn() };
  const tree = render(<SessionPanelHost {...props} />);
  act(() => ref.current!.open(scope));
  const select = jest.fn();
  tree.rerender(<SessionPanelHost {...props} onSelectSession={select} permissionDenied />);
  expect(current().visible).toBe(true);
  expect(current().onSelectSession).toBe(select);
  expect(current().permissionDenied).toBe(true);
});
