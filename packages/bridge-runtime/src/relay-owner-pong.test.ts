import { afterEach, describe, expect, it, vi } from 'vitest';
import { advertiseRelayOwnerPong, RELAY_OWNER_PONG_CAPABILITY, RelayOwnerPong } from './relay-owner-pong.js';
import { RELAY_TRANSFER_CAPABILITY, RELAY_TRANSFER_MIN_BYTES } from './relay-transfer-lease.js';

const PREFIX = '__clawket_relay_control__:';
const ready = { event: 'relay.ready', payload: { capabilities: [RELAY_OWNER_PONG_CAPABILITY] } };
const pong = (nonce: unknown) => ({ event: 'relay.owner-pong', payload: { nonce } });

function fixture(followTimers = false, legacyProtocolPongs = false) {
  const send = vi.fn(), onConfirmed = vi.fn(), onTimeout = vi.fn(), log = vi.fn();
  let now = 0;
  let wall: number | undefined;
  const helper = new RelayOwnerPong({ send, onConfirmed, onTimeout, log, legacyProtocolPongs, now: () => followTimers ? Date.now() : now, wallNow: () => wall ?? Date.now() });
  const nonce = () => JSON.parse(send.mock.calls.at(-1)![0].slice(PREFIX.length)).payload.nonce as string;
  return { helper, send, onConfirmed, onTimeout, log, nonce, setNow: (value: number) => { now = value; }, setWall: (value: number) => { wall = value; } };
}

afterEach(() => { vi.useRealTimers(); });

