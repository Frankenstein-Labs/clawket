/** Integer credits avoid drift; one echoed nonce costs one second of credit. */
export interface HeartbeatEchoBudget {
  updatedAt: number;
  creditMs: number;
}

const ECHO_COST_MS = 1_000;
const MAX_CREDIT_MS = 4 * ECHO_COST_MS;

/**
 * A small arrival burst tolerates independently delayed, well-paced probes.
 * The caller persists an admitted budget before replying. A rejected budget
 * need not be saved: without consumption its next refill is equivalent.
 */
export function takeHeartbeatEchoCredit(
  stored: unknown,
  legacyLastPingAt: unknown,
  now: number,
): { allowed: boolean; budget: HeartbeatEchoBudget } | null {
  if (!Number.isSafeInteger(now) || now < 0) return null;
  let updatedAt = now;
  let creditMs = MAX_CREDIT_MS;
  if (stored !== undefined) {
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return null;
    const value = stored as Partial<HeartbeatEchoBudget>;
    if (!Number.isSafeInteger(value.updatedAt) || value.updatedAt! < 0
      || !Number.isSafeInteger(value.creditMs)) return null;
    updatedAt = value.updatedAt!;
    creditMs = Math.max(0, Math.min(MAX_CREDIT_MS, value.creditMs!));
  } else if (legacyLastPingAt !== undefined) {
    // Rolling upgrades retain the old peer's spent credit. Hibernation or a
    // new handler version must not grant another full arrival burst.
    if (!Number.isSafeInteger(legacyLastPingAt) || (legacyLastPingAt as number) < 0) return null;
    updatedAt = legacyLastPingAt as number;
    creditMs = 0;
  }
  const available = Math.min(MAX_CREDIT_MS, creditMs + Math.max(0, now - updatedAt));
  const allowed = available >= ECHO_COST_MS;
  return { allowed, budget: {
    updatedAt: Math.max(now, updatedAt),
    creditMs: available - (allowed ? ECHO_COST_MS : 0),
  } };
}
