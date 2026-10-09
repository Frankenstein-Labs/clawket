import type { ConnectionRecord, SessionUpdate } from '@clawket/agent-protocol';
import { OpenHandsCloudAdapter } from './openhands-cloud';
import { CLOUD_AGENT_ID } from '../openhands/cloud-events';
import type { CloudConversation, OpenHandsCloudApi } from '../openhands/cloud-client';

const RECORD: ConnectionRecord = {
  id: 'openhands-cloud',
  backendKind: 'openhands-cloud',
  transportKind: 'custom',
  label: 'OpenHands Cloud',
  url: 'https://app.all-hands.dev',
  createdAt: 1,
};

function conversation(overrides: Partial<CloudConversation> = {}): CloudConversation {
  return {
    id: 'conv-1',
    title: 'Fix the build',
    updatedAt: '2026-01-02T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
    executionStatus: 'idle',
    sandboxStatus: 'running',
    conversationUrl: null,
    sessionApiKey: null,
    ...overrides,
  };
}

function fakeApi(overrides: Partial<OpenHandsCloudApi> = {}): OpenHandsCloudApi {
  return {
    getOrganizations: jest.fn().mockResolvedValue({ items: [], currentOrgId: null }),
    searchConversations: jest.fn().mockResolvedValue([conversation()]),
    createConversation: jest.fn().mockResolvedValue({ id: 'conv-2' }),
    getConversation: jest.fn().mockResolvedValue(conversation()),
    deleteConversation: jest.fn().mockResolvedValue(undefined),
    searchEvents: jest.fn().mockResolvedValue([]),
    sendUserMessage: jest.fn().mockResolvedValue(undefined),
    interruptConversation: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createAdapter(api: OpenHandsCloudApi): OpenHandsCloudAdapter {
  return new OpenHandsCloudAdapter(RECORD, { clientFactory: async () => api });
}

describe('OpenHandsCloudAdapter', () => {
  test('becomes ready once the Cloud API accepts the credential', async () => {
    const adapter = createAdapter(fakeApi());
    await adapter.connect();
    expect(adapter.state).toBe('ready');
  });

  test('goes offline with an unauthorized adapter error when the credential is rejected', async () => {
    const adapter = createAdapter(fakeApi({
      getOrganizations: jest.fn().mockRejectedValue(Object.assign(new Error('Unauthorized'), { status: 401 })),
    }));

    await expect(adapter.connect()).rejects.toMatchObject({ code: 'unauthorized' });
    expect(adapter.state).toBe('offline');
  });

  test('reports a network failure as offline, never as an invalid credential', async () => {
    const adapter = createAdapter(fakeApi({
      getOrganizations: jest.fn().mockRejectedValue(new TypeError('Network request failed')),
    }));

    await expect(adapter.connect()).rejects.toMatchObject({ code: 'network' });
    expect(adapter.state).toBe('offline');
  });

  test('reports an aborted request as a timeout', async () => {
    const adapter = createAdapter(fakeApi({
      getOrganizations: jest.fn().mockRejectedValue(Object.assign(new Error('Aborted'), { name: 'AbortError' })),
    }));

    await expect(adapter.connect()).rejects.toMatchObject({ code: 'timeout' });
  });

  test('exposes one sessions-mode agent and maps conversations to sessions', async () => {
    const adapter = createAdapter(fakeApi());
    await expect(adapter.listAgents()).resolves.toEqual([
      expect.objectContaining({ agentId: CLOUD_AGENT_ID, entryMode: 'sessions', isMain: true }),
    ]);
    await expect(adapter.listSessions()).resolves.toEqual([
      expect.objectContaining({ key: 'conv-1', title: 'Fix the build', agentId: CLOUD_AGENT_ID, hasActiveRun: false }),
    ]);
  });

  test('sending a message records the user turn, starts a run, and polls the runtime', async () => {
    const api = fakeApi();
    const adapter = createAdapter(api);
    const updates: SessionUpdate[] = [];
    adapter.on('update', (update) => updates.push(update));

    const { runId } = await adapter.prompt('conv-1', { text: 'Hello', idempotencyKey: 'k1' });

    expect(api.sendUserMessage).toHaveBeenCalledWith('conv-1', 'Hello');
    expect(updates).toContainEqual({ type: 'run_started', sessionKey: 'conv-1', runId });
    adapter.disconnect();
  });

  test('cancelling interrupts the conversation and closes the run', async () => {
    const api = fakeApi();
    const adapter = createAdapter(api);
    const updates: SessionUpdate[] = [];
    adapter.on('update', (update) => updates.push(update));

    await adapter.cancel('conv-1');

    expect(api.interruptConversation).toHaveBeenCalledWith('conv-1');
    expect(updates).toContainEqual(expect.objectContaining({ type: 'run_finished', stopReason: 'cancelled' }));
  });

  test('deleting a session removes the Cloud conversation', async () => {
    const api = fakeApi();
    const adapter = createAdapter(api);
    await adapter.deleteSession('conv-1');
    expect(api.deleteConversation).toHaveBeenCalledWith('conv-1');
  });
});
