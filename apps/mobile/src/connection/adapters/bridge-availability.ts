/** Bound transient owner recovery without polling a never-connected computer. */
export function bridgeUnavailableDelay(attempt: number, previouslyReady: boolean): number {
  // Four attempts span the Relay's existing 20-second owner lease. Stopping
  // at 2+4+8 would enter a 30-second wait just before that lease can recover.
  if (previouslyReady && attempt < 4) return 2_000 * 2 ** Math.min(attempt, 2);
  const offlineAttempt = previouslyReady ? attempt - 4 : attempt;
  return Math.min(120_000, 30_000 * 2 ** Math.min(offlineAttempt, 2));
}
