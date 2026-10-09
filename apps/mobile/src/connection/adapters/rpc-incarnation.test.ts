import type { ConnectionRecord } from '@clawket/agent-protocol';
import type { WebSocketLike } from '../transports/types';
import { ClaudeCodeAdapter } from './claude-code';
import { CodexAdapter } from './codex';
import { PiAdapter } from './pi';

class Socket implements WebSocketLike {
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror = null;
  onclose = null;
  sent: string[] = [];
  send(data: unknown) { this.sent.push(String(data)); }
  close() { this.readyState = 3; }
  open() { this.readyState = 1; this.onopen?.(); }
  reply(id: string, payload: unknown) {
    this.onmessage?.({ data: JSON.stringify({ type: 'res', id, ok: true, payload }) });
  }
  last() { return JSON.parse(this.sent.at(-1)!); }
}

describe.each([
  ['claude-code', ClaudeCodeAdapter], ['codex', CodexAdapter], ['pi', PiAdapter]
] as const)('%s request identity', (backend, Adapter) => {
  it.each([undefined, 1_200])('bounds a foreground health probe to %s without changing other RPC deadlines', async (timeoutMs) => {
    jest.useFakeTimers();
    const record: ConnectionRecord = { id: 'probe-phone', backendKind: backend, transportKind: 'relay', label: 'QA',
      url: 'wss://example.com/ws', createdAt: 1, relay: { gatewayId: 'qa', clientToken: 'qa', serverUrl: 'https://example.com' } };
    const socket = new Socket();
    const adapter = new Adapter(record, { webSocketFactory: () => socket });
    try {
      const connected = adapter.connect(); socket.open();
      socket.reply(socket.last().id, { backend, vision: false }); await connected;
      const attachments = adapter.capabilities.attachments;
      let result: boolean | undefined;
      const probe = adapter.probe(timeoutMs).then(value => { result = value; });
      const healthId = socket.last().id;
      await jest.advanceTimersByTimeAsync((timeoutMs ?? 5_000) - 1);
      expect(result).toBeUndefined();
      await jest.advanceTimersByTimeAsync(1);
      expect(result).toBe(false);
      await probe;
      // A late response is not health evidence for a later connection.
      socket.reply(healthId, { backend, vision: true });
      await Promise.resolve();
      expect(adapter.capabilities.attachments).toBe(attachments);
      const pending = adapter.loadSession('main').catch(() => null);
      await jest.advanceTimersByTimeAsync(5_000);
      socket.reply(socket.last().id, { messages: [], hasActiveRun: false });
      await expect(pending).resolves.toMatchObject({ messages: [] });
    } finally { adapter.disconnect(); jest.useRealTimers(); }
  });

  it('cannot mistake a late response from a previous adapter for the replacement request', async () => {
    const record: ConnectionRecord = { id: 'same-phone', backendKind: backend, transportKind: 'relay', label: 'QA',
      url: 'wss://example.com/ws', createdAt: 1, relay: { gatewayId: 'qa', clientToken: 'qa', serverUrl: 'https://example.com' } };
    const sockets: Socket[] = [];
    const factory = () => { const socket = new Socket(); sockets.push(socket); return socket; };
    const first = new Adapter(record, { webSocketFactory: factory });
    const second = new Adapter(record, { webSocketFactory: factory });
    try {
      const connected = first.connect(); sockets[0].open();
      sockets[0].reply(sockets[0].last().id, { backend, vision: false }); await connected;
      const abandoned = first.loadSession('main').catch(() => null);
      const staleId = sockets[0].last().id;
      first.disconnect(); await abandoned;
      const reconnected = second.connect(); sockets[1].open();
      sockets[1].reply(sockets[1].last().id, { backend, vision: false }); await reconnected;
      let resolved = false;
      const current = second.loadSession('main').then(value => { resolved = true; return value; }).catch(() => null);
      const currentId = sockets[1].last().id;
      expect(currentId).not.toBe(staleId);
      sockets[1].reply(staleId, { messages: [], hasActiveRun: false, qaMarker: 'stale' }); await Promise.resolve();
      expect(resolved).toBe(false);
      sockets[1].reply(currentId, { messages: [], hasActiveRun: false, qaMarker: 'current' });
      expect(await current).toMatchObject({ qaMarker: 'current' });
    } finally {
      first.disconnect(); second.disconnect(); jest.restoreAllMocks();
    }
  });
});
