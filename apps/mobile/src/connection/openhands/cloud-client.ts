import { openHandsCredentialStore, type OpenHandsCredentialStore } from './credential-store';

export const OPENHANDS_CLOUD_API_HOST = 'https://app.all-hands.dev';

/**
 * Upper bound for one Cloud REST call. An unreachable host or a stalled read
 * must reject so a connect attempt can never hang forever; React Native's
 * `fetch` keeps no default timeout of its own.
 */
export const OPENHANDS_CLOUD_REQUEST_TIMEOUT_MS = 15_000;

/** Stable registry id so signing in again updates the same account row. */
export const OPENHANDS_CLOUD_CONNECTION_ID = 'openhands-cloud';

type CloudOrganization = Readonly<Record<string, unknown>>;
export type CloudOrganizationsResult = Readonly<{
  items: ReadonlyArray<CloudOrganization>;
  currentOrgId: string | null;
}>;

/** Credential-free view of a Cloud conversation, matching the official `CloudAppConversation`. */
export type CloudConversation = Readonly<{
  id: string;
  title: string | null;
  updatedAt: string | null;
  createdAt: string | null;
  executionStatus: string | null;
  sandboxStatus: string | null;
  /** Per-conversation runtime host once the sandbox is provisioned. */
  conversationUrl: string | null;
  /** Per-conversation bearer the runtime accepts as `X-Session-API-Key`. */
  sessionApiKey: string | null;
}>;

/** A single agent-server event; the shape is open because kinds evolve server-side. */
export type CloudEvent = Readonly<{ id?: string; kind: string; timestamp?: string; source?: string }>
  & Readonly<Record<string, unknown>>;

export type OpenHandsCloudApi = Readonly<{
  getOrganizations(): Promise<CloudOrganizationsResult>;
  /** Newest conversations first, matching the official Cloud app. */
  searchConversations(limit?: number): Promise<ReadonlyArray<CloudConversation>>;
  createConversation(initialText: string): Promise<Readonly<{ id: string }>>;
  getConversation(conversationId: string): Promise<CloudConversation | null>;
  deleteConversation(conversationId: string): Promise<void>;
  searchEvents(conversationId: string, options?: { limit?: number }): Promise<ReadonlyArray<CloudEvent>>;
  sendUserMessage(conversationId: string, text: string): Promise<void>;
  interruptConversation(conversationId: string): Promise<void>;
}>;

/** One Cloud call, path-relative to the API host, with an optional JSON body. */
export type CloudRequest = Readonly<{ path: string; method: 'GET' | 'POST' | 'DELETE'; body?: unknown }>;

/** A Cloud response reduced to a status and an already-parsed body. */
export type CloudResponse = Readonly<{ status: number; data: unknown }>;

/** The seam that turns a {@link CloudRequest} into a {@link CloudResponse}. */
export type CloudTransport = (request: CloudRequest) => Promise<CloudResponse>;

