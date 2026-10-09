import {
  pollForToken,
  startDeviceFlow,
  type DeviceAuthorizationResponse,
  type DeviceTokenResponse,
  type PollDeviceTokenOptions,
} from '@openhands/typescript-client/client/device-flow-client';

export const OPENHANDS_CLOUD_HOST = 'https://app.all-hands.dev';

const OPENHANDS_CLOUD_ORIGIN = new URL(OPENHANDS_CLOUD_HOST).origin;

export type OpenHandsDeviceFlowClient = Readonly<{
  startDeviceFlow(host: string): Promise<DeviceAuthorizationResponse>;
  pollForToken(
    host: string,
    deviceCode: string,
    options: PollDeviceTokenOptions,
  ): Promise<DeviceTokenResponse>;
}>;

const officialDeviceFlowClient: OpenHandsDeviceFlowClient = {
  startDeviceFlow,
  pollForToken,
};

export class OpenHandsAuthUrlError extends Error {
  constructor() {
    super('OpenHands Cloud returned an invalid verification URL.');
    this.name = 'OpenHandsAuthUrlError';
  }
}

/** Accept only the HTTPS Cloud origin before sending a user to the browser. */
export function isSafeOpenHandsVerificationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.origin === OPENHANDS_CLOUD_ORIGIN
      && !url.username
      && !url.password;
  } catch {
    return false;
  }
}

/** Start the OAuth Device Flow against OpenHands Cloud using its published SDK. */
export async function startOpenHandsCloudDeviceFlow(
  client: OpenHandsDeviceFlowClient = officialDeviceFlowClient,
): Promise<DeviceAuthorizationResponse> {
  const response = await client.startDeviceFlow(OPENHANDS_CLOUD_HOST);
  if (
    !isSafeOpenHandsVerificationUrl(response.verification_uri)
    || !isSafeOpenHandsVerificationUrl(response.verification_uri_complete)
  ) {
    throw new OpenHandsAuthUrlError();
  }
  return response;
}

/** Poll OpenHands Cloud for the user-approved bearer token. */
export function pollOpenHandsCloudToken(
  deviceCode: string,
  options: PollDeviceTokenOptions,
  client: OpenHandsDeviceFlowClient = officialDeviceFlowClient,
): Promise<DeviceTokenResponse> {
  const normalizedDeviceCode = deviceCode.trim();
  if (!normalizedDeviceCode) {
    return Promise.reject(new Error('OpenHands device code must not be empty.'));
  }
  return client.pollForToken(OPENHANDS_CLOUD_HOST, normalizedDeviceCode, options);
}
