import { useEffect, useState } from 'react';

import { getConnectionRuntime } from '../connection';
import { resetForFreshInstall } from '../services/account-maintenance';
import { ensureInstallState, type InstallState } from '../services/install-state';

const FRESH_INSTALL_GATE_TIMEOUT_MS = 8_000;

/**
 * Settles the install marker before the app reads any Keychain-backed state.
 * Returns the resolved install state, or null while it is still pending; the
 * caller keeps the launch screen up until then so a reinstalled app never
 * starts the connection runtime against connections it is about to forget.
 */
export function useFreshInstallGate(): InstallState | null {
  const [state, setState] = useState<InstallState | null>(null);

  useEffect(() => {
    let active = true;
    let settled = false;
    const timeout = setTimeout(() => {
      if (!active || settled) return;
      settled = true;
      // A slow native storage provider must not leave the user on the splash forever.
      setState('existing');
    }, FRESH_INSTALL_GATE_TIMEOUT_MS);
    void ensureInstallState({
      resetForFreshInstall: () => resetForFreshInstall({
        removeAllConnections: () => getConnectionRuntime().removeAllConnections(),
      }),
    })
      .catch((): InstallState => 'existing')
      .then((resolved) => {
        if (active && !settled) {
          settled = true;
          setState(resolved);
        }
      })
      .finally(() => {
        clearTimeout(timeout);
      });
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, []);

  return state;
}
