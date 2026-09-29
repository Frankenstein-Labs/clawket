import { BaseWebSocketTransport, type WebSocketTransportOptions } from './ws-base';
import { generateId } from '../../services/gateway-auth';
import { RELAY_CLIENT_PING_CAPABILITY, RELAY_CONTROL_PREFIX, RELAY_TRANSFER_HINT_CAPABILITY } from '../protocol/relay-control';
import { isTransportAppActive, observeTransportAppActive } from './foreground';
import type { WebSocketLike } from './types';
import { RelayTransferLease, transportNow } from './transfer-lease';
import { scheduleRequestTimeout } from './request-timeout';
import { getWebSocketFrameByteLength } from './frame-limit';

export const RELAY_CLIENT_PONG_CAPABILITY = 'relay.client-pong.v1';
export const RELAY_HANDSHAKE_TIMEOUT_MS = 20_000;
export const RELAY_CLIENT_PING_INTERVAL_MS = 5_000;
export const RELAY_CLIENT_PING_TIMEOUT_MS = 5_000;

export type RelayWsTransportOptions = WebSocketTransportOptions & {
  handshakeTimeoutMs?: number;
  pongCapability?: string;
  tickIntervalMs?: number;
  missedTickTolerance?: number;
};

/**
 * Backend-neutral Relay socket lifecycle. The adapter owns the contents of the
 * challenge response and calls `markReady` only after its handshake succeeds.
 */
export class RelayWsTransport extends BaseWebSocketTransport {
  public readonly advertisedCapabilities: readonly string[];

  private readonly handshakeTimeoutMs: number;
  private readonly pongCapability: string;
  private handshakeTimer: (() => void) | null = null;
  private tickIntervalMs: number;
  private missedTickTolerance: number;
  private lastTickAt: number | null = null;
  private tickWatchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private clientPingNegotiated = false;
  private transferHintNegotiated = false;
  private transferLease = new RelayTransferLease();
  private clientPingTimer: ReturnType<typeof setTimeout> | null = null;
  private clientPongTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingClientPing: { nonce: string; deadline: number; wallDeadline: number; socket: WebSocketLike | null; transferGeneration: number } | null = null;
  private lastClientPingSentAt: { monotonic: number; wall: number } | null = null;
  private stopObservingForeground: (() => void) | null = null;

  constructor(options: RelayWsTransportOptions) {
    super(options);
    this.handshakeTimeoutMs = readPositiveNumber(
      options.handshakeTimeoutMs,
      RELAY_HANDSHAKE_TIMEOUT_MS,
    );
    this.pongCapability = options.pongCapability?.trim() || RELAY_CLIENT_PONG_CAPABILITY;
    this.advertisedCapabilities = Object.freeze([this.pongCapability, RELAY_CLIENT_PING_CAPABILITY, RELAY_TRANSFER_HINT_CAPABILITY]);
    this.tickIntervalMs = readPositiveNumber(options.tickIntervalMs, 15_000);
    this.missedTickTolerance = readPositiveNumber(options.missedTickTolerance, 3);
  }

  public get lastHeartbeatAt(): number | null {
    return this.lastTickAt;
  }

  public override getTransferGraceMs(): number {
    return this.transferHintNegotiated && this.isSocketOpen && (this.state === 'ready' || this.state === 'handshaking')
      ? this.transferLease.graceMs : 0;
  }

  protected override onFrameSent(bytes: number): void {
    // Native send accepted the frame. A thrown send never creates a grace window.
    if (this.transferHintNegotiated && (this.state === 'ready' || this.state === 'handshaking')
      && this.transferLease.begin(bytes)) this.refreshTransferPing();
  }

  /** Applies a negotiated server heartbeat policy without backend knowledge. */
  public configureHeartbeat(options: { tickIntervalMs: number; missedTickTolerance?: number }): void {
    this.tickIntervalMs = readPositiveNumber(options.tickIntervalMs, this.tickIntervalMs);
    this.missedTickTolerance = readPositiveNumber(
      options.missedTickTolerance,
      this.missedTickTolerance,
    );
    if (this.state === 'ready' && !this.clientPingNegotiated) this.startTickWatchdog();
  }

  /**
   * Confirms a completed backend handshake. A raw socket open deliberately
   * does not reset reconnect backoff.
   */
  public markReady(): void {
    if (!this.isSocketOpen) return;
    this.clearHandshakeTimer();
    this.setReady(true);
    if (this.state === 'ready' && this.isSocketOpen) {
      if (this.clientPingNegotiated) this.scheduleClientPing(this.transferLease.hasWindow ? 0 : RELAY_CLIENT_PING_INTERVAL_MS);
      else this.startTickWatchdog();
    }
  }

  /** Keeps the public phase explicit if an adapter restarts its handshake. */
  public markHandshakeStarted(): void {
    if (!this.isSocketOpen) return;
    this.clearClientPing();
    this.setHandshaking();
    this.startHandshakeTimer();
  }

