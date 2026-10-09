jest.mock('@openhands/typescript-client/client/device-flow-client', () => ({
  pollForToken: jest.fn(),
  startDeviceFlow: jest.fn(),
}));

import {
  isSafeOpenHandsVerificationUrl,
  OPENHANDS_CLOUD_HOST,
  pollOpenHandsCloudToken,
  startOpenHandsCloudDeviceFlow,
  type OpenHandsDeviceFlowClient,
} from './device-flow';
import type {
  DeviceAuthorizationResponse,
  DeviceTokenResponse,
  PollDeviceTokenOptions,
} from '@openhands/typescript-client/client/device-flow-client';

const authorization: DeviceAuthorizationResponse = {
  device_code: 'device-code',
  user_code: 'ABCD-EFGH',
  verification_uri: 'https://app.all-hands.dev/device',
  verification_uri_complete: 'https://app.all-hands.dev/device?user_code=ABCD-EFGH',
  expires_in: 600,
  interval: 5,
};

const token: DeviceTokenResponse = {
  access_token: 'access-token',
  token_type: 'Bearer',
};

function createClient(): jest.Mocked<OpenHandsDeviceFlowClient> {
  return {
    startDeviceFlow: jest.fn().mockResolvedValue(authorization),
    pollForToken: jest.fn().mockResolvedValue(token),
  };
}

describe('OpenHands Cloud Device Flow', () => {
  test('starts the official flow against OpenHands Cloud', async () => {
    const client = createClient();

    await expect(startOpenHandsCloudDeviceFlow(client)).resolves.toEqual(authorization);
    expect(client.startDeviceFlow).toHaveBeenCalledWith(OPENHANDS_CLOUD_HOST);
  });

  test('rejects a verification URL outside the trusted Cloud origin', async () => {
    const client = createClient();
    client.startDeviceFlow.mockResolvedValue({
      ...authorization,
      verification_uri_complete: 'https://app.all-hands.dev.evil.example/authorize',
    });

    await expect(startOpenHandsCloudDeviceFlow(client)).rejects.toThrow(
      'OpenHands Cloud returned an invalid verification URL.',
    );
  });

  test.each([
    'javascript:alert(1)',
    'http://app.all-hands.dev/device',
    'https://app.all-hands.dev.evil.example/device',
    'https://user@app.all-hands.dev/device',
    'https://app.all-hands.dev:8443/device',
    'not a URL',
  ])('does not trust verification URL %s', (url) => {
    expect(isSafeOpenHandsVerificationUrl(url)).toBe(false);
  });

  test('allows only HTTPS verification links on the official Cloud origin', () => {
    expect(isSafeOpenHandsVerificationUrl('https://app.all-hands.dev/device?user_code=ABCD'))
      .toBe(true);
  });

  test('polls the official Cloud token endpoint and preserves cancellation options', async () => {
    const client = createClient();
    const controller = new AbortController();
    const options: PollDeviceTokenOptions = { interval: 5, signal: controller.signal };

    await expect(pollOpenHandsCloudToken(' device-code ', options, client)).resolves.toEqual(token);
    expect(client.pollForToken).toHaveBeenCalledWith(
      OPENHANDS_CLOUD_HOST,
      'device-code',
      options,
    );
  });

  test('rejects an empty device code without contacting Cloud', async () => {
    const client = createClient();

    await expect(pollOpenHandsCloudToken('   ', { interval: 5 }, client)).rejects.toThrow(
      'OpenHands device code must not be empty.',
    );
    expect(client.pollForToken).not.toHaveBeenCalled();
  });
});
