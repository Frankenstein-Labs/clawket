import { describe, expect, it } from 'vitest';
import { codexMessages, codexTurnFailure } from './history.js';

describe('Codex failed turn history', () => {
  it('keeps a stable authentication notice after native history reload without provider text', () => {
    const turn = { id: 'native-turn', status: 'failed', startedAt: 10, completedAt: 12,
      error: { codexErrorInfo: 'unauthorized', message: 'private credential detail', additionalDetails: 'private provider response' },
      items: [{ id: 'user', type: 'userMessage', content: [{ type: 'text', text: 'hello' }] }] };
    const messages = codexMessages([turn]);
    expect(messages).toHaveLength(2);
    expect(messages[1]).toEqual({ id: 'codex-turn-error:native-turn', role: 'system', timestampMs: 12000,
      text: 'Model authentication failed. Sign in again on your computer.' });
    expect(messages[1]).toEqual(codexTurnFailure(turn));
    expect(JSON.stringify(messages)).not.toContain('private');
  });
  it.each(['serverOverloaded', { httpConnectionFailed: { httpStatusCode: 500 } }, undefined])('uses safe generic copy for other native errors: %j', codexErrorInfo => {
    expect(codexTurnFailure({ id: 'turn', status: 'failed', error: { codexErrorInfo, message: 'private details' } })?.text)
      .toBe("The agent couldn't complete this reply. Please try again.");
  });
  it.each(['inProgress', 'interrupted', 'completed', 'incomplete', undefined])('does not invent a failure for %s', status => {
    expect(codexMessages([{ id: 'turn', status, error: { codexErrorInfo: 'unauthorized' }, items: [] }])).toEqual([]);
  });
});
