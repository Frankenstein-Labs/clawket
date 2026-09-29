/** OS reachability is only a retry hint, never proof that our backend is healthy. */
export type NetworkRecoveryHint = Readonly<{
  type?: string;
  isConnected?: boolean;
  isInternetReachable?: boolean;
}>;

export const NETWORK_RECOVERY_SETTLE_MS = 300;
export const NETWORK_RECOVERY_MIN_INTERVAL_MS = 5_000;

type Path = Readonly<{ available: boolean; type: string | null }>;

export class NetworkRecoveryHints {
  private path: Path | null = null;
  private active = true;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastAttemptAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly invalidateHealth: () => void,
    private readonly recover: () => void,
    private readonly now: () => number = Date.now,
  ) {}

  update(hint: NetworkRecoveryHint): void {
    const next = readPath(hint);
    if (!next) return;
    const previous = this.path;
    this.path = next;
    if (previous === null) {
      if (!next.available) this.invalidateHealth();
      return;
    }
    const changed = previous !== null && (next.available !== previous.available
      || (next.available && next.type !== null && previous.type !== null && next.type !== previous.type));
    if (!changed) return;
    this.cancel();
    this.invalidateHealth();
    if (!next.available || !this.active) return;
    // Duplicate notifications do not postpone this timer. A real flap starts a
    // fresh stable window, while the shared cooldown bounds extra attempts.
    const delay = Math.max(NETWORK_RECOVERY_SETTLE_MS,
      this.lastAttemptAt + NETWORK_RECOVERY_MIN_INTERVAL_MS - this.now());
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.active || !this.path?.available) return;
      this.lastAttemptAt = this.now();
      this.recover();
    }, delay);
  }

  setActive(active: boolean): void {
    this.active = active;
    if (!active) this.cancel();
    // Foreground recovery already owns the transition back to the app.
  }

  reset(): void {
    this.cancel();
    this.path = null;
    this.lastAttemptAt = Number.NEGATIVE_INFINITY;
  }

  cancelPending(): void {
    this.cancel();
  }

  private cancel(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}

function readPath(hint: NetworkRecoveryHint): Path | null {
  const type = typeof hint.type === 'string' && hint.type !== 'NONE' && hint.type !== 'UNKNOWN'
    ? hint.type : null;
  if (hint.isConnected === false || hint.isInternetReachable === false || hint.type === 'NONE') {
    return { available: false, type };
  }
  if (hint.isConnected === true || hint.isInternetReachable === true) return { available: true, type };
  return null;
}
