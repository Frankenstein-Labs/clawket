import { randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { RELAY_TRANSFER_CAPABILITY, RelayTransferLease } from './relay-transfer-lease.js';

// Mirrors @clawket/shared's additive Relay capability; this runtime does not
// depend on Worker packages. A relay.ready on this socket must also advertise it.
export const RELAY_OWNER_PONG_CAPABILITY = 'relay.owner-pong.v1';
const CONTROL_PREFIX = '__clawket_relay_control__:';
const DEFAULT_TIMEOUT_MS = 5_000;

export function advertiseRelayOwnerPong(url: URL): void {
  const capabilities = new Set((url.searchParams.get('capabilities') ?? '').split(',').filter(Boolean));
  capabilities.add(RELAY_OWNER_PONG_CAPABILITY);
  url.searchParams.set('capabilities', [...capabilities].join(','));
}

interface ProbeCycle {
  protocolNonce?: string;
  applicationNonce?: string;
  applicationStartedAt?: number;
  generation: number;
  startedAt: number;
  deadline: number;
  wallDeadline: number;
  expired: boolean;
  diagnostic: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  hedgeTimer: ReturnType<typeof setTimeout> | null;
}

/** One socket incarnation's bounded, transport-only round-trip check. */
export class RelayOwnerPong {
  private enabled = false;
  private negotiationComplete = false;
  private disposed = false;
  private failed = false;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private confirmedRoundTrip = false;
  private transferEnabled = false;
  private lastEchoAt: { monotonic: number; wall: number } | null = null;
  private lastDiagnosticAt: { monotonic: number; wall: number } | null = null;
  private readonly transfer: RelayTransferLease;
  private cycle: ProbeCycle | null = null;
  private readonly timeoutMs: number;
  private readonly now: () => number;
  private readonly wallNow: () => number;

  constructor(private readonly options: {
    send: (frame: string) => void;
    onConfirmed: () => void;
    onTimeout: () => void;
    log: (line: string) => void;
    timeoutMs?: number;
    legacyProtocolPongs?: boolean;
    now?: () => number;
    wallNow?: () => number;
  }) {
    this.timeoutMs = typeof options.timeoutMs === 'number' && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
      ? Math.min(DEFAULT_TIMEOUT_MS, options.timeoutMs) : DEFAULT_TIMEOUT_MS;
    this.now = options.now ?? (() => performance.now());
    this.wallNow = options.wallNow ?? Date.now;
    this.transfer = new RelayTransferLease(this.now, this.wallNow);
  }

  get negotiated(): boolean { return this.enabled && !this.disposed; }
  get protocolPingPayload(): string | undefined { return this.cycle?.protocolNonce; }

  noteTransfer(bytes: unknown): void {
    if (!this.failed && this.negotiated && this.transferEnabled && this.transfer.begin(bytes)) this.refreshAfterTransfer();
  }

  /** Called for the next complete application frame, never a protocol pong. */
  noteFrameReceived(bytes: number): void {
    if (!this.failed && this.negotiated && this.transferEnabled && this.transfer.completeIncoming(bytes)) this.refreshAfterTransfer();
  }

  /** Returns true for reserved pong controls, including malformed or stale ones. */
  handleControl(value: unknown): boolean {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const control = value as { event?: unknown; payload?: unknown };
    const payload = control.payload && typeof control.payload === 'object' && !Array.isArray(control.payload)
      ? control.payload as Record<string, unknown> : undefined;
    if (control.event === 'relay.ready' && !this.disposed && !this.negotiationComplete) {
      this.negotiationComplete = true;
      this.enabled = Array.isArray(payload?.capabilities) && payload.capabilities.includes(RELAY_OWNER_PONG_CAPABILITY);
      this.transferEnabled = this.enabled && Array.isArray(payload?.capabilities) && payload.capabilities.includes(RELAY_TRANSFER_CAPABILITY);
    }
    if (control.event === 'relay.transfer-start') {
      if (!this.failed && this.negotiated && this.transferEnabled) this.transfer.begin(payload?.bytes, 'incoming');
      return true;
    }
    if (control.event !== 'relay.owner-pong') return false;
    const cycle = this.cycle;
    if (this.failed || !this.negotiated || !cycle || typeof payload?.nonce !== 'string'
      || !/^[0-9a-f]{32}$/.test(payload.nonce) || payload.nonce !== cycle.applicationNonce
      || !this.confirmCycle(cycle)) return true;
    if (cycle.diagnostic) this.options.log(`relay heartbeat fallback confirmed rttMs=${Math.max(0, Math.round(this.now() - (cycle.applicationStartedAt ?? cycle.startedAt)))}`);
    this.options.onConfirmed();
    return true;
  }

  /** Standalone legacy/transfer echo, or a hedge inside the existing deadline. */
  request(): boolean {
    if (this.failed || !this.negotiated) return false;
    if (this.refreshTimer) return true;
    const cycle = this.cycle ?? this.beginCycle(this.timeoutMs);
    if (cycle.applicationNonce) return true;
    if (this.isExpired(cycle)) { this.timeout(cycle); return true; }
    if (cycle.hedgeTimer) clearTimeout(cycle.hedgeTimer);
    cycle.hedgeTimer = null;
    const nonce = randomBytes(16).toString('hex');
    cycle.applicationNonce = nonce;
    cycle.applicationStartedAt = this.now();
    // A later hint must not let an earlier protocol nonce confirm this frame.
    // Keep the cycle generation; a stale result schedules one fresh echo.
    this.lastEchoAt = { monotonic: this.now(), wall: this.wallNow() };
    const elapsed = this.lastDiagnosticAt
      ? Math.max(this.now() - this.lastDiagnosticAt.monotonic, this.wallNow() - this.lastDiagnosticAt.wall) : Infinity;
    cycle.diagnostic = elapsed >= 60_000;
    if (cycle.diagnostic) {
      this.lastDiagnosticAt = this.lastEchoAt;
      this.options.log('relay heartbeat fallback started');
    }
    try {
      this.options.send(CONTROL_PREFIX + JSON.stringify({ type: 'control', event: 'relay.owner-ping', payload: { nonce } }));
    } catch {
      if (this.cycle !== cycle) return true; // A synchronous proof already won.
      this.options.log('relay heartbeat fallback send failed');
      // The independent protocol ping can still prove this cycle. It retains
      // the original deadline, never a fresh timeout after the failed send.
      if (!cycle.protocolNonce) this.timeout(cycle);
    }
    return true;
  }

  /** Arm before ping: a timely exact pong avoids waking the Relay application. */
  startProtocolPing(timeoutMs = DEFAULT_TIMEOUT_MS, nonce?: string): boolean {
    if (this.disposed || this.failed) return false;
    if (!this.negotiated) return true; // The caller retains its legacy deadline.
    if (this.cycle || this.refreshTimer) return false;
    const delayMs = Number.isFinite(timeoutMs) && timeoutMs > 0
      ? Math.min(this.timeoutMs, timeoutMs) : this.timeoutMs;
    const cycle = this.beginCycle(delayMs, nonce ?? randomBytes(16).toString('hex'));
    // 1s is only a hedge delay, not a health threshold. Both replies have the
    // same original deadline; explicitly shorter policies stay shorter.
    if (delayMs > 1000) cycle.hedgeTimer = setTimeout(() => {
      cycle.hedgeTimer = null;
      if (this.cycle === cycle && !this.disposed) this.request();
    }, 1000);
    return true;
  }

  /** Call only for a pong on the current socket (Hermes also matches nonce). */
  confirmTransportPong(nonce?: string): boolean {
    if (this.disposed || this.failed) return false;
    if (this.negotiated && (!this.options.legacyProtocolPongs || this.transferEnabled)) {
      const cycle = this.cycle;
      if (!cycle?.protocolNonce || nonce !== cycle.protocolNonce) return false;
      return this.confirmCycle(cycle);
    }
    // A negotiated relay without the protocol-nonce extension (for example a
    // backend that only performs legacy, nonce-free pongs) confirms without a
    // protocol round-trip. Do not silently upgrade it.
    if (this.negotiated) this.confirmedRoundTrip = true;
    this.clearCycle(); this.clearRefreshTimer();
    return true;
  }

  /** One fast retry of this verified incarnation, never a lease/ownership bypass. */
  takeReconnectDelay(legacyDelayMs: number, closeCode: number): number {
    const eligible = this.negotiated && this.confirmedRoundTrip && closeCode === 1006;
    this.confirmedRoundTrip = false;
    return eligible ? Math.min(legacyDelayMs, Math.floor(Math.random() * 251)) : legacyDelayMs;
  }

  dispose(): void {
    this.disposed = true;
    this.enabled = false;
    this.confirmedRoundTrip = false;
    this.transferEnabled = false;
    this.clearCycle(); this.clearRefreshTimer();
  }

  private beginCycle(timeoutMs: number, protocolNonce?: string): ProbeCycle {
    const cycle: ProbeCycle = { protocolNonce, generation: this.transfer.generation,
      startedAt: this.now(), deadline: this.now() + timeoutMs, wallDeadline: this.wallNow() + timeoutMs,
      expired: false, diagnostic: false, timer: null, hedgeTimer: null };
    this.cycle = cycle;
    const expire = () => {
      if (this.disposed || this.cycle !== cycle) return;
      const remaining = this.transferEnabled ? this.transfer.graceMs : 0;
      if (!cycle.expired && remaining > 0) { cycle.timer = setTimeout(expire, remaining); return; }
      this.timeout(cycle);
    };
    const delay = this.transferEnabled && this.transfer.hasWindow
      ? Math.min(timeoutMs, Math.max(1, this.transfer.remainingMs)) : timeoutMs;
    cycle.timer = setTimeout(expire, delay);
    return cycle;
  }

  private isExpired(cycle: ProbeCycle): boolean {
    if (cycle.expired) return true;
    if ((this.transferEnabled && this.transfer.hasWindow && this.transfer.remainingMs <= 0)
      || ((this.now() >= cycle.deadline || this.wallNow() >= cycle.wallDeadline) && this.transfer.graceMs <= 0)) cycle.expired = true;
    return cycle.expired;
  }

  private confirmCycle(cycle: ProbeCycle): boolean {
    if (this.isExpired(cycle)) { this.timeout(cycle); return false; }
    if (this.transferEnabled && !this.transfer.confirmProbe(cycle.generation)) {
      this.clearCycle(); this.scheduleFreshEcho(); return false;
    }
    this.clearCycle(); this.clearRefreshTimer();
    this.confirmedRoundTrip = true;
    return true;
  }

  private timeout(cycle?: ProbeCycle): void {
    if (this.failed || this.disposed || (cycle && this.cycle !== cycle)) return;
    // Latch failure before notifying the owner. Buffered large frames cannot
    // reopen a new allowance while termination/disposal is being scheduled.
    this.failed = true;
    this.clearCycle(); this.clearRefreshTimer();
    this.options.log(cycle
      ? `relay heartbeat fallback timeout waitMs=${Math.max(0, Math.round(this.now() - (cycle.applicationStartedAt ?? cycle.startedAt)))} cycleWaitMs=${Math.max(0, Math.round(this.now() - cycle.startedAt))}`
      : 'relay heartbeat transfer timeout');
    this.options.onTimeout();
  }

  private refreshAfterTransfer(): void {
    // Retire probes queued before this frame. Neither an outgoing send nor a
    // complete incoming delivery proves health or renews the absolute budget.
    this.clearCycle(); this.scheduleFreshEcho();
  }

  private scheduleFreshEcho(): void {
    if (this.refreshTimer || this.disposed || this.failed) return;
    const remaining = this.transfer.remainingMs;
    const elapsed = this.lastEchoAt
      ? Math.max(this.now() - this.lastEchoAt.monotonic, this.wallNow() - this.lastEchoAt.wall) : 1000;
    const delay = Math.max(0, 1000 - elapsed);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      if (this.disposed || this.failed) return;
      if (this.transfer.hasWindow && this.transfer.remainingMs <= 0) {
        this.timeout();
      } else this.request();
    }, Math.max(0, Math.min(delay, remaining)));
  }

  private clearRefreshTimer(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
  }

  private clearCycle(): void {
    if (this.cycle?.timer) clearTimeout(this.cycle.timer);
    if (this.cycle?.hedgeTimer) clearTimeout(this.cycle.hedgeTimer);
    this.cycle = null;
  }
}
