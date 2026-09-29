import { analyticsEvents } from './analytics/events';
jest.mock('./analytics/events', () => ({ analyticsEvents: { connectionDiagnostic: jest.fn() } }));
import { pairingRequest } from './pairing-request';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('bounds a stalled fetch without retrying a single-use claim', async () => {
  let signal: AbortSignal | undefined;
  const request = jest.fn((value: AbortSignal) => { signal = value; return new Promise(() => {}); });
  const result = pairingRequest(request);
  const rejected = expect(result).rejects.toMatchObject({ code: 'timeout' });
  await jest.advanceTimersByTimeAsync(15_000);
  await rejected;
  expect(signal?.aborted).toBe(true);
  expect(request).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

it('also bounds a stalled response body after headers arrive', async () => {
  const result = pairingRequest(async () => {
    await Promise.resolve({ ok: true });
    return new Promise(() => {});
  });
  const rejected = expect(result).rejects.toMatchObject({ code: 'timeout' });
  await jest.advanceTimersByTimeAsync(15_000);
  await rejected;
});

it('cleans up on success and preserves an explicit server rejection', async () => {
  await expect(pairingRequest(async () => 'claimed')).resolves.toBe('claimed');
  const error = new Error('Pairing expired');
  await expect(pairingRequest(async () => { throw error; })).rejects.toBe(error);
  expect(jest.getTimerCount()).toBe(0);
});

it('distinguishes stalled HTTP headers from a stalled body without waiting for diagnostics', async () => {
  jest.mocked(analyticsEvents.connectionDiagnostic).mockClear();
  const result = pairingRequest(async (_signal, receivedResponse) => {
    receivedResponse(200);
    return new Promise(() => {});
  }, { backend: 'hermes', transport: 'relay', operation: 'pair_claim' });
  const rejected = expect(result).rejects.toMatchObject({ code: 'timeout' });
  await jest.advanceTimersByTimeAsync(15_000); await rejected;
  expect(analyticsEvents.connectionDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
    backend: 'hermes', phase: 'body', outcome: 'timeout', http_status: 200, evidence: 'http_response', elapsed_ms: 15_000,
  }));
});