  /** Backend rejection retains the same backoff as a failed socket attempt. */
  public retryHandshake(minimumDelayMs = 0): void {
    this.forceReconnect(undefined, 'Backend handshake failed', minimumDelayMs);
  }

  protected handleSocketOpen(): void {
    this.stopObservingForeground = observeTransportAppActive(active => {
      if (!active) this.clearClientPing();
      else this.scheduleClientPing(this.transferLease.hasWindow && this.transferLease.remainingMs === 0
        ? 0 : RELAY_CLIENT_PING_INTERVAL_MS);
    });
    this.setHandshaking();
    this.startHandshakeTimer();
  }

  protected handleSocketMessage(data: unknown): void {
    const control = readLivenessControl(data);
    if (!control && this.transferHintNegotiated && this.transferLease.hasIncoming
      && this.transferLease.completeIncoming(getWebSocketFrameByteLength(data))) this.refreshTransferPing();
    if (control?.event === 'relay.ready' && Array.isArray(control.payload?.capabilities)) {
      if (control.payload.capabilities.includes(RELAY_CLIENT_PING_CAPABILITY)) {
        this.clientPingNegotiated = true;
        this.clearTickWatchdog();
        this.scheduleClientPing();
      }
      if (this.clientPingNegotiated && control.payload.capabilities.includes(RELAY_TRANSFER_HINT_CAPABILITY)) {
        this.transferHintNegotiated = true;
      }
    }
    if (control?.event === 'relay.transfer-start') {
      if (this.transferHintNegotiated && (this.state === 'ready' || this.state === 'handshaking')) this.transferLease.begin(control.payload?.bytes, 'incoming');
      return;
    }
    if (control?.event === 'relay.client-pong') {
      const pending = this.pendingClientPing;
      if (pending && this.clientPingNegotiated && isTransportAppActive()
        && pending.socket === this.socket && this.state === 'ready'
        && control.payload?.nonce === pending.nonce) {
        if ((transportNow() >= pending.deadline || Date.now() >= pending.wallDeadline)
          && this.getTransferGraceMs() <= 0) this.expireClientPing();
        else {
          const confirmsLatestFrame = this.transferLease.confirmProbe(pending.transferGeneration);
          this.clearClientPing();
          if (!confirmsLatestFrame) {
            // This echo preceded a newer frame. Ask again after Relay's rate
            // limit, without pushing the original transfer deadline outward.
            const remaining = this.transferLease.remainingMs;
            if (remaining <= 0) this.expireClientPing();
            else this.scheduleClientPing(Math.min(1_000, remaining), true);
            return;
          }
          this.lastTickAt = Date.now();
          this.scheduleClientPing();
        }
      }
      // Transport evidence never becomes backend readiness or a backend payload.
      return;
    }
    const tick = readTickFrame(data);
    if (tick) {
      this.lastTickAt = Date.now();
      this.acknowledgeNegotiatedTick(tick);
    }
    this.emitMessage(data);
  }

  protected override onSocketTerminated(): void {
    this.clearHandshakeTimer();
    this.clearTickWatchdog();
    this.lastTickAt = null;
    this.clearClientPing();
    this.clientPingNegotiated = false;
    this.transferHintNegotiated = false;
    this.transferLease = new RelayTransferLease();
    this.lastClientPingSentAt = null;
    this.stopObservingForeground?.();
    this.stopObservingForeground = null;
  }

  private scheduleClientPing(delayMs = RELAY_CLIENT_PING_INTERVAL_MS, completingTransfer = false): void {
    if (!this.clientPingNegotiated || !isTransportAppActive() || this.state !== 'ready'
      || !this.isSocketOpen || this.clientPingTimer || this.pendingClientPing) return;
    const socket = this.socket;
    const sendPing = () => {
      if (this.socket !== socket || !isTransportAppActive() || this.state !== 'ready' || !this.isSocketOpen) return;
      if (completingTransfer && this.transferLease.remainingMs <= 0) { this.expireClientPing(); return; }
      try {
        const nonce = generateId();
        const remaining = this.transferLease.remainingMs;
        const timeout = remaining > 0 ? Math.min(remaining, RELAY_CLIENT_PING_TIMEOUT_MS) : RELAY_CLIENT_PING_TIMEOUT_MS;
        const pending = { nonce, socket, deadline: transportNow() + timeout, wallDeadline: Date.now() + timeout,
          transferGeneration: this.transferLease.generation };
        this.pendingClientPing = pending;
        const check = () => {
          if (this.pendingClientPing !== pending) return;
          this.clientPongTimer = null;
          if (this.socket !== socket || !isTransportAppActive()) return;
          const graceMs = this.getTransferGraceMs();
          if (graceMs > 0) this.clientPongTimer = setTimeout(check, graceMs);
          else this.expireClientPing();
        };
        this.clientPongTimer = setTimeout(check, timeout);
        this.lastClientPingSentAt = { monotonic: transportNow(), wall: Date.now() };
        this.send(`${RELAY_CONTROL_PREFIX}${JSON.stringify({ type: 'control', event: 'relay.client-ping', payload: { nonce } })}`);
      } catch { this.expireClientPing(); }
    };
    if (delayMs === 0 && this.lastClientPingSentAt) {
      const elapsed = Math.max(transportNow() - this.lastClientPingSentAt.monotonic, Date.now() - this.lastClientPingSentAt.wall);
      delayMs = Math.max(0, 1_000 - elapsed);
    }
    if (completingTransfer) delayMs = Math.min(delayMs, this.transferLease.remainingMs);
    if (delayMs === 0) { sendPing(); return; }
    const timer = setTimeout(() => {
      if (this.clientPingTimer !== timer) return;
      this.clientPingTimer = null;
      sendPing();
    }, delayMs);
    this.clientPingTimer = timer;
  }

