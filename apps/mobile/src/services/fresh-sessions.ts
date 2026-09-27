/**
 * Conversations this app just created that nobody has written to yet.
 *
 * "New session" and "New session from a reply" create the session on the
 * backend at once, so leaving without sending used to leave an empty
 * "New session" behind in every list (owner decision 2026-09-27: discard it).
 * The Thread settles a session as soon as it shows a message, and asks
 * `takeAbandoned` when the reader leaves it. In memory only: a session left by
 * a killed app stays, which is the safe side.
 */
type Fresh = { seed: string };

const fresh = new Map<string, Fresh>();
const id = (connectionId: string, agentId: string, key: string) => JSON.stringify([connectionId, agentId, key]);

export const FreshSessions = {
  /** `seed` is the composer text the app itself prefilled; leaving it unchanged still counts as untouched. */
  mark(connectionId: string, agentId: string, key: string, seed = ''): void {
    fresh.set(id(connectionId, agentId, key), { seed });
  },
  /** A message, a rename, a pin or a delete means the reader wants this session; never discard it. */
  settle(connectionId: string, agentId: string, key: string): void {
    fresh.delete(id(connectionId, agentId, key));
  },
  /**
   * Whether leaving now abandons the session: still fresh, nothing sent, and the
   * composer empty or unchanged from the seed. Consumes the mark either way, so a
   * kept draft is never discarded on a later visit.
   */
  takeAbandoned(connectionId: string, agentId: string, key: string, composerText: string): boolean {
    const entry = fresh.get(id(connectionId, agentId, key));
    if (!entry) return false;
    fresh.delete(id(connectionId, agentId, key));
    const text = composerText.trim();
    return text === '' || text === entry.seed.trim();
  },
};
