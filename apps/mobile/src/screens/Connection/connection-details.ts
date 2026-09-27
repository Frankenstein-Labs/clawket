import type { ConnectionDescriptor } from '@clawket/agent-protocol';
import type { ConnectionRuntimeDetails } from '../../connection/runtime-details';
import { getConnectionValueKeys } from '../AccountSettings/model';
import type { AccountSettingsNamespace, AccountSettingsTranslator } from '../AccountSettings/translation';

/**
 * How a connection stands for the person reading it. Only the active
 * connection owns a live adapter, so every other connection is "not
 * connected" rather than offline (owner decision 2026-09-26); "offline" is
 * kept for the active connection when it cannot be reached.
 */
export type ConnectionPresence = 'paused' | 'online' | 'connecting' | 'offline' | 'not_connected';

const CONNECTING_STATES: ReadonlySet<string> = new Set(['connecting', 'handshaking', 'reconnecting']);

export function resolveConnectionPresence(input: Readonly<{
  active: boolean;
  paused: boolean;
  /** The runtime's active adapter state; ignored for an inactive connection. */
  state: string;
}>): ConnectionPresence {
  if (input.paused) return 'paused';
  if (!input.active) return 'not_connected';
  if (input.state === 'ready') return 'online';
  return CONNECTING_STATES.has(input.state) ? 'connecting' : 'offline';
}

export function translateConnectionPresence(
  t: AccountSettingsTranslator,
  presence: ConnectionPresence,
): string {
  switch (presence) {
    case 'paused': return t('Connection paused', { ns: 'config' });
    case 'online': return t('Online', { ns: 'common' });
    case 'connecting': return t('Connecting', { ns: 'common' });
    case 'offline': return t('Offline', { ns: 'common' });
    case 'not_connected': return t('Not connected', { ns: 'common' });
  }
}

/**
 * The Agent names a connection row or page lists under its label, or nothing when they only repeat
 * the label: a product backend's one Agent is named after its connection (`Hermes` under `Hermes`,
 * `Codex` under `Codex · Computer`; device review 2026-09-27).
 */
export function summarizeConnectionAgents(label: string, agentNames: ReadonlyArray<string>): string | undefined {
  const names = agentNames.map((name) => name.trim()).filter(Boolean);
  if (names.length === 0) return undefined;
  if (names.length === 1 && label.trim().toLocaleLowerCase().includes(names[0]!.toLocaleLowerCase())) return undefined;
  return names.join(' · ');
}

export type ConnectionDetailRow = Readonly<{
  id: 'backend' | 'transport' | 'environment' | 'server' | 'bridge-version' | 'bridge-capabilities' | 'last-ready';
  titleKey: string;
  titleNamespace: AccountSettingsNamespace;
  /** Translated through the account-settings key table. */
  valueKey?: string;
  /** Shown verbatim (hosts, versions, formatted dates). */
  value?: string;
  /** One fact per line under the title, for lists too long for the trailing value (capabilities). */
  detail?: string;
  /** The value is one unbreakable token (a host) that needs the wide tail to stay on one line. */
  wide?: boolean;
}>;

export type BuildConnectionDetailRowsInput = Readonly<{
  connection: ConnectionDescriptor;
  serverHost?: string;
  details?: ConnectionRuntimeDetails;
  locale?: string;
  /** Clock for the last-ready date; tests pin it. */
  now?: number;
}>;

/**
 * Read-only facts about one connection, in the order a person checks them when
 * something is wrong: what it is, how it connects, where, and what the Bridge
 * last said. Rows without a value are omitted rather than shown as blanks.
 */
export function buildConnectionDetailRows(
  input: BuildConnectionDetailRowsInput,
): ReadonlyArray<ConnectionDetailRow> {
  const [backend, transport, environment] = getConnectionValueKeys(input.connection);
  const rows: ConnectionDetailRow[] = [
    { id: 'backend', titleKey: 'Backend', titleNamespace: 'config', valueKey: backend },
    { id: 'transport', titleKey: 'Transport', titleNamespace: 'config', valueKey: transport },
    { id: 'environment', titleKey: 'Environment', titleNamespace: 'settings', valueKey: environment },
  ];
  const host = input.serverHost?.trim();
  if (host) rows.push({ id: 'server', titleKey: 'Server address', titleNamespace: 'settings', value: host, wide: true });
  const bridgeVersion = input.details?.bridgeVersion?.trim();
  if (bridgeVersion) {
    rows.push({ id: 'bridge-version', titleKey: 'Bridge version', titleNamespace: 'settings', value: bridgeVersion });
  }
  const capabilities = input.details?.bridgeCapabilities ?? [];
  if (capabilities.length > 0) {
    // Protocol identifiers do not wrap well in a trailing value (Hermes advertises ten; device review
    // 2026-09-27 showed them split mid-token), so the count trails and the list reads under the title.
    rows.push({
      id: 'bridge-capabilities',
      titleKey: 'Bridge capabilities',
      titleNamespace: 'settings',
      value: String(capabilities.length),
      detail: capabilities.join('\n'),
    });
  }
  rows.push({
    id: 'last-ready',
    titleKey: 'Last ready',
    titleNamespace: 'settings',
    value: formatConnectionLastReady(input.details?.lastReadyAt, input.locale, input.now),
  });
  return rows;
}

export function formatConnectionLastReady(
  timestampMs: number | null | undefined,
  locale?: string,
  now: number = Date.now(),
): string {
  if (!timestampMs || !Number.isFinite(timestampMs) || timestampMs < 0) return '—';
  try {
    // The year only when it is not this one, so the value fits the trailing slot on one line.
    const sameYear = new Date(timestampMs).getFullYear() === new Date(now).getFullYear();
    return new Intl.DateTimeFormat(locale || undefined, {
      ...(sameYear ? {} : { year: 'numeric' as const }),
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(timestampMs));
  } catch {
    return new Date(timestampMs).toISOString();
  }
}

export function parseConnectionServerHost(url: string): string | undefined {
  try {
    return new URL(url).host || undefined;
  } catch {
    return undefined;
  }
}