/** Carries the HTTP status so callers can tell an invalid token from a transient failure. */
export class OpenHandsCloudRequestError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`OpenHands Cloud request failed (${status}).`);
    this.name = 'OpenHandsCloudRequestError';
    this.status = status;
  }

  /** A 401/403 means the stored credential is no longer accepted and must be discarded. */
  get isUnauthorized(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

/** True only for an invalid stored credential, never for a transient network/server error. */
export function isUnauthorizedCloudError(error: unknown): boolean {
  return error instanceof OpenHandsCloudRequestError && error.isUnauthorized;
}

/**
 * The per-conversation runtime host and bearer used for direct agent-server
 * calls (events, message sends, abort). Null until the sandbox is provisioned.
 */
export function resolveCloudConversationRuntime(
  conversation: CloudConversation | null | undefined,
): Readonly<{ serverUrl: string; sessionApiKey: string | null }> | null {
  const serverUrl = conversation?.conversationUrl?.trim();
  if (!serverUrl) return null;
  return { serverUrl: serverUrl.replace(/\/+$/, ''), sessionApiKey: conversation?.sessionApiKey?.trim() || null };
}

/** Canonical agent-server event socket, mirroring the official `buildConversationEventStreamUrl`. */
export function buildCloudEventSocketUrl(serverUrl: string, conversationId: string): string {
  const url = new URL(serverUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `${url.pathname.replace(/\/$/, '')}/sockets/events/${encodeURIComponent(conversationId)}`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function toConversation(value: unknown): CloudConversation | null {
  const record = asRecord(value);
  const id = readString(record.id);
  if (!id) return null;
  return {
    id,
    title: readString(record.title),
    updatedAt: readString(record.updated_at),
    createdAt: readString(record.created_at),
    executionStatus: readString(record.execution_status),
    sandboxStatus: readString(record.sandbox_status),
    conversationUrl: readString(record.conversation_url),
    sessionApiKey: readString(record.session_api_key),
  };
}

function isCloudEvent(value: unknown): value is CloudEvent {
  return Boolean(value && typeof value === 'object' && typeof (value as { kind?: unknown }).kind === 'string');
}

function buildQuery(entries: ReadonlyArray<readonly [string, string]>): string {
  const params = new URLSearchParams();
  for (const [key, value] of entries) params.set(key, value);
  return params.toString();
}

/**
 * The Cloud REST surface the app uses, expressed once as raw requests so the
 * same routing drives the on-device transport and any test double. Endpoints
 * and auth mirror `@openhands/typescript-client`'s CloudClient.
 */
const CLOUD_ROUTES = {
  organizations: (): CloudRequest => ({ path: '/api/organizations', method: 'GET' }),
  searchConversations: (limit: number): CloudRequest => ({
    path: `/api/v1/app-conversations/search?${buildQuery([['limit', String(limit)], ['sort_order', 'UPDATED_AT_DESC']])}`,
    method: 'GET',
  }),
  createConversation: (initialText: string): CloudRequest => ({
    path: '/api/v1/app-conversations',
    method: 'POST',
    body: initialText.trim() ? { initial_message: { content: [{ type: 'text', text: initialText }] } } : {},
  }),
  getConversation: (conversationId: string): CloudRequest => ({
    path: `/api/v1/app-conversations?${buildQuery([['ids', conversationId]])}`,
    method: 'GET',
  }),
  deleteConversation: (conversationId: string): CloudRequest => ({
    path: `/api/v1/app-conversations/${encodeURIComponent(conversationId)}`,
    method: 'DELETE',
  }),
  searchEvents: (conversationId: string, limit: number): CloudRequest => ({
    path: `/api/v1/app-conversations/${encodeURIComponent(conversationId)}/events/search?${buildQuery([['limit', String(limit)], ['sort_order', 'TIMESTAMP']])}`,
    method: 'GET',
  }),
  sendUserMessage: (conversationId: string, text: string): CloudRequest => ({
    path: `/api/v1/app-conversations/${encodeURIComponent(conversationId)}/events`,
    method: 'POST',
    body: { role: 'user', content: [{ type: 'text', text }], run: true },
  }),
  interruptConversation: (conversationId: string): CloudRequest => ({
    path: `/api/v1/app-conversations/${encodeURIComponent(conversationId)}/interrupt`,
    method: 'POST',
    body: {},
  }),
} as const;

/** Binds the route table to a transport; throws on any non-2xx status. */
export function createOpenHandsCloudApi(transport: CloudTransport): OpenHandsCloudApi {
  const submit = async (spec: CloudRequest): Promise<unknown> => {
    const response = await transport(spec);
    if (response.status < 200 || response.status >= 300) throw new OpenHandsCloudRequestError(response.status);
    return response.data;
  };
  return {
    async getOrganizations() {
      const data = asRecord(await submit(CLOUD_ROUTES.organizations()));
      return {
        items: Array.isArray(data.items)
          ? data.items.filter((item): item is CloudOrganization => Boolean(item && typeof item === 'object'))
          : [],
        currentOrgId: typeof data.current_org_id === 'string' ? data.current_org_id : null,
      };
    },
    async searchConversations(limit = 30) {
      const data = asRecord(await submit(CLOUD_ROUTES.searchConversations(limit)));
      return Array.isArray(data.items)
        ? data.items.map(toConversation).filter((item): item is CloudConversation => item !== null)
        : [];
    },
    async createConversation(initialText) {
      const task = asRecord(await submit(CLOUD_ROUTES.createConversation(initialText)));
      const id = readString(task.app_conversation_id) ?? readString(task.id);
      if (!id) throw new Error('OpenHands Cloud did not return a conversation id.');
      return { id };
    },
    async getConversation(conversationId) {
      const data = await submit(CLOUD_ROUTES.getConversation(conversationId));
      return Array.isArray(data) ? toConversation(data[0]) : null;
    },
    deleteConversation: async (conversationId) => { await submit(CLOUD_ROUTES.deleteConversation(conversationId)); },
    async searchEvents(conversationId, options) {
      const data = asRecord(await submit(CLOUD_ROUTES.searchEvents(conversationId, options?.limit ?? 100)));
      return Array.isArray(data.items) ? data.items.filter(isCloudEvent) : [];
    },
    sendUserMessage: async (conversationId, text) => { await submit(CLOUD_ROUTES.sendUserMessage(conversationId, text)); },
    interruptConversation: async (conversationId) => { await submit(CLOUD_ROUTES.interruptConversation(conversationId)); },
  };
}

/**
 * On-device transport. `fetch` only: the published SDK imports `node:http`
 * at module load and calls `AbortSignal.timeout`, neither of which exists in
 * the React Native runtime.
 */
function createFetchTransport(accessToken: string, host: string): CloudTransport {
  return async ({ path, method, body }) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OPENHANDS_CLOUD_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${host}${path}`, {
        method,
        signal: controller.signal,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const text = await response.text();
      return { status: response.status, data: text ? JSON.parse(text) : undefined };
    } finally {
      clearTimeout(timeout);
    }
  };
}

/**
 * Creates the authenticated Cloud API surface. The official device flow stores
 * a raw OAuth access token, so every request carries it as `Authorization:
 * Bearer`; Cloud requests go straight to the API host, never through a proxy.
 * An explicit `transport` is only used to observe requests in tests.
 */
export function createOpenHandsCloudClient(
  accessToken: string,
  orgId?: string | null,
  transport?: CloudTransport,
): OpenHandsCloudApi {
  const normalizedToken = accessToken.trim();
  if (!normalizedToken) {
    throw new Error('OpenHands access token must not be empty.');
  }
  return createOpenHandsCloudApi(transport ?? createFetchTransport(normalizedToken, OPENHANDS_CLOUD_API_HOST));
}

/** Reads the device credential and verifies that it can reach the Cloud API. */
export async function verifyOpenHandsCloudSession(
  credentialStore: OpenHandsCredentialStore = openHandsCredentialStore,
  transport?: CloudTransport,
): Promise<CloudOrganizationsResult> {
  const accessToken = await credentialStore.getAccessToken();
  if (!accessToken) throw new Error('OpenHands Cloud is not authenticated.');
  return createOpenHandsCloudClient(accessToken, null, transport).getOrganizations();
}

/** Builds an authenticated client from the stored credential, failing when signed out. */
export async function createStoredOpenHandsCloudClient(
  orgId?: string | null,
  credentialStore: OpenHandsCredentialStore = openHandsCredentialStore,
): Promise<OpenHandsCloudApi> {
  const accessToken = await credentialStore.getAccessToken();
  if (!accessToken) throw new Error('OpenHands Cloud is not authenticated.');
  return createOpenHandsCloudClient(accessToken, orgId);
}
