import {
  createOpenHandsCloudClient,
  isUnauthorizedCloudError,
  OPENHANDS_CLOUD_REQUEST_TIMEOUT_MS,
  OpenHandsCloudRequestError,
  verifyOpenHandsCloudSession,
  type CloudRequest,
  type CloudResponse,
  type CloudTransport,
  type OpenHandsCloudApi,
} from './cloud-client';
import type { OpenHandsCredentialStore } from './credential-store';

function createCredentials(token: string | null): jest.Mocked<OpenHandsCredentialStore> {
  return {
    getAccessToken: jest.fn(async () => token),
    saveAccessToken: jest.fn(),
    clearAccessToken: jest.fn(),
  };
}

/** Records every path the client requests and answers from a fixed route table. */
function recordingTransport(routes: Record<string, (request: CloudRequest) => CloudResponse>): {
  transport: CloudTransport;
  paths: string[];
} {
  const paths: string[] = [];
  return {
    paths,
    transport: async (request) => {
      paths.push(request.path);
      const respond = routes[request.path];
      if (!respond) return { status: 404, data: undefined };
      return respond(request);
    },
  };
}

function ok(data: unknown): CloudResponse {
  return { status: 200, data };
}

describe('OpenHands Cloud client', () => {
  test('rejects blank access tokens before creating a client', () => {
    expect(() => createOpenHandsCloudClient(' \n ', null, jest.fn())).toThrow(
      'OpenHands access token must not be empty.',
    );
  });

  test('verifies the stored token through the organizations endpoint', async () => {
    const { transport, paths } = recordingTransport({
      '/api/organizations': () => ok({ items: [{ id: 'org-1' }], current_org_id: 'org-1' }),
    });

    await expect(verifyOpenHandsCloudSession(createCredentials('cloud-token'), transport)).resolves.toEqual({
      items: [{ id: 'org-1' }],
      currentOrgId: 'org-1',
    });
    expect(paths).toEqual(['/api/organizations']);
  });

  test('fails closed when no token is stored', async () => {
    const transport = jest.fn();
    await expect(verifyOpenHandsCloudSession(createCredentials(null), transport)).rejects.toThrow(
      'OpenHands Cloud is not authenticated.',
    );
    expect(transport).not.toHaveBeenCalled();
  });

  test('searches conversations newest first and keeps the runtime host', async () => {
    const { transport, paths } = recordingClient();
    const client = createOpenHandsCloudClient('token', null, transport);

    await expect(client.searchConversations()).resolves.toEqual([
      {
        id: 'conv-1',
        title: 'Fix the build',
        updatedAt: '2026-01-02T00:00:00Z',
        createdAt: '2026-01-01T00:00:00Z',
        executionStatus: 'running',
        sandboxStatus: 'running',
        conversationUrl: 'https://runtime.example/pxy/abc',
        sessionApiKey: 'session-token',
      },
    ]);
    expect(paths[0]).toContain('/api/v1/app-conversations/search');
    expect(paths[0]).toContain('UPDATED_AT_DESC');
  });

  test('surfaces an HTTP status as a classified error', async () => {
    const client = createOpenHandsCloudClient('token', null, async () => ({ status: 401, data: undefined }));
    await expect(client.getOrganizations()).rejects.toBeInstanceOf(OpenHandsCloudRequestError);
  });

  test('classifies an invalid credential as unauthorized', () => {
    expect(isUnauthorizedCloudError(new OpenHandsCloudRequestError(401))).toBe(true);
    expect(isUnauthorizedCloudError(new OpenHandsCloudRequestError(403))).toBe(true);
  });

  test('does not treat a transient failure as an invalid credential', () => {
    expect(isUnauthorizedCloudError(new OpenHandsCloudRequestError(500))).toBe(false);
    expect(isUnauthorizedCloudError(new OpenHandsCloudRequestError(503))).toBe(false);
    expect(isUnauthorizedCloudError(new TypeError('Network request failed'))).toBe(false);
    expect(isUnauthorizedCloudError(undefined)).toBe(false);
  });

  test('bounds every request so an unreachable host cannot hang the sign-in', async () => {
    const originalFetch = globalThis.fetch;
    const signals: Array<AbortSignal | undefined> = [];
    globalThis.fetch = jest.fn((_url: string, init?: { signal?: AbortSignal }) => {
      const signal = init?.signal;
      signals.push(signal);
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
        });
      });
    }) as unknown as typeof fetch;

    try {
      const client = createOpenHandsCloudClient('token');
      jest.useFakeTimers();
      const pending = client.getOrganizations();
      expect(signals[0]).toBeInstanceOf(AbortSignal);
      jest.advanceTimersByTime(OPENHANDS_CLOUD_REQUEST_TIMEOUT_MS);
      expect(signals[0]?.aborted).toBe(true);
      await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    } finally {
      jest.useRealTimers();
      globalThis.fetch = originalFetch;
    }
  });
});

function recordingClient(): { transport: CloudTransport; paths: string[]; api: OpenHandsCloudApi } {
  const { transport, paths } = recordingTransport({
    [`/api/v1/app-conversations/search?limit=30&sort_order=UPDATED_AT_DESC`]: () => ok({
      items: [{
        id: 'conv-1',
        title: 'Fix the build',
        updated_at: '2026-01-02T00:00:00Z',
        created_at: '2026-01-01T00:00:00Z',
        execution_status: 'running',
        sandbox_status: 'running',
        conversation_url: 'https://runtime.example/pxy/abc',
        session_api_key: 'session-token',
      }],
    }),
  });
  return { transport, paths, api: createOpenHandsCloudClient('token', null, transport) };
}
