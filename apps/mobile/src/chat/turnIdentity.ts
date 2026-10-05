import type { UiMessage } from '../types/chat';

/** Current controller-owned execution evidence, never a transcript or wire identity. */
export type RunWorkIdentity = Readonly<{
  scope: object;
  sessionKey: string;
  runId: string;
  turnId: string;
  inputMessageId: string;
  inputMessageKey?: string;
  startedAt: number;
}>;

/** Optional execution identity is evidence only when bounded and nonempty. */
export function validTurnIdentity(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 && value.trim() === value
    ? value : undefined;
}

/** Locate the original input, never a guide at the beginning of a partial page. */
export function originalRunUserIndex(messages: ReadonlyArray<UiMessage>, turnId?: string, inputMessageId?: string, inputMessageKey?: string): number {
  if (!validTurnIdentity(turnId) || !validTurnIdentity(inputMessageId)) return -1;
  const native = messages.findIndex(message => message.role === 'user' && message.turnId === turnId
    && [message.id, message.historyMessageId, message.renderKey].includes(inputMessageId));
  if (native >= 0) return native;
  const key = validTurnIdentity(inputMessageKey);
  return key ? messages.findIndex(message => message.role === 'user'
    && (!message.turnId || message.turnId === turnId) && message.idempotencyKey === key) : -1;
}

export function isNewUserTurn(message: UiMessage, original: UiMessage): boolean {
  return message.role === 'user' && (!validTurnIdentity(original.turnId) || message.turnId !== original.turnId
    || Boolean(message.idempotencyKey && message.idempotencyKey !== original.idempotencyKey));
}