describe('negotiated owner transport echo', () => {
  it('preserves existing channel capabilities when advertising the additive wire', () => {
    const url = new URL('wss://relay.test/ws?capabilities=bridge.client-sockets.v1');
    advertiseRelayOwnerPong(url); advertiseRelayOwnerPong(url);
    expect(url.searchParams.get('capabilities')).toBe('bridge.client-sockets.v1,relay.owner-pong.v1');
  });

  it.each([undefined, [], ['relay.frame-limit.v2'], 'relay.owner-pong.v1'])('keeps legacy behavior without explicit advertised support: %j', capabilities => {
    vi.useFakeTimers();
    const f = fixture();
    f.helper.handleControl({ event: 'relay.ready', payload: { capabilities } });
    expect(f.helper.startProtocolPing()).toBe(true);
    f.helper.confirmTransportPong();
    expect(f.helper.takeReconnectDelay(2000, 1006)).toBe(2000);
    expect(f.helper.request()).toBe(false);
    expect(f.send).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('coalesces one bounded random challenge and confirms only its exact current echo', () => {
    vi.useFakeTimers();
    const f = fixture(); f.helper.handleControl(ready);
    expect(f.helper.request()).toBe(true); expect(f.helper.request()).toBe(true);
    expect(f.send).toHaveBeenCalledTimes(1);
    expect(f.nonce()).toMatch(/^[0-9a-f]{32}$/);
    f.helper.handleControl(pong('0'.repeat(32)));
    f.helper.handleControl(pong({ nonce: f.nonce() }));
    expect(f.onConfirmed).not.toHaveBeenCalled();
    f.setNow(250); f.helper.handleControl(pong(f.nonce())); f.helper.handleControl(pong(f.nonce()));
    expect(f.onConfirmed).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(f.log.mock.calls.flat().join(' ')).not.toContain(f.nonce());
    f.helper.dispose();
  });

  it('does not let traffic, a repeated ready, or a late matching echo extend the deadline', async () => {
    vi.useFakeTimers();
    const f = fixture(); f.helper.handleControl(ready); f.helper.request();
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(1000);
      f.helper.handleControl({ type: 'req', id: 'health', method: 'health' });
      f.helper.handleControl(ready); f.helper.request();
    }
    f.setNow(5000); f.helper.handleControl(pong(f.nonce()));
    expect(f.onConfirmed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.onTimeout).toHaveBeenCalledTimes(1);
    expect(f.send).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    f.helper.dispose();
  });

  it('preserves explicit local-model legacy protocol pong recovery and clears the application deadline without sending again', async () => {
    vi.useFakeTimers();
    const f = fixture(false, true); f.helper.handleControl(ready); f.helper.request();
    f.helper.confirmTransportPong();
    await vi.advanceTimersByTimeAsync(6000);
    expect(f.onTimeout).not.toHaveBeenCalled(); expect(f.onConfirmed).not.toHaveBeenCalled();
    expect(f.send).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
    f.helper.dispose();
  });

  it('disposes pending timers and rejects retired socket challenges on its successor', async () => {
    vi.useFakeTimers();
    const old = fixture(); old.helper.handleControl(ready); old.helper.request();
    const nonce = old.nonce(); old.helper.dispose();
    const next = fixture(); next.helper.handleControl(ready); next.helper.request();
    expect(next.nonce()).not.toBe(nonce);
    old.helper.handleControl(pong(nonce)); next.helper.handleControl(pong(nonce));
    await vi.advanceTimersByTimeAsync(5000);
    expect(old.onConfirmed).not.toHaveBeenCalled(); expect(old.onTimeout).not.toHaveBeenCalled();
    expect(next.onConfirmed).not.toHaveBeenCalled(); expect(next.onTimeout).toHaveBeenCalledTimes(1);
    expect(old.helper.request()).toBe(false); next.helper.dispose();
  });

  it('fails a throwing send once without logging native errors or retaining a timer', () => {
    vi.useFakeTimers();
    const f = fixture(); f.helper.handleControl(ready);
    f.send.mockImplementation(() => { throw new Error('secret native network error'); });
    f.helper.request();
    expect(f.onTimeout).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
    expect(f.log.mock.calls.flat().join(' ')).not.toContain('secret'); f.helper.dispose();
  });

  it('hedges at 1s and expires both probes at their common original 5s deadline', async () => {
    vi.useFakeTimers();
    const f = fixture(true); f.helper.handleControl(ready);
    expect(f.helper.startProtocolPing()).toBe(true);
    expect(f.helper.protocolPingPayload).toMatch(/^[0-9a-f]{32}$/);
    await vi.advanceTimersByTimeAsync(999);
    expect(f.helper.startProtocolPing()).toBe(false); expect(f.send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(f.send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3999); expect(f.onTimeout).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(f.onTimeout).toHaveBeenCalledTimes(1);
    expect(f.log).toHaveBeenCalledWith('relay heartbeat fallback timeout waitMs=4000 cycleWaitMs=5000');
    expect(vi.getTimerCount()).toBe(0); f.helper.dispose();
  });

  it('does not wake the application for a <1s protocol pong and preserves shorter configured deadlines', async () => {
    vi.useFakeTimers();
    const f = fixture(true); f.helper.handleControl(ready); f.helper.startProtocolPing();
    const nonce = f.helper.protocolPingPayload;
    await vi.advanceTimersByTimeAsync(999); expect(f.helper.confirmTransportPong(nonce)).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000); expect(f.send).not.toHaveBeenCalled();
    expect(f.helper.startProtocolPing(500)).toBe(true);
    await vi.advanceTimersByTimeAsync(499); expect(f.onTimeout).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(f.onTimeout).toHaveBeenCalledTimes(1);
    expect(f.send).not.toHaveBeenCalled(); f.helper.dispose();
  });

  it.each(['protocol', 'application'] as const)('lets a timely %s pong win after the hedge, ignoring the other late proof', async winner => {
    vi.useFakeTimers();
    const f = fixture(true); f.helper.handleControl(ready); f.helper.startProtocolPing();
    const protocolNonce = f.helper.protocolPingPayload;
    await vi.advanceTimersByTimeAsync(1000); const appNonce = f.nonce();
    await vi.advanceTimersByTimeAsync(3000);
    if (winner === 'protocol') expect(f.helper.confirmTransportPong(protocolNonce)).toBe(true);
    else f.helper.handleControl(pong(appNonce));
    expect(f.onConfirmed).toHaveBeenCalledTimes(winner === 'application' ? 1 : 0);
    expect(vi.getTimerCount()).toBe(0);
    expect(f.helper.startProtocolPing()).toBe(true);
    expect(f.helper.protocolPingPayload).not.toBe(protocolNonce);
    expect(f.helper.confirmTransportPong(protocolNonce)).toBe(false);
    f.helper.handleControl(pong(appNonce));
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.onTimeout).toHaveBeenCalledTimes(1); f.helper.dispose();
  });

  it('does not accept unsolicited protocol pongs before the first negotiated cycle', () => {
    const f = fixture(); f.helper.handleControl(ready);
    expect(f.helper.confirmTransportPong()).toBe(false);
    expect(f.helper.confirmTransportPong('a'.repeat(32))).toBe(false);
    expect(f.helper.takeReconnectDelay(2000, 1006)).toBe(2000);
    f.helper.dispose();
  });

  it('requires exact protocol nonces even without transfer support', async () => {
    vi.useFakeTimers();
    const f = fixture(true); f.helper.handleControl(ready); f.helper.startProtocolPing();
    expect(f.helper.confirmTransportPong()).toBe(false);
    expect(f.helper.confirmTransportPong('wrong')).toBe(false);
    await vi.advanceTimersByTimeAsync(5000); expect(f.onTimeout).toHaveBeenCalledTimes(1);
    f.helper.dispose();
  });

  it.each(['wall', 'monotonic'] as const)('does not revive an observed expired %s deadline before its delayed timer runs', async clock => {
    vi.useFakeTimers();
    const f = fixture(); f.setWall(0); f.helper.handleControl(ready); f.helper.startProtocolPing();
    const nonce = f.helper.protocolPingPayload;
    if (clock === 'wall') f.setWall(5001); else f.setNow(5001);
    expect(f.helper.confirmTransportPong(nonce)).toBe(false);
    f.setWall(0); f.setNow(0);
    expect(f.helper.confirmTransportPong(nonce)).toBe(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.onTimeout).toHaveBeenCalledTimes(1); expect(f.send).not.toHaveBeenCalled();
    f.helper.dispose();
  });

  it('does not let a late large frame revive an observed expired cycle before disposal', async () => {
    vi.useFakeTimers();
    const f = fixture(); f.setWall(0);
    f.helper.handleControl({ event: 'relay.ready', payload: { capabilities: [RELAY_OWNER_PONG_CAPABILITY, RELAY_TRANSFER_CAPABILITY] } });
    f.helper.startProtocolPing(); const old = f.helper.protocolPingPayload;
    f.setWall(5001); expect(f.helper.confirmTransportPong(old)).toBe(false);
    expect(f.onTimeout).toHaveBeenCalledTimes(1);
    f.setWall(0); f.helper.noteTransfer(RELAY_TRANSFER_MIN_BYTES);
    f.helper.handleControl({ event: 'relay.transfer-start', payload: { bytes: RELAY_TRANSFER_MIN_BYTES } });
    f.helper.noteFrameReceived(RELAY_TRANSFER_MIN_BYTES);
    expect(f.helper.startProtocolPing()).toBe(false); expect(f.helper.request()).toBe(false);
    await vi.advanceTimersByTimeAsync(90_000);
    expect(f.send).not.toHaveBeenCalled(); expect(f.onTimeout).toHaveBeenCalledTimes(1);
    f.helper.dispose();
  });

  it('allows the independent protocol proof after a failed hedge send, without resetting its deadline', async () => {
    vi.useFakeTimers();
    const f = fixture(true); f.helper.handleControl(ready); f.helper.startProtocolPing();
    const nonce = f.helper.protocolPingPayload;
    f.send.mockImplementation(() => { throw new Error('private failure'); });
    await vi.advanceTimersByTimeAsync(1000); expect(f.onTimeout).not.toHaveBeenCalled();
    expect(f.helper.confirmTransportPong(nonce)).toBe(true);
    await vi.advanceTimersByTimeAsync(6000); expect(f.onTimeout).not.toHaveBeenCalled();
    expect(f.log.mock.calls.flat().join(' ')).not.toContain('private failure');
    f.helper.dispose();
  });

  it('does not retire a synchronous successful proof when the send callback subsequently throws', async () => {
    vi.useFakeTimers();
    const f = fixture(true); f.helper.handleControl(ready); f.helper.startProtocolPing();
    const nonce = f.helper.protocolPingPayload;
    f.send.mockImplementation(() => { f.helper.confirmTransportPong(nonce); throw new Error('late callback'); });
    await vi.advanceTimersByTimeAsync(6000);
    expect(f.onTimeout).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0); f.helper.dispose();
  });

  it('bounds healthy hedge diagnostics to one pair per minute, without hiding timeout failures', async () => {
    vi.useFakeTimers();
    const f = fixture(true); f.helper.handleControl(ready);
    for (let i = 0; i < 3; i++) {
      f.helper.startProtocolPing(); await vi.advanceTimersByTimeAsync(1000);
      f.helper.handleControl(pong(f.nonce()));
    }
    expect(f.log.mock.calls.filter(([line]) => line.includes('started'))).toHaveLength(1);
    expect(f.log.mock.calls.filter(([line]) => line.includes('confirmed'))).toHaveLength(1);
    f.helper.startProtocolPing(); await vi.advanceTimersByTimeAsync(5000);
    expect(f.log.mock.calls.filter(([line]) => line.includes('timeout'))).toHaveLength(1);
    f.helper.dispose();
  });

  it('ordinary traffic cannot postpone a cycle and dispose cancels both probes', async () => {
    vi.useFakeTimers();
    const f = fixture(true); f.helper.handleControl(ready); f.helper.startProtocolPing();
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(1000);
      f.helper.handleControl({ type: 'req', method: 'health' }); f.helper.handleControl(ready);
      expect(f.helper.startProtocolPing()).toBe(false);
    }
    expect(f.send).toHaveBeenCalledTimes(1);
    f.helper.dispose(); expect(f.helper.startProtocolPing()).toBe(false);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(f.onTimeout).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['protocol', 'application'] as const)('grants just one bounded retry after a confirmed %s round trip', mode => {
    vi.useFakeTimers();
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const f = fixture(); f.helper.handleControl(ready);
    try {
      expect(f.helper.takeReconnectDelay(2000, 1006)).toBe(2000);
      if (mode === 'protocol') { f.helper.startProtocolPing(); f.helper.confirmTransportPong(f.helper.protocolPingPayload); }
      else { f.helper.request(); f.helper.handleControl(pong(f.nonce())); }
      expect(f.helper.takeReconnectDelay(2000, 1006)).toBe(125);
      expect(f.helper.takeReconnectDelay(4000, 1006)).toBe(4000);
      const replacement = fixture(); replacement.helper.handleControl(ready);
      expect(replacement.helper.takeReconnectDelay(4000, 1006)).toBe(4000);
      replacement.helper.dispose();
    } finally { random.mockRestore(); f.helper.dispose(); }
  });

  it.each([1000, 1008, 1009, 1013, 4001, 4010])('does not accelerate deliberate/overload/replacement close %s', code => {
    const f = fixture(); f.helper.handleControl(ready); f.helper.startProtocolPing();
    f.helper.confirmTransportPong(f.helper.protocolPingPayload);
    expect(f.helper.takeReconnectDelay(2000, code)).toBe(2000);
    f.helper.dispose();
  });
});

