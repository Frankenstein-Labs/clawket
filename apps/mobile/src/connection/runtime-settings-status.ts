/** In-memory write uncertainty survives screen/adapter replacement, never a message log. */
export class RuntimeSettingsStatus {
  private scopes = new Map<string, { connectionId: string; revision: number; permissionsRequired?: boolean }>();
  private nextRevision = 0;

  constructor(private readonly maxScopes = 128) {}

  version(connectionId: string, sessionKey: string | null): number | undefined {
    return this.scopes.get(JSON.stringify([connectionId, sessionKey]))?.revision;
  }

  begin(connectionId: string, sessionKey: string): number {
    const key = JSON.stringify([connectionId, sessionKey]);
    if (!this.scopes.has(key) && this.scopes.size >= this.maxScopes) {
      // Never evict an unresolved permission write just to admit another one.
      throw new Error('Refresh conversations with unconfirmed settings before changing more settings.');
    }
    const revision = ++this.nextRevision;
    this.scopes.set(key, { connectionId, revision, permissionsRequired: this.scopes.get(key)?.permissionsRequired });
    return revision;
  }

  requirePermissions(connectionId: string, sessionKey: string): void {
    const key = JSON.stringify([connectionId, sessionKey]);
    if (!this.scopes.has(key)) this.begin(connectionId, sessionKey);
    this.scopes.get(key)!.permissionsRequired = true;
  }

  requiresPermissions(connectionId: string, sessionKey: string | null): boolean {
    return this.scopes.get(JSON.stringify([connectionId, sessionKey]))?.permissionsRequired === true;
  }

  confirm(connectionId: string, sessionKey: string | null, revision: number | undefined, permissionsConfirmed = false): void {
    const key = JSON.stringify([connectionId, sessionKey]);
    const scope = this.scopes.get(key);
    if (scope?.revision === revision && (!scope?.permissionsRequired || permissionsConfirmed)) this.scopes.delete(key);
  }

  clearConnection(connectionId: string): void {
    for (const [key, scope] of this.scopes) {
      if (scope.connectionId === connectionId) this.scopes.delete(key);
    }
  }
}

export const runtimeSettingsStatus = new RuntimeSettingsStatus();
