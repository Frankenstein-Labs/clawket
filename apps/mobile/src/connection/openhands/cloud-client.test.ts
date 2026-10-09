import {
  createOpenHandsCloudClient,
  OPENHANDS_CLOUD_API_HOST,
  verifyOpenHandsCloudSession,
  type OpenHandsCloudApi,
} from './cloud-client';
import type { OpenHandsCredentialStore } from './credential-store';

jest.mock('@openhands/typescript-client/clients', () => ({
  CloudClient: class MockCloudClient {},
}));

function createClient(): jest.Mocked<OpenHandsCloudApi> {
  return { getOrganizations: jest.fn() };
}

function createCredentials(token: string | null): jest.Mocked<OpenHandsCredentialStore> {
  return {
    getAccessToken: jest.fn(async () => token),
    saveAccessToken: jest.fn(),
    clearAccessToken: jest.fn(),
  };
}

describe('OpenHands Cloud client', () => {
  test('configures the official host and keeps the token inside the SDK client', () => {
    const Client = jest.fn(() => createClient());
    const client = createOpenHandsCloudClient(' cloud-token ', Client);

    expect(Client).toHaveBeenCalledWith({ host: OPENHANDS_CLOUD_API_HOST, apiKey: 'cloud-token' });
    expect(client).toHaveProperty('getOrganizations');
  });

  test('rejects blank access tokens before creating a client', () => {
    const Client = jest.fn(() => createClient());

    expect(() => createOpenHandsCloudClient(' \n ', Client)).toThrow(
      'OpenHands access token must not be empty.',
    );
    expect(Client).not.toHaveBeenCalled();
  });

  test('verifies the stored token through the Cloud API', async () => {
    const client = createClient();
    client.getOrganizations.mockResolvedValue({ items: [], currentOrgId: null });
    const Client = jest.fn(() => client);
    const credentials = createCredentials('cloud-token');

    await expect(verifyOpenHandsCloudSession(credentials, Client)).resolves.toEqual({
      items: [],
      currentOrgId: null,
    });
    expect(client.getOrganizations).toHaveBeenCalledTimes(1);
    expect(credentials.getAccessToken).toHaveBeenCalledTimes(1);
  });

  test('fails closed when no token is stored', async () => {
    const Client = jest.fn(() => createClient());

    await expect(verifyOpenHandsCloudSession(createCredentials(null), Client)).rejects.toThrow(
      'OpenHands Cloud is not authenticated.',
    );
    expect(Client).not.toHaveBeenCalled();
  });
});
