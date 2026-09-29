/** One app lifecycle source, supplied by ConnectionCoordinator rather than per-socket native listeners. */
let active = true;
const listeners = new Set<(active: boolean) => void>();

export function isTransportAppActive(): boolean { return active; }

export function setTransportAppActive(next: boolean): void {
  if (active === next) return;
  active = next;
  for (const listener of listeners) listener(active);
}

export function observeTransportAppActive(listener: (active: boolean) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
