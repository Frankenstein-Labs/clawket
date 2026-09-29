import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { permissionPatch } from './settings.js';

// A supported 5 MiB image is ~6.7 MiB of base64 and native rollout formats
// may record it more than once. A small preview-size tail would reject a
// legitimate conversation just after it acquired image input.
const TAIL_BYTES = 32 * 1024 * 1024;
export interface ResumePermissions { resume: Record<string, unknown>; expected: Record<string, unknown>; anonymous?: true }
export type ResumeSpeed = { kind: 'native'; serviceTier: string | null; permissions?: ResumePermissions } | { kind: 'absent' | 'unknown' };

/** Decode only audited native standard profiles; unknown anonymous policies must not become the global default. */
function resumePermissions(settings: any, cwd: string): ResumePermissions | undefined {
  const approvalPolicy = settings.approval_policy, approvalsReviewer = settings.approvals_reviewer;
  const granularKeys = ['sandbox_approval', 'rules', 'skill_approval', 'request_permissions', 'mcp_elicitations'];
  const granular = approvalPolicy && typeof approvalPolicy === 'object' && !Array.isArray(approvalPolicy)
    && Object.keys(approvalPolicy).length === 1 && approvalPolicy.granular
    && Object.keys(approvalPolicy.granular).length === granularKeys.length
    && granularKeys.every(key => typeof approvalPolicy.granular[key] === 'boolean');
  if ((!['never', 'on-request', 'untrusted', 'on-failure'].includes(approvalPolicy) && !granular)
    || !['user', 'auto_review', 'guardian_subagent'].includes(approvalsReviewer)) return;
  const common = { approvalPolicy, approvalsReviewer };
  const named = settings.active_permission_profile;
  if (named != null) {
    if (typeof named?.id !== 'string' || !/^[a-zA-Z0-9_.:-]{1,128}$/.test(named.id)) return;
    // Resolve the current native definition explicitly. Native must reject a
    // removed/restricted profile instead of falling back to another default.
    return { resume: { ...common, permissions: named.id }, expected: { ...common, permissions: named.id } };
  }
  const profile = settings.permission_profile;
  let mode: 'full-access' | 'read-only' | 'workspace' | undefined;
  if (profile?.type === 'disabled' && Object.keys(profile).length === 1) mode = 'full-access';
  else if (profile?.type === 'managed' && profile.network === 'restricted'
    && Object.keys(profile).every(k => ['type', 'network', 'file_system'].includes(k))
    && profile.file_system?.type === 'restricted' && Array.isArray(profile.file_system.entries)
    && Object.keys(profile.file_system).every(k => ['type', 'entries'].includes(k))) {
    const entries: string[] = [];
    for (const entry of profile.file_system.entries) {
      if (!entry || !['read', 'write'].includes(entry.access)
        || Object.keys(entry).some(k => !['path', 'access', 'missing_path_behavior'].includes(k))) return;
      let path: string;
      if (entry.path?.type === 'special' && Object.keys(entry.path).length === 2
        && entry.path.value && Object.keys(entry.path.value).length === 1
        && ['root', 'slash_tmp', 'tmpdir'].includes(entry.path.value.kind)) path = entry.path.value.kind;
      else if (entry.path?.type === 'path' && Object.keys(entry.path).length === 2 && typeof entry.path.path === 'string' && isAbsolute(entry.path.path)) path = resolve(entry.path.path);
      else return;
      entries.push(`${path}|${entry.access}|${entry.missing_path_behavior ?? ''}`);
    }
    const actual = [...new Set(entries)].sort();
    const root = ['root|read|'];
    const workspace = [...root, `${resolve(cwd)}|write|`, 'slash_tmp|write|', 'tmpdir|write|',
      ...['.git', '.agents', '.codex'].map(p => `${resolve(cwd, p)}|read|skip`)].sort();
    if (JSON.stringify(actual) === JSON.stringify(root)) mode = 'read-only';
    else if (JSON.stringify(actual) === JSON.stringify(workspace)) mode = 'workspace';
  }
  if (!mode) return;
  const sandbox = mode === 'full-access' ? 'danger-full-access' : mode === 'read-only' ? 'read-only' : 'workspace-write';
  return { resume: { ...common, sandbox }, expected: { ...permissionPatch(mode, cwd), ...common }, anonymous: true };
}

/** Native 0.153/0.158 resume omits persisted speed and anonymous permissions; never use an old Bridge cache. */
export async function nativeResumeSpeed(thread: { id: string; cwd: string; path?: string | null; modelProvider?: string }, env?: NodeJS.ProcessEnv): Promise<ResumeSpeed> {
  const path = thread.path;
  if (!path || !isAbsolute(path) || !basename(path).endsWith(`-${thread.id}.jsonl`)) return { kind: 'unknown' };
  let handle;
  try {
    const home = await realpath(env?.CODEX_HOME || process.env.CODEX_HOME || join(homedir(), '.codex'));
    const parent = await realpath(dirname(path));
    const local = relative(home, parent);
    if (isAbsolute(local) || local === '..' || local.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
      || !['sessions', 'archived_sessions'].includes(local.split(/[/\\]/)[0])) return { kind: 'unknown' };
    handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = await handle.stat();
    if (!before.isFile() || before.nlink !== 1 || before.size === 0) return { kind: 'unknown' };
    const length = Math.min(before.size, TAIL_BYTES), offset = before.size - length;
    const bytes = Buffer.alloc(length); let read = 0;
    while (read < length) {
      const part = await handle.read(bytes, read, length - read, offset + read);
      if (!part.bytesRead) return { kind: 'unknown' };
      read += part.bytesRead;
    }
    const after = await handle.stat();
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) return { kind: 'unknown' };
    const lines = bytes.toString('utf8').split('\n');
    if (offset) lines.shift();
    let matchingSession = false;
    for (let index = lines.length - 1; index >= 0; index--) {
      if (!lines[index].trim()) continue;
      let row: any;
      try { row = JSON.parse(lines[index]); } catch { return { kind: 'unknown' }; }
      const event = row?.payload;
      if (row?.type === 'session_meta' && event?.id === thread.id && typeof event.cwd === 'string' && resolve(event.cwd) === resolve(thread.cwd)) matchingSession = true;
      if (row?.type !== 'event_msg' || event?.type !== 'thread_settings_applied' || event.thread_id !== thread.id) continue;
      const settings = event.thread_settings;
      if (!settings || typeof settings.cwd !== 'string' || resolve(settings.cwd) !== resolve(thread.cwd)
        || typeof settings.model_provider_id !== 'string' || settings.model_provider_id !== thread.modelProvider
        || !(settings.service_tier === null || (typeof settings.service_tier === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(settings.service_tier)))) return { kind: 'unknown' };
      const permissions = resumePermissions(settings, thread.cwd);
      return { kind: 'native', serviceTier: settings.service_tier, ...(permissions ? { permissions } : {}) };
    }
    // A bounded tail without a matching event does not prove none exists.
    return { kind: !offset && matchingSession ? 'absent' : 'unknown' };
  } catch { return { kind: 'unknown' }; }
  finally { await handle?.close(); }
}
