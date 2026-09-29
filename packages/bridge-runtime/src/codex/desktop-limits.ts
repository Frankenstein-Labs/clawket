// This is the local Unix/private Desktop IPC budget, not the public 8 MiB
// Bridge/Relay/App frame contract. Desktop's audited reader accepts 256 MiB;
// we keep a much smaller bound while preserving duplicated native image input.
export const DESKTOP_IPC_FRAME_BYTES = 16 * 1024 * 1024;
export const DESKTOP_HISTORY_BYTES = 7 * 1024 * 1024;
export class DesktopHistoryLimitError extends Error {
  readonly code = 'desktop_history_limit';
  constructor() { super('This history exceeds the Desktop synchronization limit. Load older pages on your computer; the task has not been stopped.'); }
}
