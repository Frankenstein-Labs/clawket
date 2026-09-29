import { RuntimeSettingsStatus } from './runtime-settings-status';

it('never lets an older read confirm a newer setting write', () => {
  const state = new RuntimeSettingsStatus();
  const old = state.begin('computer', 'thread');
  const current = state.begin('computer', 'thread');
  state.confirm('computer', 'thread', old);
  expect(state.version('computer', 'thread')).toBe(current);
  state.confirm('computer', 'thread', current);
  expect(state.version('computer', 'thread')).toBeUndefined();
});

it('bounds admission without evicting uncertainty and releases removed connections', () => {
  const state = new RuntimeSettingsStatus(2);
  const first = state.begin('one', 'thread');
  state.begin('two', 'thread');
  expect(() => state.begin('three', 'thread')).toThrow('unconfirmed settings');
  expect(state.version('one', 'thread')).toBe(first);
  state.clearConnection('two');
  expect(() => state.begin('three', 'thread')).not.toThrow();
  expect(state.version('one', 'thread')).toBe(first);
  state.confirm('one', 'other-thread', first);
  expect(state.version('one', 'thread')).toBe(first);
});

it('retains a required permission choice across reads and writes until the current native revision explicitly confirms it', () => {
  const state = new RuntimeSettingsStatus();
  state.requirePermissions('computer', 'thread');
  const first = state.version('computer', 'thread');
  state.requirePermissions('computer', 'thread');
  expect(state.version('computer', 'thread')).toBe(first);
  state.confirm('computer', 'thread', first);
  expect(state.requiresPermissions('computer', 'thread')).toBe(true);
  const write = state.begin('computer', 'thread');
  state.confirm('computer', 'thread', first, true);
  state.confirm('computer', 'thread', write);
  expect(state.requiresPermissions('computer', 'thread')).toBe(true);
  state.confirm('computer', 'thread', write, true);
  expect(state.version('computer', 'thread')).toBeUndefined();
  expect(state.requiresPermissions('computer', 'thread')).toBe(false);
});
