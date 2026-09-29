import * as Network from 'expo-network';
import type { NetworkRecoveryHint } from '../connection/network-recovery';

type NetworkSource = Pick<typeof Network, 'addNetworkStateListener' | 'getNetworkStateAsync'>;

/** No address, SSID or network identifier is requested, persisted or logged. */
export function observeNetworkRecovery(
  onHint: (hint: NetworkRecoveryHint) => void,
  source: NetworkSource = Network,
): () => void {
  let stopped = false;
  let eventSeen = false;
  let subscription: ReturnType<NetworkSource['addNetworkStateListener']> | undefined;
  try {
    subscription = source.addNetworkStateListener(hint => {
      if (stopped) return;
      eventSeen = true;
      onHint(hint);
    });
    void source.getNetworkStateAsync().then(hint => {
      // A slow initial read must not overwrite a newer native event.
      if (!stopped && !eventSeen) onHint(hint);
    }).catch(() => undefined);
  } catch {
    // Unsupported native surfaces retain ordinary transport/foreground recovery.
  }
  return () => { stopped = true; subscription?.remove(); };
}
