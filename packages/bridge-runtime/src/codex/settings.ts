import { isDeepStrictEqual } from 'node:util';
import { resolve } from 'node:path';

/** Native App Server 0.153+ effective settings; kept in memory, never a transcript store. */
export interface NativeSettings {
  cwd: string;
  model: string;
  modelProvider: string;
  effort: string | null;
  serviceTier: string | null;
  approvalPolicy: string | Record<string, unknown>;
  approvalsReviewer: string;
  sandboxPolicy: Record<string, unknown> & { type: string };
  activePermissionProfile: unknown;
  collaborationMode: { mode: string; settings: { model: string; reasoning_effort: string | null; developer_instructions: string | null } };
  multiAgentMode: unknown;
  summary: string | null;
  personality: string | null;
}

export type NativePermissionSettings = Pick<NativeSettings, 'cwd' | 'approvalPolicy' | 'approvalsReviewer' | 'sandboxPolicy' | 'activePermissionProfile'>;

/** Resume may omit unrelated model settings. Missing provenance never confirms a named profile. */
export function nativePermissionSettings(value: any): NativePermissionSettings | undefined {
  const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  if (!object(value) || typeof value.cwd !== 'string' || !value.cwd
    || !(typeof value.approvalPolicy === 'string' ? value.approvalPolicy.length > 0 : object(value.approvalPolicy))
    || typeof value.approvalsReviewer !== 'string' || !value.approvalsReviewer
    || !object(value.sandbox) || typeof value.sandbox.type !== 'string' || !value.sandbox.type) return;
  if (value.sandbox.type === 'workspaceWrite' && Object.hasOwn(value.sandbox, 'writableRoots')
    && (!Array.isArray(value.sandbox.writableRoots) || value.sandbox.writableRoots.some(root => typeof root !== 'string'))) return;
  const profile = value.activePermissionProfile ?? null;
  if (profile !== null && (!object(profile) || typeof profile.id !== 'string' || !profile.id || profile.id.length > 200)) return;
  return { cwd: value.cwd, approvalPolicy: value.approvalPolicy as NativePermissionSettings['approvalPolicy'], approvalsReviewer: value.approvalsReviewer,
    sandboxPolicy: value.sandbox as NativePermissionSettings['sandboxPolicy'], activePermissionProfile: profile };
}

/** Exactly supported 0.160 turn overrides; never mix a named profile with sandboxPolicy. */
export function nativeTurnPermissions(settings: NativePermissionSettings): Record<string, unknown> | undefined {
  const id = (settings.activePermissionProfile as { id?: unknown } | null)?.id;
  if (typeof id !== 'string' || !id.trim() || id.length > 200
    || !['user', 'auto_review', 'guardian_subagent'].includes(settings.approvalsReviewer)
    || !['readOnly', 'workspaceWrite', 'dangerFullAccess', 'externalSandbox'].includes(settings.sandboxPolicy.type)
    || !matchesNativeSettings(settings, { permissions: id })) return;
  const policy = settings.approvalPolicy;
  if (typeof policy === 'string') {
    if (!['untrusted', 'on-request', 'never'].includes(policy)) return;
  } else {
    const granular = policy.granular;
    if (Object.keys(policy).length !== 1 || !granular || typeof granular !== 'object' || Array.isArray(granular)
      || !['mcp_elicitations', 'rules', 'sandbox_approval'].every(key => typeof (granular as Record<string, unknown>)[key] === 'boolean')
      || Object.entries(granular).some(([key, value]) => !['mcp_elicitations', 'rules', 'sandbox_approval', 'request_permissions', 'skill_approval'].includes(key) || typeof value !== 'boolean')) return;
  }
  return { permissions: id, approvalPolicy: typeof policy === 'string' ? policy : { granular: { ...(policy.granular as object) } }, approvalsReviewer: settings.approvalsReviewer };
}

