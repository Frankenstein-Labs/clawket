import { describe, expect, it } from 'vitest';
import { allowsLocalWebSocketOrigin } from './local-websocket-policy.js';

describe('local native WebSocket admission', () => {
  it.each([
    { host: '127.0.0.1:17882' },
    { host: '192.168.1.20:17882', origin: 'http://192.168.1.20:17882' },
    { host: '[::1]:17882', origin: 'http://[::1]:17882' },
    { host: 'computer.local:17882', origin: 'http://computer.local:17882' },
    { host: 'computer.local:443', origin: 'https://computer.local' },
  ])('keeps native clients compatible: %j', headers => {
    expect(allowsLocalWebSocketOrigin({ headers })).toBe(true);
  });
  it.each([
    { host: '127.0.0.1:17882', origin: 'https://unrelated.example' },
    { host: '127.0.0.1:17882', origin: 'null' },
    { host: '127.0.0.1:17882', origin: '' },
    { host: '127.0.0.1:17882', origin: 'http://127.0.0.1:17883' },
    { host: '127.0.0.1:17882', origin: 'http://user@127.0.0.1:17882' },
    { host: '127.0.0.1:17882', origin: 'http://127.0.0.1:17882/path' },
    { host: '127.0.0.1:17882', origin: 'http://127.0.0.1:17882/?query=1' },
    { host: '127.0.0.1:17882', origin: 'http://127.0.0.1:17882/#fragment' },
    { origin: 'http://127.0.0.1:17882' },
    { host: '127.0.0.1:17882', origin: 'ws://127.0.0.1:17882' },
  ])('rejects browser cross-origin and malformed requests: %j', headers => {
    expect(allowsLocalWebSocketOrigin({ headers })).toBe(false);
  });
});
