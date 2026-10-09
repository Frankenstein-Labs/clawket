import { WHEN_UNLOCKED_THIS_DEVICE_ONLY } from 'expo-secure-store';
import {
  createOpenHandsCredentialStore,
  type OpenHandsSecureStore,
} from './credential-store';

function createSecureStore(): jest.Mocked<OpenHandsSecureStore> {
  const values = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (key) => values.get(key) ?? null),
    setItemAsync: jest.fn(async (key, value) => { values.set(key, value); }),
    deleteItemAsync: jest.fn(async (key) => { values.delete(key); }),
  };
}

const expectedSecureOptions = {
  keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

describe('OpenHands Cloud credential store', () => {
  test('stores the token in SecureStore with device-only access and retrieves it', async () => {
    const secureStore = createSecureStore();
    const credentials = createOpenHandsCredentialStore(secureStore);

    await credentials.saveAccessToken('  cloud-token  ');

    expect(secureStore.setItemAsync).toHaveBeenCalledWith(
      'openhands.cloud.accessToken.v1',
      'cloud-token',
      expectedSecureOptions,
    );
    await expect(credentials.getAccessToken()).resolves.toBe('cloud-token');
    expect(secureStore.getItemAsync).toHaveBeenCalledWith(
      'openhands.cloud.accessToken.v1',
      expectedSecureOptions,
    );
  });

  test('does not store blank credentials', async () => {
    const secureStore = createSecureStore();
    const credentials = createOpenHandsCredentialStore(secureStore);

    await expect(credentials.saveAccessToken(' \n ')).rejects.toThrow(
      'OpenHands access token must not be empty.',
    );
    expect(secureStore.setItemAsync).not.toHaveBeenCalled();
  });

  test('clears the stored Cloud token on logout', async () => {
    const secureStore = createSecureStore();
    const credentials = createOpenHandsCredentialStore(secureStore);
    await credentials.saveAccessToken('cloud-token');

    await credentials.clearAccessToken();

    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith(
      'openhands.cloud.accessToken.v1',
      expectedSecureOptions,
    );
    await expect(credentials.getAccessToken()).resolves.toBeNull();
  });
});
