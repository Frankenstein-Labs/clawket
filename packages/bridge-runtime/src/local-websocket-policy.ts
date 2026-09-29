import type { IncomingMessage } from 'node:http';

export const MAX_LOCAL_BRIDGE_SOCKETS = 32;

/** Native clients omit Origin or (React Native Android) use the endpoint's HTTP origin. */
export function allowsLocalWebSocketOrigin(request: Pick<IncomingMessage, 'headers'>): boolean {
  const origin = request.headers.origin;
  if (origin === undefined) return true;
  if (!origin || !request.headers.host) return false;
  try {
    const parsed = new URL(origin);
    const endpoint = new URL(`${parsed.protocol}//${request.headers.host}`);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:')
      && parsed.origin === endpoint.origin && !parsed.username && !parsed.password
      && parsed.pathname === '/' && !parsed.search && !parsed.hash;
  } catch { return false; }
}
