import { act, renderHook } from '@testing-library/react-native';
import { rememberUncertainSend, recoverUncertainSends, reconcilePromptReceipts, useUncertainSends } from './sendRecovery';
import type { AgentAdapter } from '@clawket/agent-protocol';
import { resolveUserMessageStatus } from './messageDelivery';
import type { UiMessage } from '../types/chat';
const message: UiMessage = { id: 'usr_recovery', role: 'user', text: 'Keep me', idempotencyKey: 'request', imageUris: ['file:///photo'], timestampMs: 10 };

it('hydrates bounded unknown candidates from existing cold-start history and returns only receipt metadata', async () => {
  const cached = Array.from({ length: 25 }, (_, index) => ({ ...message, id: `cold-${index}`, idempotencyKey: `cold-key-${index}`, sendUncertain: true }));
  const adapter = { capabilities: { promptStatus: true }, getPromptStatus: jest.fn().mockResolvedValue({ status: 'recorded', runId: 'receipt' }), prompt: jest.fn() } as unknown as AgentAdapter;
  const view = renderHook<readonly UiMessage[], { history: readonly UiMessage[] }>(({ history }) => useUncertainSends('cold-cache-only', history), { initialProps: { history: cached } });
  expect(view.result.current).toHaveLength(20);
  const receipts = await reconcilePromptReceipts(adapter, 'cold-cache-only', 'session', view.result.current, () => true);
  expect(receipts.size).toBe(5);
  expect([...receipts]).toEqual(Array.from({ length: 5 }, (_, index) => [`cold-key-${20 + index}`, 'receipt']));
  expect(adapter.prompt).not.toHaveBeenCalled();
  const history = cached.map(row => ({ ...row, bridgeRecordedRunId: receipts.get(row.idempotencyKey) }));
  view.rerender({ history });
  expect(view.result.current.at(-1)).toMatchObject({ text: 'Keep me', sendUncertain: true, bridgeRecordedRunId: 'receipt' });
  view.unmount();
  const empty = renderHook(() => useUncertainSends('cold-cache-only'));
  expect(empty.result.current).toEqual([]); // No separate transcript store was created.
  empty.unmount();
});

it('skips cold-start receipt reads when an exact native echo already exists and removes the uncertain copy', () => {
  const cached = { ...message, id: 'cached-cold', sendUncertain: true };
  const native = { ...message, id: 'native-cold' };
  const view = renderHook(() => useUncertainSends('cold-exact-echo', [cached, native]));
  expect(view.result.current).toEqual([]);
  expect(recoverUncertainSends([cached, native], view.result.current)).toEqual([native]);
  view.unmount();
});

it('retains uncertainty and attachments when a read-only receipt proves only Bridge recording', async () => {
  const scope = 'receipt-recorded';
  const getPromptStatus = jest.fn().mockResolvedValue({ status: 'recorded', runId: 'bridge-run' });
  const adapter = { capabilities: { promptStatus: true }, getPromptStatus, prompt: jest.fn() } as unknown as AgentAdapter;
  const view = renderHook(() => useUncertainSends(scope));
  act(() => rememberUncertainSend(scope, message));
  await act(async () => { await reconcilePromptReceipts(adapter, scope, 'session', view.result.current, () => true); });
  expect(getPromptStatus).toHaveBeenCalledWith('session', 'request');
  expect(view.result.current).toEqual([{ ...message, sendUncertain: true, bridgeRecordedRunId: 'bridge-run' }]);
  expect(resolveUserMessageStatus({ messages: recoverUncertainSends([], view.result.current), index: 0, runAcknowledged: true })).toBe('uncertain');
  expect(adapter.prompt).not.toHaveBeenCalled();
  await act(async () => { await reconcilePromptReceipts(adapter, scope, 'session', view.result.current, () => true); });
  expect(getPromptStatus).toHaveBeenCalledTimes(1);
  view.unmount();
});

it('ignores late receipts after the requesting scope has retired', async () => {
  const scope = 'receipt-retired';
  let resolve!: (value: unknown) => void;
  const getPromptStatus = jest.fn(() => new Promise(done => { resolve = done; }));
  const adapter = { capabilities: { promptStatus: true }, getPromptStatus } as unknown as AgentAdapter;
  const view = renderHook(() => useUncertainSends(scope));
  act(() => rememberUncertainSend(scope, message));
  let current = true;
  const pending = reconcilePromptReceipts(adapter, scope, 'session', view.result.current, () => current);
  current = false;
  await act(async () => { resolve({ status: 'recorded', runId: 'old' }); await pending; });
  expect(view.result.current[0].bridgeRecordedRunId).toBeUndefined();
  view.unmount();
});

it('bounds receipt reads and leaves unknown, failed and legacy requests unconfirmed', async () => {
  const scope = 'receipt-bounded';
  const getPromptStatus = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ status: 'unknown' });
  const adapter = { capabilities: { promptStatus: true }, getPromptStatus } as unknown as AgentAdapter;
  const view = renderHook(() => useUncertainSends(scope));
  act(() => { for (let i = 0; i < 10; i++) rememberUncertainSend(scope, { ...message, id: `id-${i}`, idempotencyKey: `key-${i}` }); });
  await act(async () => { await reconcilePromptReceipts(adapter, scope, 'session', view.result.current, () => true); });
  expect(getPromptStatus).toHaveBeenCalledTimes(5);
  expect(view.result.current.every(item => item.sendUncertain && !item.bridgeRecordedRunId)).toBe(true);
  adapter.capabilities.promptStatus = false;
  await act(async () => { await reconcilePromptReceipts(adapter, scope, 'session', view.result.current, () => true); });
  expect(getPromptStatus).toHaveBeenCalledTimes(5);
  view.unmount();
});

it('keeps late failures in their source scope across navigation and remount', () => {
  const first = renderHook<readonly UiMessage[], { scope: string }>(({ scope }) => useUncertainSends(scope), { initialProps: { scope: 'source' } });
  first.rerender({ scope: 'other' });
  act(() => rememberUncertainSend('source', message));
  expect(first.result.current).toEqual([]);
  first.unmount();
  const reopened = renderHook(() => useUncertainSends('source'));
  expect(reopened.result.current).toEqual([{ ...message, sendUncertain: true }]);
  reopened.unmount();
});
it('shows one uncertain bubble even after history refresh, never a sent check', () => {
  for (const history of [[], [message]]) {
    const recovered = recoverUncertainSends(history, [message]);
    expect(recovered).toHaveLength(1);
    expect(resolveUserMessageStatus({ messages: recovered, index: 0, runAcknowledged: true })).toBe('uncertain');
  }
});
it('uses only a matching backend identity to replace uncertainty', () => {
  const echo = { ...message, id: 'server-confirmed' };
  expect(recoverUncertainSends([message, echo], [message])).toEqual([echo]);
  const unrelated = { ...echo, idempotencyKey: 'other' };
  expect(recoverUncertainSends([unrelated], [message])).toHaveLength(2);
});

it('does not accept a reprojected uncertain cache row as a backend acknowledgement', () => {
  const cached = { ...message, id: 'h_user_cached', sendUncertain: true };
  const recovered = recoverUncertainSends([cached], [message]);
  expect(recovered).toEqual([{ ...message, sendUncertain: true }]);
  const confirmed = { ...message, id: 'canonical-native' };
  expect(recoverUncertainSends([cached, confirmed], [message])).toEqual([confirmed]);
});