  private refreshTransferPing(): void {
    // Queue this nonce after the complete frame. Retire earlier probes so their
    // response cannot stand in for a round trip after the latest transfer.
    this.clearClientPing();
    this.scheduleClientPing(0, true);
  }

  private expireClientPing(): void {
    const socket = this.socket;
    this.clearClientPing();
    this.emitError({ code: 'heartbeat_timeout', message: 'Relay heartbeat timed out', retryable: true });
    if (this.socket === socket && this.state === 'ready' && isTransportAppActive()) this.forceReconnect(undefined, 'Relay heartbeat timed out');
  }

  private clearClientPing(): void {
    if (this.clientPingTimer) clearTimeout(this.clientPingTimer);
    if (this.clientPongTimer) clearTimeout(this.clientPongTimer);
    this.clientPingTimer = null;
    this.clientPongTimer = null;
    this.pendingClientPing = null;
  }

  private acknowledgeNegotiatedTick(frame: TickFrame): void {
    if (
      frame.type !== 'tick'
      || frame.ack !== this.pongCapability
      || typeof frame.ts !== 'number'
      || !Number.isFinite(frame.ts)
    ) return;

    try {
      this.send(JSON.stringify({ type: 'pong', ts: frame.ts }));
    } catch {
      // Socket close/error handling owns reconnect scheduling.
    }
  }

  private startTickWatchdog(): void {
    this.clearTickWatchdog();
    this.lastTickAt = Date.now();
    const toleranceMs = this.tickIntervalMs * this.missedTickTolerance;
    const check = () => {
      this.tickWatchdogTimer = null;
      if (this.state !== 'ready' || !this.isSocketOpen) return;
      const elapsed = this.lastTickAt == null
        ? Number.POSITIVE_INFINITY
        : Date.now() - this.lastTickAt;
      if (elapsed >= toleranceMs) {
        this.emitError({
          code: 'heartbeat_timeout',
          message: 'Relay heartbeat timed out',
          retryable: true,
        });
        this.forceReconnect(undefined, 'Relay heartbeat timed out');
        return;
      }
      this.tickWatchdogTimer = setTimeout(check, this.tickIntervalMs);
    };
    this.tickWatchdogTimer = setTimeout(check, toleranceMs);
  }

  private clearTickWatchdog(): void {
    if (!this.tickWatchdogTimer) return;
    clearTimeout(this.tickWatchdogTimer);
    this.tickWatchdogTimer = null;
  }

  private startHandshakeTimer(): void {
    this.clearHandshakeTimer();
    if (!this.isSocketOpen || this.state === 'closed') return;
    this.handshakeTimer = scheduleRequestTimeout(this, this.handshakeTimeoutMs, () => {
      this.handshakeTimer = null;
      if (!this.isSocketOpen || this.state === 'ready') return;
      this.emitError({
        code: 'challenge_timeout',
        message: 'Relay handshake timed out',
        retryable: true,
      });
      this.forceReconnect(undefined, 'Relay handshake timed out');
    });
  }

  private clearHandshakeTimer(): void {
    if (!this.handshakeTimer) return;
    this.handshakeTimer();
    this.handshakeTimer = null;
  }
}

type TickFrame = { type: 'tick'; ts?: unknown; ack?: unknown };

function readTickFrame(data: unknown): TickFrame | null {
  if (typeof data !== 'string') return null;
  try {
    const frame = JSON.parse(data) as { type?: unknown; ts?: unknown; ack?: unknown };
    return frame.type === 'tick' ? { ...frame, type: 'tick' } : null;
  } catch {
    return null;
  }
}

function readPositiveNumber(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function readLivenessControl(data: unknown): { event: string; payload?: { capabilities?: unknown; nonce?: unknown; bytes?: unknown } } | null {
  if (typeof data !== 'string' || data.length > 512 || !data.startsWith(RELAY_CONTROL_PREFIX)) return null;
  try {
    const frame = JSON.parse(data.slice(RELAY_CONTROL_PREFIX.length));
    return frame?.type === 'control' && typeof frame.event === 'string' ? frame : null;
  } catch { return null; }
}