export function nativeSettings(value: any, resumed = false, legacyDefault = false): NativeSettings | undefined {
  const sandboxPolicy = resumed ? value?.sandbox : value?.sandboxPolicy;
  const effort = resumed ? value?.reasoningEffort : value?.effort;
  if (!value || typeof value.cwd !== 'string' || !value.cwd || typeof value.model !== 'string' || !value.model
    || typeof value.modelProvider !== 'string' || !value.modelProvider
    || (typeof value.approvalPolicy !== 'string' && (!value.approvalPolicy || typeof value.approvalPolicy !== 'object'))
    || typeof value.approvalsReviewer !== 'string' || !sandboxPolicy || typeof sandboxPolicy.type !== 'string'
    || !(effort === null || typeof effort === 'string')
    || !(value.serviceTier === null || typeof value.serviceTier === 'string')) return;
  // Start/resume in 0.153 omits collaborationMode. Its effective model/effort are authoritative;
  // normal mode is known only for new threads or the audited 0.153.3 cold resume.
  const collaborationMode = value.collaborationMode ?? (resumed && legacyDefault ? {
    mode: 'default', settings: { model: value.model, reasoning_effort: effort, developer_instructions: null },
  } : undefined);
  if (!collaborationMode || typeof collaborationMode.mode !== 'string' || typeof collaborationMode.settings?.model !== 'string') return;
  return { cwd: value.cwd, model: value.model, modelProvider: value.modelProvider, effort,
    serviceTier: value.serviceTier, approvalPolicy: value.approvalPolicy, approvalsReviewer: value.approvalsReviewer,
    sandboxPolicy, activePermissionProfile: value.activePermissionProfile ?? null, collaborationMode,
    multiAgentMode: value.multiAgentMode ?? null, summary: value.summary ?? null, personality: value.personality ?? null };
}

export function permissionMode(settings?: NativePermissionSettings): 'workspace' | 'read-only' | 'full-access' | 'custom' | null {
  if (!settings) return null;
  for (const mode of ['workspace', 'read-only', 'full-access'] as const) if (matchesNativeSettings(settings, permissionPatch(mode, settings.cwd))) return mode;
  return 'custom';
}

export function permissionPatch(mode: unknown, cwd: string): Record<string, unknown> {
  if (mode === 'full-access') return { approvalPolicy: 'never', approvalsReviewer: 'user', sandboxPolicy: { type: 'dangerFullAccess' } };
  if (mode === 'read-only') return { approvalPolicy: 'on-request', approvalsReviewer: 'user', sandboxPolicy: { type: 'readOnly', networkAccess: false } };
  if (mode === 'workspace') return { approvalPolicy: 'on-request', approvalsReviewer: 'user', sandboxPolicy: { type: 'workspaceWrite', writableRoots: [cwd], networkAccess: false, excludeTmpdirEnvVar: false, excludeSlashTmp: false } };
  throw new Error('Choose a supported permission mode');
}

export function permissionSelectionPatch(mode: unknown, cwd: string): Record<string, unknown> {
  const { sandboxPolicy: _sandboxPolicy, ...policy } = permissionPatch(mode, cwd);
  return { ...policy, permissions: mode === 'full-access' ? ':danger-full-access' : mode === 'read-only' ? ':read-only' : ':workspace' };
}

/** Native normalizes cwd out of writableRoots and represents cleared speed as default. */
export function matchesNativeSettings(settings: NativePermissionSettings & Partial<NativeSettings>, patch: Record<string, unknown>, allowNativePreset = true): boolean {
  return Object.entries(patch).every(([key, value]) => {
    if (value === undefined) return true;
    const actual = settings[key as keyof NativeSettings];
    if (key === 'permissions') {
      if (typeof value !== 'string' || (settings.activePermissionProfile as { id?: unknown } | null)?.id !== value) return false;
      const mode = value === ':danger-full-access' ? 'full-access' : value === ':read-only' ? 'read-only' : value === ':workspace' ? 'workspace' : undefined;
      return !mode || matchesNativeSettings(settings, { sandboxPolicy: permissionPatch(mode, settings.cwd).sandboxPolicy });
    }
    if (key === 'serviceTier' && value === null) return actual === null || actual === 'default';
    if (key === 'collaborationMode' && allowNativePreset) {
      const requested = value as NativeSettings['collaborationMode'] | null;
      const effective = settings.collaborationMode;
      // App Server 0.153+ fills null instructions from its built-in mode preset.
      // Null delegates only this field; mode, model, effort and any extra fields
      // must still match. Explicit instructions are never treated as a wildcard.
      if (requested?.settings?.developer_instructions === null && ['default', 'plan'].includes(requested.mode)
        && effective && (effective.settings?.developer_instructions === null
          || (typeof effective.settings.developer_instructions === 'string' && effective.settings.developer_instructions.length > 0))) {
        return isDeepStrictEqual({ ...effective, settings: { ...effective.settings, developer_instructions: null } }, requested);
      }
    }
    if (key === 'sandboxPolicy') {
      const normalize = (policy: any) => {
        if (policy?.type !== 'workspaceWrite') return policy;
        const roots = Array.isArray(policy.writableRoots) ? [...new Set(policy.writableRoots.map((p: string) => resolve(p)))].filter(p => p !== resolve(settings.cwd)).sort() : undefined;
        return { ...policy, writableRoots: roots };
      };
      return isDeepStrictEqual(normalize(actual), normalize(value));
    }
    return isDeepStrictEqual(actual, value);
  });
}
