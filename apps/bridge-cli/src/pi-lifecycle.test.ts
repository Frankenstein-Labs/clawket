import { afterEach, expect, it } from 'vitest';
import { once } from 'node:events';
import { WebSocketServer } from 'ws';
import { piControl } from './pi-lifecycle.js';

let server: WebSocketServer | undefined;
afterEach(async () => {
  if (!server) return;
  for (const socket of server.clients) socket.terminate();
  await new Promise<void>(resolve => server!.close(() => resolve())); server = undefined;
});
async function listen() {
  server = new WebSocketServer({ port: 0, host: '127.0.0.1' }); await once(server, 'listening');
  return { port: (server.address() as { port: number }).port, token: 'local-test-token' };
}

it('authenticates the existing Pi owner with its saved token before reporting health', async () => {
  const config = await listen(); let request: any;
  server!.on('connection', socket => socket.on('message', raw => {
    request = JSON.parse(raw.toString());
    socket.send(JSON.stringify({ type: 'res', id: request.id, ok: true, payload: { backend: 'pi', modelReady: true } }));
  }));
  await expect(piControl(config)).resolves.toMatchObject({ backend: 'pi' });
  expect(request).toEqual({ type: 'req', id: 'auth', method: 'connect', params: { token: config.token } });
});

it.each([false, true])('does not classify an unauthenticated or wrong-backend endpoint as offline (wrongBackend=%s)', async wrongBackend => {
  const config = await listen();
  server!.on('connection', socket => socket.on('message', () => {
    socket.send(JSON.stringify({ type: 'res', id: 'auth', ok: wrongBackend, payload: { backend: 'codex' } }));
  }));
  let failure: NodeJS.ErrnoException | undefined;
  try { await piControl(config); } catch (error) { failure = error as NodeJS.ErrnoException; }
  expect(failure).toBeInstanceOf(Error); expect(failure?.code).not.toBe('ECONNREFUSED');
});

it('preserves an explicit connection-refused code without exposing native error details', async () => {
  const config = await listen();
  await new Promise<void>(resolve => server!.close(() => resolve())); server = undefined;
  await expect(piControl(config)).rejects.toMatchObject({ code: 'ECONNREFUSED', message: 'Pi Bridge is not reachable' });
});

it.each(['control', 'unknown'])('never accepts an unsolicited successful response as owner authentication: %s', async id => {
  const config = await listen();
  server!.on('connection', socket => socket.on('message', () => {
    socket.send(JSON.stringify({ type: 'res', id, ok: true, payload: { backend: 'pi' } }));
    socket.close();
  }));
  await expect(piControl(config)).rejects.toThrow('closed the connection');
});

it('only accepts a lifecycle control result after the Pi authentication response', async () => {
  const config = await listen(); const methods: string[] = [];
  server!.on('connection', socket => socket.on('message', raw => {
    const request = JSON.parse(raw.toString()); methods.push(request.method);
    socket.send(JSON.stringify({ type: 'res', id: request.id, ok: true,
      payload: request.id === 'auth' ? { backend: 'pi' } : { stopped: true } }));
  }));
  await expect(piControl(config, 'bridge.stop')).resolves.toEqual({ stopped: true });
  expect(methods).toEqual(['connect', 'bridge.stop']);
});
