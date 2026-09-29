import { performance } from 'node:perf_hooks';

const ACTIVE_INTERVAL_MS = 5_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRESENCE_EVENTS = new Set(['client_count', 'client_connected', 'client_disconnected']);

/** Only Relay-authored presence, never a forwarded client's control envelope. */
export function relayOwnerClientCount(value: unknown, socketList = false): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const control = value as Record<string, unknown>;
  if (typeof control.event !== 'string') return null;
  // OpenClaw's parsed controls retain absent optional fields as undefined.
  // Relay forwarding always supplies the actual full-client source identity.
  if (control.sourceClientId !== undefined || control.targetClientId !== undefined) return null;
  if (socketList && control.event === 'client.sockets') {
    const payload = control.payload as { clients?: unknown } | undefined;
    const ids = payload?.clients;
    return Array.isArray(ids) && ids.length <= 128 && ids.every(id => typeof id === 'string' && UUID.test(id))
      && new Set(ids).size === ids.length ? ids.length : null;
  }
  return PRESENCE_EVENTS.has(control.event) && typeof control.count === 'number'
    && Number.isSafeInteger(control.count) && control.count >= 0 && control.count <= 128 ? control.count : null;
}

/** Schedules future probes; presence is not health and cannot alter a live probe. */
export class RelayOwnerCadence {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private count: number | null = null;
  private socketListSeen = false;
  private anchor = 0;
  private due = 0;
  private readonly now: () => number;

  constructor(private readonly options: {
    idleIntervalMs: number;
    negotiated: () => boolean;
    onTick: (schedulerDelayMs: number) => void;
    repeat?: boolean;
    socketList?: boolean;
    now?: () => number;
  }) { this.now = options.now ?? (() => performance.now()); }

  private get intervalMs(): number {
    return this.options.negotiated() && this.count !== null && this.count > 0
      ? Math.min(this.options.idleIntervalMs, ACTIVE_INTERVAL_MS) : this.options.idleIntervalMs;
  }

  observe(control: unknown): void {
    if (this.disposed) return;
    const count = relayOwnerClientCount(control, this.options.socketList);
    const event = (control as { event?: unknown } | null)?.event;
    if (count !== null && (!this.socketListSeen || event === 'client.sockets')) {
      this.count = count;
      if (event === 'client.sockets') this.socketListSeen = true;
    }
    // Also re-evaluate after ready negotiates a previously received count.
    // Only move an existing timer earlier; flapping cannot postpone a probe.
    if (this.timer) {
      const sooner = this.anchor + this.intervalMs;
      if (sooner < this.due) { clearTimeout(this.timer); this.arm(sooner); }
    }
  }

  schedule(): void {
    if (this.disposed || this.timer) return;
    this.anchor = this.now();
    this.arm(this.anchor + this.intervalMs);
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.count = null;
  }

  private arm(due: number): void {
    this.due = due;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.disposed) return;
      this.options.onTick(Math.max(0, this.now() - due));
      if (this.options.repeat !== false) this.schedule();
    }, Math.max(0, Math.ceil(due - this.now())));
  }
}
