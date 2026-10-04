import { describe, expect, it } from 'vitest';
import { codexMessages, codexTurnFailure } from './history.js';

describe('Codex user item clocks', () => {
  const user = (id: string, clientId?: string) => ({ id, type: 'userMessage', content: [{ type: 'text', text: 'Keep waiting' }], ...(clientId ? { clientId } : {}) });

  it('keeps two same-turn guides at their native times without changing their identities or order', () => {
    const turn = Object.freeze({ id: 'original-turn', startedAt: 100,
      itemTimestamps: new Map([['main', 100100], ['guide-1', 160100], ['guide-2', 220100]]),
      items: [user('main', 'receipt-1'), { id: 'progress', type: 'agentMessage', text: 'Waiting' },
        user('guide-1'), { id: 'tool', type: 'commandExecution', command: 'sleep', status: 'inProgress' }, user('guide-2')] });
    const messages = codexMessages([turn]);
    expect(messages.map(message => [message.id, message.role, message.timestampMs])).toEqual([
      ['main', 'user', 100100], ['progress', 'assistant', 100000], ['guide-1', 'user', 160100],
      ['toolcall_tool', 'tool', 100000], ['guide-2', 'user', 220100],
    ]);
    expect(messages[0].idempotencyKey).toBe('receipt-1');
    expect(messages[2].text).toBe(messages[4].text);
    expect(messages[2].idempotencyKey).toBeUndefined();
    expect(messages[4].idempotencyKey).toBeUndefined();
  });

  it.each([undefined, null, 0, -1, NaN, Infinity, 100.5, '160100', 8.64e15 + 1])(
    'keeps the legacy turn clock when the user item clock is invalid: %s', clock => {
      const messages = codexMessages([{ startedAt: 100, itemTimestamps: new Map([['guide', clock]]), items: [user('guide')] }]);
      expect(messages[0].timestampMs).toBe(100000);
    });

  it('keeps legacy history without item timing metadata unchanged', () => {
    expect(codexMessages([{ startedAt: 100, items: [user('legacy')] }])[0].timestampMs).toBe(100000);
    expect(codexMessages([{ items: [user('undated')] }])[0].timestampMs).toBeUndefined();
  });
});

describe('Codex failed turn history', () => {
  const unsupported = "The 'gpt-6.1-sol' model is not supported when using Codex with a ChatGPT account.";
  it.each([unsupported, JSON.stringify({ type: 'error', status: 400, error: { type: 'invalid_request_error', message: unsupported }, private: 'secret provider detail' })])('projects the exact unsupported-model refusal without exposing the response: %s', message => {
    const turn = { id: 'native-turn', status: 'failed', completedAt: 12, error: { codexErrorInfo: 'other', message } };
    expect(codexTurnFailure(turn)).toEqual({ id: 'codex-turn-error:native-turn', role: 'system', timestampMs: 12000,
      text: 'This model is unavailable in the current Codex runtime. Choose another model or update Codex on your computer.' });
    expect(codexMessages([turn])[0]).toEqual(codexTurnFailure(turn));
    expect(JSON.stringify(codexTurnFailure(turn))).not.toMatch(/gpt-6|secret/);
  });
  it.each([undefined, {}, '{broken', 'private prefix ' + unsupported, unsupported + ' token=secret',
    JSON.stringify({ type: 'error', status: 403, error: { type: 'invalid_request_error', message: unsupported } }),
    JSON.stringify({ type: 'error', status: 400, error: { type: 'other', message: unsupported } }),
    JSON.stringify({ type: 'error', status: 400, error: { type: 'invalid_request_error', message: unsupported }, private: 'x'.repeat(16384) }),
  ])('does not infer model availability from malformed or unknown errors: %j', message => {
    expect(codexTurnFailure({ id: 'turn', status: 'failed', error: { message } })?.text)
      .toBe("The agent couldn't complete this reply. Please try again.");
  });
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
