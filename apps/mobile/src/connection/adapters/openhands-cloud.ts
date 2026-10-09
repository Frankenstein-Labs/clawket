import {
  AdapterError,
  resolveCapabilities,
  type AgentAdapter,
  type AgentDescriptor,
  type ConnectionDescriptor,
  type ConnectionRecord,
  type ConnectionState,
  type PromptInput,
  type SessionDescriptor,
  type SessionHistory,
  type SessionUpdate,
} from '@clawket/agent-protocol';
import {
  createStoredOpenHandsCloudClient,
  type CloudConversation,
  type OpenHandsCloudApi,
} from '../openhands/cloud-client';
import { CLOUD_AGENT_ID, cloudHistoryFromEvents } from '../openhands/cloud-events';

type Listeners = {
  update: (update: SessionUpdate) => void;
  state: (state: ConnectionState, reason?: string) => void;
  sessions: (sessions: SessionDescriptor[]) => void;
};

type CloudClientFactory = () => Promise<OpenHandsCloudApi>;

/** Interval for reading a running conversation's events; Cloud has no push socket we own. */
const POLL_INTERVAL_MS = 1500;

function parseTimestamp(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toSessionDescriptor(connectionId: string, conversation: CloudConversation): SessionDescriptor {
  return {
    connectionId,
    agentId: CLOUD_AGENT_ID,
    key: conversation.id,
    kind: 'direct',
    title: conversation.title?.trim() || 'New conversation',
    updatedAt: parseTimestamp(conversation.updatedAt),
    model: undefined,
    hasActiveRun: conversation.executionStatus === 'running',
    allowedActions: { rename: false, reset: false, delete: true, pin: false },
  };
}

/**
 * OpenHands Cloud chat: conversations are the sessions and the agent-server
 * event stream is the history. Talk to the Cloud REST API with the stored
 * device bearer; no Bridge or pairing is involved.
 */
export class OpenHandsCloudAdapter implements AgentAdapter {
  readonly connection: ConnectionDescriptor;
  readonly capabilities = resolveCapabilities('openhands-cloud');
  private transport: ConnectionState = 'idle';
  private readonly listeners: { [K in keyof Listeners]: Set<Listeners[K]> } = {
    update: new Set(), state: new Set(), sessions: new Set(),
  };
  private client: OpenHandsCloudApi | null = null;
  private epoch = 0;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private activeRun: { key: string; runId: string } | null = null;
  private lastEventId = new Map<string, string>();

  constructor(
    private readonly record: ConnectionRecord,
    private readonly options: { isFreeSlot?: boolean; clientFactory?: CloudClientFactory } = {},
  ) {
    if (record.backendKind !== 'openhands-cloud') throw new TypeError('Expected openhands-cloud connection');
    this.connection = {
      id: record.id,
      backendKind: record.backendKind,
      transportKind: record.transportKind,
      label: record.label,
      createdAt: record.createdAt,
      environment: record.environment,
      isFreeSlot: options.isFreeSlot ?? false,
    };
  }

  get state(): ConnectionState { return this.transport; }

  private setState(state: ConnectionState, reason?: string): void {
    this.transport = state;
    for (const listener of this.listeners.state) listener(state, reason);
  }

  private async api(): Promise<OpenHandsCloudApi> {
    if (this.client) return this.client;
    const factory = this.options.clientFactory ?? (() => createStoredOpenHandsCloudClient(this.record.cloudOrgId ?? null));
    this.client = await factory();
    return this.client;
  }

  async connect(): Promise<void> {
    if (this.transport === 'ready') return;
    try {
      await (await this.api()).getOrganizations();
      this.setState('ready');
    } catch (error) {
      this.setState('offline', error instanceof Error ? error.message : undefined);
      throw this.classify(error);
    }
  }

  disconnect(): void {
    this.epoch += 1;
    this.stopPolling();
    this.client = null;
    this.setState('offline');
  }

  async probe(): Promise<boolean> {
    try {
      await (await this.api()).getOrganizations();
      if (this.transport !== 'ready') this.setState('ready');
      return true;
    } catch {
      return false;
    }
  }

  async listAgents(): Promise<AgentDescriptor[]> {
    // One Cloud account, conversations as the sessions, so the Agent is messages-first.
    return [{
      connectionId: this.record.id,
      agentId: CLOUD_AGENT_ID,
      name: this.record.label,
      isMain: true,
      mainSessionKey: '',
      entryMode: 'sessions',
    }];
  }

  async listSessions(): Promise<SessionDescriptor[]> {
    const conversations = await (await this.api()).searchConversations();
    const sessions = conversations.map((conversation) => toSessionDescriptor(this.record.id, conversation));
    for (const listener of this.listeners.sessions) listener(sessions);
    return sessions;
  }

  async loadSession(key: string, options?: { limit?: number }): Promise<SessionHistory> {
    const client = await this.api();
    const [conversation, events] = await Promise.all([
      client.getConversation(key),
      client.searchEvents(key, { limit: options?.limit ?? 200 }),
    ]);
    const history = cloudHistoryFromEvents(key, events, { executionStatus: conversation?.executionStatus });
    const newest = events.at(-1);
    if (newest?.id) this.lastEventId.set(key, newest.id);
    return history;
  }

  async prompt(key: string, input: PromptInput): Promise<{ runId: string }> {
    const client = await this.api();
    const runId = `cloud:${key}:${Date.now()}`;
    try {
      await client.sendUserMessage(key, input.text);
    } catch (error) {
      throw this.classify(error);
    }
    this.activeRun = { key, runId };
    for (const listener of this.listeners.update) listener({ type: 'run_started', sessionKey: key, runId });
    this.startPolling(key, runId);
    return { runId };
  }

  async cancel(key: string): Promise<void> {
    try {
      await (await this.api()).interruptConversation(key);
    } catch (error) {
      throw this.classify(error);
    }
    this.finishRun(key, 'cancelled');
  }

  async createSession(): Promise<SessionDescriptor> {
    const { id } = await (await this.api()).createConversation('');
    const conversation = await (await this.api()).getConversation(id);
    return conversation
      ? toSessionDescriptor(this.record.id, conversation)
      : {
        connectionId: this.record.id, agentId: CLOUD_AGENT_ID, key: id, kind: 'direct',
        title: 'New conversation', updatedAt: null, hasActiveRun: false,
        allowedActions: { rename: false, reset: false, delete: true, pin: false },
      };
  }

  async deleteSession(key: string): Promise<void> {
    this.stopPolling();
    await (await this.api()).deleteConversation(key);
  }

  on<K extends keyof Listeners>(event: K, listener: Listeners[K]): () => void {
    this.listeners[event].add(listener);
    return () => { this.listeners[event].delete(listener); };
  }

  private startPolling(key: string, runId: string): void {
    this.stopPolling();
    const epoch = this.epoch;
    const tick = async () => {
      if (epoch !== this.epoch) return;
      try {
        const client = await this.api();
        const [conversation, events] = await Promise.all([
          client.getConversation(key),
          client.searchEvents(key, { limit: 200 }),
        ]);
        if (epoch !== this.epoch) return;
        const history = cloudHistoryFromEvents(key, events, { executionStatus: conversation?.executionStatus });
        const newest = events.at(-1);
        const changed = newest?.id !== undefined && this.lastEventId.get(key) !== newest.id;
        if (newest?.id) this.lastEventId.set(key, newest.id);
        if (changed) {
          for (const listener of this.listeners.update) listener({ type: 'history_reconciled', sessionKey: key, history });
        }
        if (conversation?.executionStatus !== 'running') {
          this.finishRun(key, 'end_turn');
          return;
        }
      } catch {
        // A transient read failure keeps the run open; the next tick retries.
      }
      if (epoch !== this.epoch) return;
      this.pollTimer = setTimeout(() => { void tick(); }, POLL_INTERVAL_MS);
    };
    this.pollTimer = setTimeout(() => { void tick(); }, POLL_INTERVAL_MS);
    void runId;
  }

  private stopPolling(): void {
    if (this.pollTimer) { clearTimeout(this.pollTimer); this.pollTimer = null; }
  }

  private finishRun(key: string, stopReason: 'end_turn' | 'cancelled'): void {
    this.stopPolling();
    const runId = this.activeRun?.key === key ? this.activeRun.runId : `cloud:${key}`;
    this.activeRun = null;
    for (const listener of this.listeners.update) listener({ type: 'run_finished', sessionKey: key, runId, stopReason });
  }

  private classify(error: unknown): AdapterError {
    if (error instanceof AdapterError) return error;
    if (error instanceof Error && 'status' in error) {
      const status = (error as { status?: number }).status;
      if (status === 401 || status === 403) return new AdapterError('unauthorized', 'OpenHands Cloud rejected the stored credential.');
      if (status === 429) return new AdapterError('rate_limited', 'OpenHands Cloud is rate limiting this device.');
    }
    // A stalled or aborted fetch and a transport failure both read as offline,
    // never as an authentication problem: the stored token stays valid.
    if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
      return new AdapterError('timeout', 'OpenHands Cloud did not answer in time.');
    }
    if (error instanceof TypeError) {
      return new AdapterError('network', 'OpenHands Cloud is unreachable from this device.');
    }
    const message = error instanceof Error ? error.message : 'OpenHands Cloud request failed.';
    return new AdapterError('server', message);
  }
}
