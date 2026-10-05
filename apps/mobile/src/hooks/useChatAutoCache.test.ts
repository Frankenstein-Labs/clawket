import { resetSessionHistory } from '../connection/session-reset';
import { act, renderHook } from '@testing-library/react-native';
import { useChatAutoCache } from './useChatAutoCache';
import { ChatCacheService } from '../services/chat-cache';

jest.mock('../services/chat-cache', () => ({
  ChatCacheService: {
    saveMessages: jest.fn(),
    deleteMessages: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('useChatAutoCache', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation((message?: unknown) => {
      if (typeof message === 'string' && message.includes('react-test-renderer is deprecated')) {
        return;
      }
    });
    (ChatCacheService.saveMessages as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    jest.useRealTimers();
  });

  it('rewrites the cache entry when sessionId is populated after initial save', async () => {
    const messages = [
      { id: '1', role: 'user', text: 'hello', streaming: false },
      { id: '2', role: 'assistant', text: 'world', streaming: false },
    ] as any;

    const { rerender } = renderHook((props: {
      sessionId?: string;
      sessionLabel?: string;
    }) => useChatAutoCache({
      gatewayConfigId: 'gw-1',
      agentId: 'agent-1',
      agentName: 'Agent',
      agentEmoji: 'A',
      sessionKey: 'agent:agent-1:main',
      sessionId: props.sessionId,
      sessionLabel: props.sessionLabel,
      messages,
      historyLoaded: true,
    }), {
      initialProps: {
        sessionId: undefined,
        sessionLabel: undefined,
      },
    });

    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    expect(ChatCacheService.saveMessages).toHaveBeenCalledTimes(1);
    expect(ChatCacheService.saveMessages).toHaveBeenLastCalledWith(expect.objectContaining({
      sessionId: undefined,
      sessionLabel: undefined,
    }), messages);

    rerender({
      sessionId: 'sess-1',
      sessionLabel: 'Main session',
    });

    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    expect(ChatCacheService.saveMessages).toHaveBeenCalledTimes(2);
    expect(ChatCacheService.saveMessages).toHaveBeenLastCalledWith(expect.objectContaining({
      sessionId: 'sess-1',
      sessionLabel: 'Main session',
    }), messages);
  });
  it('cancels the old debounce at Reset ACK before cache deletion even without a React render', async () => {
    const adapter = { connection: { id: 'gw-1' }, resetSession: jest.fn().mockResolvedValue(undefined) };
    const messages = [{ id: 'old', role: 'assistant', text: 'old reply' }] as any;
    renderHook(() => useChatAutoCache({ adapter: adapter as any, gatewayConfigId: 'gw-1', agentId: 'main',
      sessionKey: 'same-key', messages, historyLoaded: true }));
    await act(async () => { await resetSessionHistory(adapter as any, 'main', 'same-key'); jest.advanceTimersByTime(2000); });
    expect(ChatCacheService.deleteMessages).toHaveBeenCalledWith('gw-1', 'main', 'same-key');
    expect(ChatCacheService.saveMessages).not.toHaveBeenCalled();
  });

  it('keeps normal debounce after a rejected Reset', async () => {
    const adapter = { connection: { id: 'gw-1' }, resetSession: jest.fn().mockRejectedValue(new Error('denied')) };
    const messages = [{ id: 'old', role: 'assistant', text: 'old reply' }] as any;
    renderHook(() => useChatAutoCache({ adapter: adapter as any, gatewayConfigId: 'gw-1', agentId: 'main',
      sessionKey: 'same-key', messages, historyLoaded: true }));
    await act(async () => { await expect(resetSessionHistory(adapter as any, 'main', 'same-key')).rejects.toThrow('denied'); jest.advanceTimersByTime(2000); });
    expect(ChatCacheService.deleteMessages).not.toHaveBeenCalled();
    expect(ChatCacheService.saveMessages).toHaveBeenCalledWith(expect.objectContaining({ sessionKey: 'same-key' }), messages);
  });

});