describe('negotiated large-frame head-of-line allowance', () => {
  const transferReady = { event: 'relay.ready', payload: { capabilities: [RELAY_OWNER_PONG_CAPABILITY, RELAY_TRANSFER_CAPABILITY] } };
  const hint = (bytes: unknown = RELAY_TRANSFER_MIN_BYTES) => ({ event: 'relay.transfer-start', payload: { bytes } });

  it.each(['application', 'protocol'] as const)('rejects a pre-sleep %s pong before a delayed timeout can run', async mode => {
    vi.useFakeTimers();
    const f = fixture(); f.setWall(0); f.helper.handleControl(transferReady);
    if (mode === 'application') { f.helper.noteTransfer(RELAY_TRANSFER_MIN_BYTES); await vi.advanceTimersByTimeAsync(0); }
    else { f.helper.handleControl(hint()); f.helper.startProtocolPing(); }
    const old = mode === 'application' ? f.nonce() : f.helper.protocolPingPayload!;
    f.setWall(90_001); // A suspended Mac may not advance the monotonic clock.
    if (mode === 'application') f.helper.handleControl(pong(old));
    else expect(f.helper.confirmTransportPong(old)).toBe(false);
    expect(f.onConfirmed).not.toHaveBeenCalled();
    f.setWall(0); f.helper.handleControl(hint()); // Wall rollback cannot revive the expired window.
    if (mode === 'application') f.helper.handleControl(pong(old));
    else expect(f.helper.confirmTransportPong(old)).toBe(false);
    await vi.advanceTimersByTimeAsync(5001);
    expect(f.onTimeout).toHaveBeenCalledTimes(1); expect(f.onConfirmed).not.toHaveBeenCalled();
    f.helper.dispose();
  });

  it('rejects ordinary application echoes past either clock deadline', async () => {
    vi.useFakeTimers();
    for (const expiry of ['wall', 'monotonic']) {
      const f = fixture(); f.setWall(0); f.helper.handleControl(ready); f.helper.request();
      if (expiry === 'wall') f.setWall(5001);
      else { f.setNow(5001); f.setWall(-90_000); }
      f.helper.handleControl(pong(f.nonce())); expect(f.onConfirmed).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(5000); expect(f.onTimeout).toHaveBeenCalledTimes(1);
      f.helper.dispose();
    }
  });

  it('bounds a protocol nonce too, while accepting the immediate exact echo during valid transfer grace', async () => {
    vi.useFakeTimers();
    const f = fixture(); f.setWall(0); f.helper.handleControl(transferReady); f.helper.startProtocolPing();
    f.setWall(5001); expect(f.helper.confirmTransportPong(f.helper.protocolPingPayload)).toBe(false);
    f.helper.dispose();
    const live = fixture(); live.setWall(0); live.helper.handleControl(transferReady);
    live.helper.noteTransfer(RELAY_TRANSFER_MIN_BYTES); await vi.advanceTimersByTimeAsync(0);
    live.setWall(30_000); live.helper.handleControl(pong(live.nonce()));
    expect(live.onConfirmed).toHaveBeenCalledTimes(1);
    live.helper.dispose();
  });

  it.each(['send', 'hint'] as const)('preserves one slow %s transfer until the absolute deadline, never renewed by repeats', async mode => {
    vi.useFakeTimers();
    const f = fixture(true); f.helper.handleControl(transferReady);
    mode === 'send' ? f.helper.noteTransfer(RELAY_TRANSFER_MIN_BYTES) : f.helper.handleControl(hint());
    f.helper.startProtocolPing();
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.onTimeout).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(50_000);
    f.helper.noteTransfer(RELAY_TRANSFER_MIN_BYTES); f.helper.handleControl(hint());
    f.helper.handleControl({ type: 'res', ok: true });
    await vi.advanceTimersByTimeAsync(29_999);
    expect(f.onTimeout).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(f.onTimeout).toHaveBeenCalledTimes(1); expect(f.send.mock.calls.length).toBeLessThanOrEqual(2);
    f.helper.dispose(); expect(vi.getTimerCount()).toBe(0);
  });

  it('only lets a current-generation exact protocol pong clear transfer protection', async () => {
    vi.useFakeTimers();
    const f = fixture(); f.helper.handleControl(transferReady); f.helper.startProtocolPing();
    const old = f.helper.protocolPingPayload!;
    f.helper.noteTransfer(RELAY_TRANSFER_MIN_BYTES);
    expect(f.helper.confirmTransportPong('wrong')).toBe(false);
    expect(f.helper.confirmTransportPong(old)).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    const echo = f.nonce();
    f.helper.handleControl(hint()); // The application echo now predates this transfer too.
    f.helper.handleControl(pong(echo)); expect(f.onConfirmed).not.toHaveBeenCalled();
    f.helper.noteFrameReceived(RELAY_TRANSFER_MIN_BYTES);
    f.setNow(1000); await vi.advanceTimersByTimeAsync(1000);
    expect(f.nonce()).not.toBe(echo);
    f.helper.handleControl(pong(f.nonce())); expect(f.onConfirmed).toHaveBeenCalledTimes(1);
    expect(f.helper.startProtocolPing()).toBe(true);
    const fresh = f.helper.protocolPingPayload!;
    expect(f.helper.confirmTransportPong(fresh)).toBe(true);
    // A new missed check returns to the normal shared 5s deadline, not the old lease.
    f.helper.startProtocolPing(); f.setNow(6000); await vi.advanceTimersByTimeAsync(5000);
    f.setNow(11_000); await vi.advanceTimersByTimeAsync(5000);
    expect(f.onTimeout).toHaveBeenCalledTimes(1);
    f.helper.dispose();
  });

  it('bounds a stale-generation echo refresh by the old deadline rather than adding another 5s', async () => {
    vi.useFakeTimers();
    const f = fixture(true); f.helper.handleControl(transferReady); f.helper.noteTransfer(RELAY_TRANSFER_MIN_BYTES); f.helper.request();
    await vi.advanceTimersByTimeAsync(0);
    const old = f.nonce();
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(84_500);
    f.helper.handleControl(hint()); f.helper.handleControl(pong(old));
    await vi.advanceTimersByTimeAsync(500);
    expect(f.onTimeout).toHaveBeenCalledTimes(1); expect(f.send).toHaveBeenCalledTimes(2);
    f.helper.dispose(); expect(vi.getTimerCount()).toBe(0);
  });

  it('does not turn invalid, unnegotiated or duplicate-ready hints into protection', async () => {
    vi.useFakeTimers();
    const f = fixture(); f.helper.handleControl(ready); f.helper.handleControl(transferReady);
    f.helper.handleControl(hint()); f.helper.noteTransfer(RELAY_TRANSFER_MIN_BYTES);
    f.helper.startProtocolPing(); await vi.advanceTimersByTimeAsync(10_000);
    expect(f.onTimeout).toHaveBeenCalledTimes(1); f.helper.dispose();
    const next = fixture(); next.helper.handleControl(transferReady);
    for (const bytes of [-1, 131071, '131072', 8 * 1024 * 1024 + 1, null]) next.helper.handleControl(hint(bytes));
    next.helper.startProtocolPing(); await vi.advanceTimersByTimeAsync(10_000);
    expect(next.onTimeout).toHaveBeenCalledTimes(1); next.helper.dispose();
  });

  it('disposes a deferred deadline and never carries its allowance to a replacement', async () => {
    vi.useFakeTimers();
    const old = fixture(); old.helper.handleControl(transferReady); old.helper.noteTransfer(RELAY_TRANSFER_MIN_BYTES);
    await vi.advanceTimersByTimeAsync(0);
    old.setNow(5000); await vi.advanceTimersByTimeAsync(5000); old.helper.dispose();
    const next = fixture(); next.helper.handleControl(transferReady); next.helper.request();
    next.helper.handleControl(pong(old.nonce()));
    await vi.advanceTimersByTimeAsync(5000);
    expect(old.onTimeout).not.toHaveBeenCalled(); expect(next.onTimeout).toHaveBeenCalledTimes(1);
    next.helper.dispose(); expect(vi.getTimerCount()).toBe(0);
  });
});

