export const RELAY_TRANSFER_MIN_BYTES = 128 * 1024;
export const RELAY_TRANSFER_MAX_BYTES = 8 * 1024 * 1024;
export const RELAY_TRANSFER_BUDGET_MS = 90_000;

/** One bounded large-frame window per socket, never renewable by traffic alone. */
export class RelayTransferLease {
  private deadline: number | null = null;
  private wallDeadline: number | null = null;
  private revision = 0;
  private expired = false;
  private incomingBytes: number | null = null;
  private outgoingPending = false;

  constructor(private readonly now: () => number = transportNow, private readonly wallNow: () => number = Date.now) {}

  get generation(): number { return this.revision; }
  get hasWindow(): boolean { return this.deadline !== null; }
  get hasIncoming(): boolean { return this.incomingBytes !== null; }
  /** Only incomplete delivery or an unproven upload needs extended time. */
  get graceMs(): number {
    const remaining = this.remainingMs;
    return this.incomingBytes !== null || this.outgoingPending ? remaining : 0;
  }
  get remainingMs(): number {
    if (this.deadline === null || this.wallDeadline === null || this.expired) return 0;
    const remaining = Math.min(this.deadline - this.now(), this.wallDeadline - this.wallNow());
    if (remaining <= 0) {
      this.expired = true;
      this.revision += 1; // A pre-expiry probe cannot unlock this window after a clock rollback.
      return 0;
    }
    return remaining;
  }

  begin(bytes: unknown, direction: 'incoming' | 'outgoing' = 'outgoing'): boolean {
    if (typeof bytes !== 'number' || !Number.isSafeInteger(bytes)
      || bytes < RELAY_TRANSFER_MIN_BYTES || bytes > RELAY_TRANSFER_MAX_BYTES) return false;
    this.revision += 1;
    if (direction === 'incoming') this.incomingBytes = bytes;
    else this.outgoingPending = true;
    if (this.deadline === null) {
      this.deadline = this.now() + RELAY_TRANSFER_BUDGET_MS;
      this.wallDeadline = this.wallNow() + RELAY_TRANSFER_BUDGET_MS;
    }
    return true;
  }

  /** A complete hinted frame retires only its download protection, never health. */
  completeIncoming(bytes: number | null): boolean {
    if (bytes === null || bytes !== this.incomingBytes) return false;
    this.incomingBytes = null;
    return true;
  }

  /** Caller must have verified an exact nonce on this socket, sent at this generation. */
  confirmProbe(generation: number): boolean {
    if (generation !== this.revision || this.incomingBytes !== null) return false;
    this.deadline = null;
    this.wallDeadline = null;
    this.expired = false;
    this.outgoingPending = false;
    return true;
  }
}

export function transportNow(): number { return globalThis.performance?.now?.() ?? Date.now(); }
