import { afterEach, beforeEach, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { nativeResumeSpeed } from './resume-settings.js';
import { permissionPatch } from './settings.js';

let home: string, thread: { id: string; cwd: string; path: string; modelProvider: string };
const event = (tier: unknown, patch: object = {}) => JSON.stringify({ type: 'event_msg', payload: { type: 'thread_settings_applied', thread_id: thread.id,
  thread_settings: { cwd: thread.cwd, model_provider_id: 'openai', service_tier: tier, ...patch } } }) + '\n';
const read = () => nativeResumeSpeed(thread, { CODEX_HOME: home });
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'clawket-resume-settings-')); mkdirSync(join(home, 'sessions'));
  const id = randomUUID(); thread = { id, cwd: resolve(home, 'project'), path: join(home, 'sessions', `rollout-qa-${id}.jsonl`), modelProvider: 'openai' };
});
afterEach(() => rmSync(home, { recursive: true, force: true }));
it('restores the newest exact native setting, including Standard instead of a stale Fast preference', async () => {
  writeFileSync(thread.path, event('priority') + event(null));
  expect(await read()).toEqual({ kind: 'native', serviceTier: null });
});
it('ignores referenced events belonging to another thread', async () => {
  writeFileSync(thread.path, event('priority') + event('default').replace(thread.id, randomUUID()));
  expect(await read()).toEqual({ kind: 'native', serviceTier: 'priority' });
});
it.each([{ cwd: '/another-project' }, { model_provider_id: 'another-provider' }, { service_tier: { unsafe: true } }])('does not fall back past an incompatible latest event %j', async patch => {
  writeFileSync(thread.path, event('priority') + event('default', patch));
  expect(await read()).toEqual({ kind: 'unknown' });
});
it('distinguishes proven absence in a complete file from a bounded tail without evidence', async () => {
  writeFileSync(thread.path, JSON.stringify({ type: 'session_meta', payload: { id: thread.id, cwd: thread.cwd } }) + '\n');
  expect(await read()).toEqual({ kind: 'absent' });
  writeFileSync(thread.path, event('priority') + JSON.stringify({ type: 'response_item', payload: { text: 'x'.repeat(32 * 1024 * 1024) } }) + '\n');
  expect(await read()).toEqual({ kind: 'unknown' });
});
it('reads a valid tail without scanning the full transcript', async () => {
  writeFileSync(thread.path, JSON.stringify({ type: 'response_item', payload: { text: 'x'.repeat(32 * 1024 * 1024) } }) + '\n' + event('priority'));
  expect(await read()).toEqual({ kind: 'native', serviceTier: 'priority' });
});
it('finds the native setting before a supported 5 MiB image recorded twice and a final reply', async () => {
  const image = 'data:image/png;base64,' + Buffer.alloc(5 * 1024 * 1024).toString('base64');
  const input = JSON.stringify({ type: 'response_item', payload: { content: [{ type: 'input_image', image_url: image }] } }) + '\n';
  const canonical = JSON.stringify({ type: 'event_msg', payload: { type: 'item_completed', item: { type: 'userMessage', content: [{ type: 'image', url: image }] } } }) + '\n';
  const oldHistory = JSON.stringify({ type: 'response_item', payload: { text: 'old'.repeat(8 * 1024 * 1024) } }) + '\n';
  writeFileSync(thread.path, oldHistory + event('priority') + input + canonical + JSON.stringify({ type: 'response_item', payload: { text: 'Done' } }) + '\n');
  expect(await read()).toEqual({ kind: 'native', serviceTier: 'priority' });
});
it('refuses truncated records, missing files and foreign paths', async () => {
  writeFileSync(thread.path, event('priority') + '{"type":"event_msg"');
  expect(await read()).toEqual({ kind: 'unknown' });
  rmSync(thread.path); expect(await read()).toEqual({ kind: 'unknown' });
  thread.path = join(home, `rollout-qa-${thread.id}.jsonl`); writeFileSync(thread.path, event('priority'));
  expect(await read()).toEqual({ kind: 'unknown' });
});
it.skipIf(process.platform === 'win32')('does not follow a swapped transcript symlink', async () => {
  const target = join(home, 'private.jsonl'); writeFileSync(target, event('priority')); symlinkSync(target, thread.path);
  expect(await read()).toEqual({ kind: 'unknown' });
});

it.each(['full-access', 'read-only', 'workspace'] as const)('restores the latest anonymous native %s profile without using a global default', async mode => {
  const entries = [{ path: { type: 'special', value: { kind: 'root' } }, access: 'read' }];
  const workspace = [
    ...entries,
    { path: { type: 'path', path: thread.cwd }, access: 'write' },
    ...['slash_tmp', 'tmpdir'].map(kind => ({ path: { type: 'special', value: { kind } }, access: 'write' })),
    ...['.git', '.agents', '.codex'].map(p => ({ path: { type: 'path', path: join(thread.cwd, p) }, access: 'read', missing_path_behavior: 'skip' })),
  ];
  const permission_profile = mode === 'full-access' ? { type: 'disabled' } : { type: 'managed', network: 'restricted', file_system: { type: 'restricted', entries: mode === 'workspace' ? [...workspace, workspace[1]] : entries } };
  const policy = { approval_policy: mode === 'full-access' ? 'never' : 'on-request', approvals_reviewer: 'user' };
  writeFileSync(thread.path, event('priority', { ...policy, permission_profile }));
  const result = await read();
  expect(result).toMatchObject({ kind: 'native', permissions: {
    resume: { sandbox: mode === 'full-access' ? 'danger-full-access' : mode === 'workspace' ? 'workspace-write' : 'read-only' },
    expected: permissionPatch(mode, thread.cwd),
  } });
});
it('selects the latest native named profile explicitly, never a cached standard mode', async () => {
  writeFileSync(thread.path, event('priority', { approval_policy: 'never', approvals_reviewer: 'user', permission_profile: { type: 'disabled' } })
    + event(null, { approval_policy: 'on-request', approvals_reviewer: 'user', active_permission_profile: { id: 'company-restricted', extends: ':read-only' } }));
  expect(await read()).toMatchObject({ kind: 'native', serviceTier: null, permissions: {
    resume: { permissions: 'company-restricted', approvalPolicy: 'on-request' }, expected: { permissions: 'company-restricted' },
  } });
});
it('preserves a named managed profile with granular approvals and native reviewer', async () => {
  const approval_policy = { granular: { sandbox_approval: false, rules: true, skill_approval: true, request_permissions: false, mcp_elicitations: true } };
  writeFileSync(thread.path, event(null, { approval_policy, approvals_reviewer: 'auto_review', active_permission_profile: { id: 'managed', extends: ':read-only' } }));
  expect(await read()).toMatchObject({ kind: 'native', permissions: { resume: { approvalPolicy: approval_policy, approvalsReviewer: 'auto_review', permissions: 'managed' } } });
});
it.each([
  { type: 'future' }, { type: 'disabled', extra: true },
  { type: 'managed', network: 'enabled', file_system: { type: 'restricted', entries: [] } },
  { type: 'managed', network: 'restricted', file_system: { type: 'restricted', entries: [{ path: { type: 'path', path: '/another' }, access: 'write' }] } },
])('does not reinterpret unknown or custom anonymous policies as standard %j', async permission_profile => {
  writeFileSync(thread.path, event('priority', { approval_policy: 'never', approvals_reviewer: 'user', permission_profile: { type: 'disabled' } })
    + event('priority', { approval_policy: 'on-request', approvals_reviewer: 'user', permission_profile }));
  expect(await read()).toEqual({ kind: 'native', serviceTier: 'priority' });
});