describe('completed large-frame immediate health recheck', () => {
  function active() {
    vi.useFakeTimers(); vi.setSystemTime(0);
    const send = vi.fn(), onConfirmed = vi.fn(), onTimeout = vi.fn();
    const helper = new RelayOwnerPong({ send, onConfirmed, onTimeout, log: vi.fn(), now: () => Date.now(), wallNow: () => Date.now() });
    helper.handleControl({ event: 'relay.ready', payload: { capabilities: [RELAY_OWNER_PONG_CAPABILITY, RELAY_TRANSFER_CAPABILITY] } });
    return { helper, send, onConfirmed, onTimeout,
      nonce: () => JSON.parse(send.mock.calls.at(-1)![0].slice(PREFIX.length)).payload.nonce };
  }
  const incoming = (helper: RelayOwnerPong) => helper.handleControl({ event: 'relay.transfer-start', payload: { bytes: RELAY_TRANSFER_MIN_BYTES } });

  it('does not retain a received catalog frame allowance during the next idle failure', async () => {
    const f = active(); incoming(f.helper);
    await vi.advanceTimersByTimeAsync(25_000); expect(f.onTimeout).not.toHaveBeenCalled();
    f.helper.noteFrameReceived(RELAY_TRANSFER_MIN_BYTES); await vi.advanceTimersByTimeAsync(0);
    expect(f.send).toHaveBeenCalledTimes(1); expect(f.onConfirmed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(4999); expect(f.onTimeout).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(f.onTimeout).toHaveBeenCalledTimes(1);
    f.helper.dispose(); expect(vi.getTimerCount()).toBe(0);
  });

  it('probes immediately after an outgoing frame instead of waiting for the 15s cadence', async () => {
    const f = active(); f.helper.noteTransfer(RELAY_TRANSFER_MIN_BYTES);
    await vi.advanceTimersByTimeAsync(0); expect(f.send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(200); f.helper.handleControl(pong(f.nonce()));
    expect(f.onConfirmed).toHaveBeenCalledTimes(1);
    f.helper.startProtocolPing(); await vi.advanceTimersByTimeAsync(10_000);
    expect(f.onTimeout).toHaveBeenCalledTimes(1); f.helper.dispose();
  });

  it('coalesces later transfers at the 1s rate limit and rejects the superseded nonce', async () => {
    const f = active(); f.helper.noteTransfer(RELAY_TRANSFER_MIN_BYTES);
    await vi.advanceTimersByTimeAsync(0); const old = f.nonce();
    await vi.advanceTimersByTimeAsync(100);
    for (let count = 0; count < 5; count++) f.helper.noteTransfer(RELAY_TRANSFER_MIN_BYTES);
    f.helper.handleControl(pong(old)); expect(f.onConfirmed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(899); expect(f.send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(f.send).toHaveBeenCalledTimes(2);
    expect(f.nonce()).not.toBe(old); f.helper.handleControl(pong(f.nonce()));
    expect(f.onConfirmed).toHaveBeenCalledTimes(1); f.helper.dispose();
  });

  it('keeps a simultaneous slow outbound transfer protected after the inbound frame completes', async () => {
    const f = active(); f.helper.noteTransfer(RELAY_TRANSFER_MIN_BYTES); incoming(f.helper);
    f.helper.noteFrameReceived(RELAY_TRANSFER_MIN_BYTES); await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(25_000); expect(f.onTimeout).not.toHaveBeenCalled();
    f.helper.handleControl(pong(f.nonce())); expect(f.onConfirmed).toHaveBeenCalledTimes(1);
    f.helper.startProtocolPing(); await vi.advanceTimersByTimeAsync(10_000);
    expect(f.onTimeout).toHaveBeenCalledTimes(1); f.helper.dispose();
  });

  it('rejects a late nonce when inbound completion has removed grace but the absolute budget remains', async () => {
    const f = active(); incoming(f.helper); f.helper.noteFrameReceived(RELAY_TRANSFER_MIN_BYTES);
    await vi.advanceTimersByTimeAsync(0); const old = f.nonce();
    // Wall time passes before the already-due JavaScript timeout is serviced.
    vi.setSystemTime(5001); f.helper.handleControl(pong(old));
    expect(f.onConfirmed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5000); expect(f.onTimeout).toHaveBeenCalledTimes(1);
    f.helper.dispose();
  });
});
