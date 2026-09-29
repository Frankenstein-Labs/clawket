// Kept platform-neutral; Mobile mirrors these small bounds without importing a
// Node runtime package. This is scheduling allowance, never health evidence.
export const RELAY_TRANSFER_CAPABILITY = 'relay.transfer-hint.v1';
export const RELAY_TRANSFER_MIN_BYTES = 128 * 1024;
export const RELAY_TRANSFER_MAX_BYTES = 8 * 1024 * 1024;
export const RELAY_TRANSFER_LEASE_MS = 90_000;

export function advertiseRelayTransfer(url: URL): void {
  const capabilities = new Set((url.searchParams.get('capabilities') ?? '').split(',').filter(Boolean));
  capabilities.add(RELAY_TRANSFER_CAPABILITY);
  url.searchParams.set('capabilities', [...capabilities].join(','));
}

/** One socket only. An expired allowance stays locked until a fresh exact probe. */
export class RelayTransferLease {
  private deadline: number | null = null;
  private wallDeadline: number | null = null;
  private expired = false;
  private revision = 0;
  private incomingBytes: number | null = null;
  private outgoingPending = false;
  constructor(private readonly now: () => number, private readonly wallNow: () => number = Date.now) {}

  get generation(): number { return this.revision; }
  get hasWindow(): boolean { return this.deadline !== null; }
  get graceMs(): number {
    const remaining = this.remainingMs;
    return this.incomingBytes !== null || this.outgoingPending ? remaining : 0;
  }
  get remainingMs(): number {
    if (this.deadline === null || this.wallDeadline === null || this.expired) return 0;
    const remaining = Math.min(this.deadline - this.now(), this.wallDeadline - this.wallNow());
    if (remaining <= 0) { this.expired = true; this.revision++; }
    return Math.max(0, remaining);
  }

  begin(bytes: unknown, direction: 'incoming' | 'outgoing' = 'outgoing'): boolean {
    if (typeof bytes !== 'number' || !Number.isInteger(bytes)
      || bytes < RELAY_TRANSFER_MIN_BYTES || bytes > RELAY_TRANSFER_MAX_BYTES) return false;
    this.revision++;
    if (direction === 'incoming') this.incomingBytes = bytes;
    else this.outgoingPending = true;
    if (this.deadline === null) {
      this.deadline = this.now() + RELAY_TRANSFER_LEASE_MS;
      this.wallDeadline = this.wallNow() + RELAY_TRANSFER_LEASE_MS;
    }
    return true;
  }

  /** Exact next hinted frame is delivered. This ends only inbound HOL, not health. */
  completeIncoming(bytes: number): boolean {
    if (this.incomingBytes === null || bytes !== this.incomingBytes) return false;
    this.incomingBytes = null;
    return true;
  }

  // Caller must verify the current socket and exact nonce before supplying the
  // generation captured when that probe was sent. A send callback is not proof.
  confirmProbe(generation: number): boolean {
    if (generation !== this.revision || this.incomingBytes !== null) return false;
    this.deadline = null;
    this.wallDeadline = null;
    this.expired = false;
    this.outgoingPending = false;
    return true;
  }
}
