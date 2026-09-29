import { describe, expect, it } from 'vitest';
import { matchesNativeSettings, nativeSettings, permissionMode, permissionPatch, permissionSelectionPatch } from './settings.js';
const settings = {
  cwd: '/qa', model: 'native', modelProvider: 'custom', effort: 'high', serviceTier: 'default', approvalPolicy: 'on-request', approvalsReviewer: 'user',
  sandboxPolicy: { type: 'workspaceWrite', writableRoots: [], networkAccess: false, excludeTmpdirEnvVar: false, excludeSlashTmp: false },
  activePermissionProfile: null, collaborationMode: { mode: 'default', settings: { model: 'native', reasoning_effort: 'high', developer_instructions: null } },
};
describe('effective native settings', () => {
  it('uses durable named permission selections and still checks effective sandbox restrictions', () => {
    const patch = permissionSelectionPatch('workspace', '/qa');
    expect(patch).toEqual({ approvalPolicy: 'on-request', approvalsReviewer: 'user', permissions: ':workspace' });
    const effective = { ...nativeSettings(settings)!, activePermissionProfile: { id: ':workspace', extends: null } };
    expect(matchesNativeSettings(effective, patch)).toBe(true);
    expect(matchesNativeSettings({ ...effective, sandboxPolicy: { type: 'dangerFullAccess' } }, patch)).toBe(false);
    expect(matchesNativeSettings({ ...effective, activePermissionProfile: null }, patch)).toBe(false);
  });
  it('accepts native normalization of the implicit cwd and standard service tier', () => {
    const effective = nativeSettings(settings)!;
    expect(matchesNativeSettings(effective, permissionPatch('workspace', '/qa'))).toBe(true);
    expect(matchesNativeSettings(effective, { serviceTier: null })).toBe(true);
    expect(permissionMode(effective)).toBe('workspace');
  });
  it('does not equate wider permissions or a different model with the requested value', () => {
    const base = nativeSettings(settings)!;
    for (const changed of [
      { ...base, approvalPolicy: 'never' },
      { ...base, sandboxPolicy: { ...base.sandboxPolicy, writableRoots: ['/another-project'] } },
      { ...base, sandboxPolicy: { ...base.sandboxPolicy, networkAccess: true } },
    ]) expect(matchesNativeSettings(changed, permissionPatch('workspace', '/qa'))).toBe(false);
    expect(matchesNativeSettings(base, { model: 'other' })).toBe(false);
    expect(matchesNativeSettings({ ...base, serviceTier: 'priority' }, { serviceTier: null })).toBe(false);
  });
  it('only projects legacy normal mode at an explicitly audited cold-start boundary', () => {
    const response = { ...settings, sandbox: settings.sandboxPolicy, reasoningEffort: 'high', collaborationMode: undefined };
    expect(nativeSettings(response, true)).toBeUndefined();
    expect(nativeSettings(response, true, true)?.collaborationMode.settings.model).toBe('native');
    expect(nativeSettings({ ...settings, collaborationMode: null })).toBeUndefined();
  });
  it.each(['default', 'plan'])('confirms native %s preset instructions without weakening the other settings', mode => {
    const requested = { mode, settings: { model: 'native', reasoning_effort: 'high', developer_instructions: null } };
    const collaborationMode = { ...requested, settings: { ...requested.settings, developer_instructions: 'Native mode preset' } };
    const effective = nativeSettings({ ...settings, collaborationMode })!;
    expect(matchesNativeSettings(effective, { collaborationMode: requested })).toBe(true);
    expect(matchesNativeSettings(effective, { collaborationMode: requested }, false)).toBe(false);
    for (const wrong of [
      { ...requested, mode: mode === 'plan' ? 'default' : 'plan' },
      { ...requested, settings: { ...requested.settings, model: 'other' } },
      { ...requested, settings: { ...requested.settings, reasoning_effort: 'low' } },
      { ...requested, settings: { ...requested.settings, developer_instructions: 'Explicit user instructions' } },
      { ...requested, settings: { ...requested.settings, additional_setting: true } },
    ]) expect(matchesNativeSettings(effective, { collaborationMode: wrong })).toBe(false);
    expect(matchesNativeSettings({ ...effective, approvalPolicy: 'never' }, { collaborationMode: requested, approvalPolicy: 'on-request' })).toBe(false);
  });
  it('does not guess a preset for an unknown mode or treat explicit empty instructions as native defaults', () => {
    const collaborationMode = { mode: 'future', settings: { model: 'native', reasoning_effort: 'high', developer_instructions: 'Native instructions' } };
    const effective = nativeSettings({ ...settings, collaborationMode })!;
    expect(matchesNativeSettings(effective, { collaborationMode: { ...collaborationMode, settings: { ...collaborationMode.settings, developer_instructions: null } } })).toBe(false);
    expect(matchesNativeSettings(effective, { collaborationMode: { ...collaborationMode, settings: { ...collaborationMode.settings, developer_instructions: '' } } })).toBe(false);
  });
});
