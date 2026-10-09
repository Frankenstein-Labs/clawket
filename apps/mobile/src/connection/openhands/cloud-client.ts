import { openHandsCredentialStore } from './credential-store';

export const OPENHANDS_CLOUD_API_HOST = 'https://app.all-hands.dev';

type CloudOrganization = Readonly<Record<string, unknown>>;
export type CloudOrganizationsResult = Readonly<{
  items: ReadonlyArray<CloudOrganization>;
  currentOrgId: string | null;
}>;

export type OpenHandsCloudApi = Readonly<{
  getOrganizations(): Promise<CloudOrganizationsResult>;
}>;

type CloudClientConstructor = new (options: {
  host: string;
  apiKey: string;
}) => OpenHandsCloudApi;

/**
 * React Native implementation of the small Cloud API surface used by the app.
 * The published SDK imports node:http/node:https at module load time, which is
 * valid for Node but cannot be bundled into an Android JavaScript runtime.
 */
class FetchCloudClient implements OpenHandsCloudApi {
  private readonly host: string;
  private readonly apiKey: string;

  constructor(options: { host: string; apiKey: string }) {
    this.host = options.host.replace(/\/+$/, '');
    this.apiKey = options.apiKey;
  }

  async getOrganizations(): Promise<CloudOrganizationsResult> {
    const response = await fetch(`${this.host}/api/organizations`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-Session-API-Key': this.apiKey,
      },
    });
    if (!response.ok) throw new Error(`OpenHands Cloud request failed (${response.status}).`);
    const data = await response.json() as { items?: unknown; current_org_id?: unknown };
    return {
      items: Array.isArray(data?.items)
        ? data.items.filter((item): item is CloudOrganization => Boolean(item && typeof item === 'object'))
        : [],
      currentOrgId: typeof data?.current_org_id === 'string' ? data.current_org_id : null,
    };
  }
}

const officialCloudClientConstructor: CloudClientConstructor = FetchCloudClient;

/** Creates the authenticated Cloud API surface without returning the bearer token. */
export function createOpenHandsCloudClient(
  accessToken: string,
  Client: CloudClientConstructor = officialCloudClientConstructor,
): OpenHandsCloudApi {
  const normalizedToken = accessToken.trim();
  if (!normalizedToken) {
    throw new Error('OpenHands access token must not be empty.');
  }
  return new Client({ host: OPENHANDS_CLOUD_API_HOST, apiKey: normalizedToken });
}

/** Reads the device credential and verifies that it can reach the Cloud API. */
export async function verifyOpenHandsCloudSession(
  credentialStore = openHandsCredentialStore,
  Client: CloudClientConstructor = officialCloudClientConstructor,
): Promise<CloudOrganizationsResult> {
  const accessToken = await credentialStore.getAccessToken();
  if (!accessToken) {
    throw new Error('OpenHands Cloud is not authenticated.');
  }
  return createOpenHandsCloudClient(accessToken, Client).getOrganizations();
}
