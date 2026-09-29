import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import { PiServer } from './pi/server.js';
import { ClaudeServer } from './claude-code/server.js';
import { CodexServer } from './codex/server.js';
import { MAX_LOCAL_BRIDGE_SOCKETS } from './local-websocket-policy.js';

const servers: Array<{ stop(): Promise<void> }> = [];
const sockets: WebSocket[] = [];
afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate();
  for (const server of servers.splice(0)) await server.stop();
});
function open(url: string, origin?: string) {
  return new Promise<WebSocket>((resolve, reject) => {
    const socket = new WebSocket(url, origin ? { origin } : {}); sockets.push(socket);
    socket.once('error', reject); socket.once('open', () => resolve(socket));
    socket.once('unexpected-response', (_request, response) => {
      response.resume(); socket.terminate(); reject(new Error(`HTTP ${response.statusCode}`));
    });
  });
}

describe.each([
  ['pi', PiServer], ['claude-code', ClaudeServer], ['codex', CodexServer],
] as const)('%s local admission', (backend, Server) => {
  it('rejects hostile browser Origin before any native RPC and accepts Android Origin', async () => {
    const service = Object.assign(new EventEmitter(), { health: async () => ({}), stop: async () => {}, request: vi.fn(async () => ({})) });
    const server = new Server(service as never, 'test-token-'.repeat(4)); servers.push(server);
    const port = await server.start(0);
    const url = `ws://127.0.0.1:${port}/v1/${backend}/ws`;
    await expect(open(url, 'https://unrelated.example')).rejects.toThrow('HTTP 403');
    expect(service.request).not.toHaveBeenCalled();
    const socket = await open(url, `http://127.0.0.1:${port}`);
    const reply = new Promise<string>(resolve => socket.once('message', data => resolve(data.toString())));
    socket.send(JSON.stringify({ type: 'req', id: 'native', method: 'connect', params: { token: 'test-token-'.repeat(4) } }));
    expect(JSON.parse(await reply)).toMatchObject({ id: 'native', ok: true });
  });
  it('bounds unauthenticated sockets before the 10-second handshake deadline', async () => {
    const service = Object.assign(new EventEmitter(), { health: async () => ({}), stop: async () => {}, request: vi.fn(async () => ({})) });
    const server = new Server(service as never, 'test-token-'.repeat(4)); servers.push(server);
    const port = await server.start(0);
    const url = `ws://127.0.0.1:${port}/v1/${backend}/ws`;
    for (let i = 0; i < MAX_LOCAL_BRIDGE_SOCKETS; i += 1) await open(url);
    await expect(open(url)).rejects.toThrow('HTTP 429');
    expect(service.request).not.toHaveBeenCalled();
    const first = sockets[0]; const closed = new Promise<void>(resolve => first.once('close', () => resolve()));
    first.close(); await closed;
    await expect(open(url)).resolves.toBeInstanceOf(WebSocket);
  });
});
