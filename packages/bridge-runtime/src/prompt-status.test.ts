import { expect, it } from 'vitest';
import { readPromptIdentity, recordedPromptStatus } from './prompt-status.js';

it('bounds opaque message identities and accepts prototype-named keys as data', () => {
  expect(readPromptIdentity('__proto__')).toBe('__proto__');
  expect(readPromptIdentity('a'.repeat(200))).toHaveLength(200);
  for (const value of [undefined, null, 42, {}, '', 'a'.repeat(201)]) expect(() => readPromptIdentity(value)).toThrow('Invalid');
});
it('requires a valid recorded fingerprint and never invents native execution state', () => {
  const hash = 'a'.repeat(64);
  expect(recordedPromptStatus({ hash, runId: 'run' })).toEqual({ status: 'recorded', runId: 'run' });
  for (const value of [null, false, {}, { hash, runId: '' }, { hash: 'bad', runId: 'run' }, { hash, runId: 'a'.repeat(201) }]) {
    expect(recordedPromptStatus(value)).toEqual({ status: 'unknown' });
  }
});
