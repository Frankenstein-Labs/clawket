import { RELAY_TRANSFER_BUDGET_MS, transportNow } from './transfer-lease';

type TransferSource = { getTransferGraceMs(): number };

/** Keeps ordinary deadlines; only a known same-socket transfer can defer them. */
export function scheduleRequestTimeout(
  transport: TransferSource,
  timeoutMs: number,
  onTimeout: () => void,
): () => void {
  const deadline = transportNow() + Math.max(timeoutMs, RELAY_TRANSFER_BUDGET_MS);
  const wallDeadline = Date.now() + Math.max(timeoutMs, RELAY_TRANSFER_BUDGET_MS);
  let cancelled = false;
  let deferredForTransfer = false;
  let responseDeadline: number | null = null;
  let responseWallDeadline: number | null = null;
  let timer: ReturnType<typeof setTimeout>;
  const check = () => {
    if (cancelled) return;
    const remaining = Math.min(transport.getTransferGraceMs(), deadline - transportNow(), wallDeadline - Date.now());
    if (remaining > 0) {
      deferredForTransfer = true;
      // Recheck early completion without extending the absolute request budget.
      timer = setTimeout(check, Math.min(remaining, 1_000));
      return;
    }
    if (deferredForTransfer) {
      // Completed transfer protection does not mean the backend has answered.
      // Give its reply one ordinary response window within the request cap.
      responseDeadline ??= Math.min(deadline, transportNow() + timeoutMs);
      responseWallDeadline ??= Math.min(wallDeadline, Date.now() + timeoutMs);
      const responseRemaining = Math.min(Math.min(deadline, responseDeadline) - transportNow(),
        Math.min(wallDeadline, responseWallDeadline) - Date.now());
      if (responseRemaining > 0) {
        timer = setTimeout(check, responseRemaining);
        return;
      }
    }
    cancelled = true;
    onTimeout();
  };
  timer = setTimeout(check, timeoutMs);
  return () => { cancelled = true; clearTimeout(timer); };
}
