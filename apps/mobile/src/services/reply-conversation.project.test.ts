import { CAPABILITY_MATRIX, type AgentAdapter, type BackendKind } from '@clawket/agent-protocol';
import { createReplyConversation } from './reply-conversation';
import { StorageService } from './storage';

jest.mock('./storage', () => ({ StorageService: { getComposerDraft: jest.fn(), setComposerDraft: jest.fn() } }));

const reply = { id: 'selected-reply', role: 'assistant' as const, text: 'A reviewable quote' };
function adapter(kind: BackendKind = 'codex'): AgentAdapter {
  return {
    connection: { id: `quote-${kind}`, backendKind: kind },
    capabilities: CAPABILITY_MATRIX[kind],
    createSession: jest.fn(async (_agent: string, options?: { projectId?: string }) => ({ key: `new-${options?.projectId ?? 'default'}` })),
    prompt: jest.fn(), steer: jest.fn(), deleteSession: jest.fn(),
  } as unknown as AgentAdapter;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(StorageService.getComposerDraft).mockResolvedValue(null);
  jest.mocked(StorageService.setComposerDraft).mockResolvedValue(undefined);
});

test.each(['codex', 'pi', 'claude-code'] as const)('quotes in the reported %s project without forking or sending', async kind => {
  const backend = adapter(kind);
  const session = await createReplyConversation(backend, 'agent', 'source', reply, 'opaque-project');
  expect(backend.createSession).toHaveBeenCalledWith('agent', { projectId: 'opaque-project' });
  expect(session.key).toBe('new-opaque-project');
  expect(StorageService.setComposerDraft).toHaveBeenCalledWith('agent', session.key, reply.text, backend.connection.id);
  expect(backend.prompt).not.toHaveBeenCalled();
  expect(backend.steer).not.toHaveBeenCalled();
  expect(backend.deleteSession).not.toHaveBeenCalled();
});

test.each(['openclaw', 'hermes', 'codex', 'pi', 'claude-code'] as const)('keeps missing-project %s creation on the legacy path', async kind => {
  const backend = adapter(kind);
  await createReplyConversation(backend, 'agent', 'source', reply);
  expect(backend.createSession).toHaveBeenCalledWith('agent', undefined);
  expect(backend.prompt).not.toHaveBeenCalled();
});

test('a draft-write retry retains its returned project target and does not borrow another project', async () => {
  const backend = adapter();
  jest.mocked(StorageService.setComposerDraft).mockRejectedValueOnce(new Error('disk full'));
  await expect(createReplyConversation(backend, 'agent', 'source', reply, 'project-a')).rejects.toThrow('disk full');
  await createReplyConversation(backend, 'agent', 'source', reply, 'project-b');
  await createReplyConversation(backend, 'agent', 'source', reply, 'project-a');
  expect(backend.createSession).toHaveBeenCalledTimes(2);
  expect(jest.mocked(backend.createSession!).mock.calls).toEqual([
    ['agent', { projectId: 'project-a' }], ['agent', { projectId: 'project-b' }],
  ]);
  expect(jest.mocked(StorageService.setComposerDraft).mock.calls.map(call => call[1])).toEqual([
    'new-project-a', 'new-project-b', 'new-project-a',
  ]);
});
