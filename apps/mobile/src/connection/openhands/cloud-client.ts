import { CloudClient, type CloudOrganizationsResult } from '@openhands/typescript-client/clients';
import { openHandsCredentialStore } from './credential-store';

export const OPENHANDS_CLOUD_API_HOST = 'https://app.all-hands.dev';

export type OpenHandsCloudApi = Readonly<{
  getOrganizations(): Promise<CloudOrganizationsResult>;
}>;

type CloudClientConstructor = new (options: {
  host: string;
  apiKey: string;
}) => OpenHandsCloudApi;

const officialCloudClientConstructor: CloudClientConstructor = CloudClient;

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
