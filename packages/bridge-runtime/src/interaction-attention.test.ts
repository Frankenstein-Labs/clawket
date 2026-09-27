import { describe, expect, it } from 'vitest';
import { InteractionAttention } from './interaction-attention.js';

describe('native interaction attention', () => {
  it('keeps same-ID questions isolated by session and waits for all answers', () => {
    const state = new InteractionAttention();
    for (const [key, id] of [['a', 'q'], ['b', 'q'], ['a', 'q2']]) state.accept({ type: 'question_requested', sessionKey: key, question: { id, kind: 'input', title: 'Answer' } });
    expect(state.get('a')).toBe('input');
    state.accept({ type: 'question_resolved', sessionKey: 'a', questionId: 'q' });
    expect(state.get('a')).toBe('input');
    expect(state.accept({ type: 'question_resolved', sessionKey: 'a', questionId: 'q2' })).toEqual({ type: 'session_info_update', session: { key: 'a', attention: null } });
    expect(state.get('b')).toBe('input');
  });
  it('distinguishes consent from input and retains input after consent resolves', () => {
    const state = new InteractionAttention();
    state.accept({ type: 'question_requested', sessionKey: 'a', question: { id: 'q', kind: 'input', title: 'Answer' } });
    state.accept({ type: 'approval_requested', sessionKey: 'a', approval: { kind: 'exec', id: 'approve', command: 'pwd', expiresAtMs: null, decisions: ['allow-once', 'deny'] } });
    expect(state.get('a')).toBe('approval');
    state.accept({ type: 'approval_resolved', approvalId: 'approve', decision: 'deny' });
    expect(state.get('a')).toBe('input');
    expect(state.accept({ type: 'approval_resolved', approvalId: 'unknown', decision: 'deny' })).toBeUndefined();
  });
  it('clears attention at native termination without resurrecting it on a late resolution', () => {
    const state = new InteractionAttention();
    state.accept({ type: 'question_requested', sessionKey: 'a', question: { id: 'q', kind: 'input', title: 'Answer' } });
    state.accept({ type: 'approval_requested', sessionKey: 'a', approval: { kind: 'exec', id: 'approve', command: 'pwd', expiresAtMs: null, decisions: ['allow-once'] } });
    state.accept({ type: 'run_finished', sessionKey: 'a', runId: 'r', stopReason: 'cancelled' });
    expect(state.get('a')).toBeNull();
    expect(state.accept({ type: 'approval_resolved', approvalId: 'approve', decision: 'deny' })).toBeUndefined();
    state.accept({ type: 'question_resolved', sessionKey: 'a', questionId: 'q' });
    expect(state.get('a')).toBeNull();
    expect(state.accept({ type: 'run_started', sessionKey: 'a', runId: 'r2' })).toBeUndefined();
  });
});
