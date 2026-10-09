import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'openhands.cloud.accessToken.v1';

const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export type OpenHandsSecureStore = Readonly<{
  getItemAsync(key: string, options?: SecureStore.SecureStoreOptions): Promise<string | null>;
  setItemAsync(key: string, value: string, options?: SecureStore.SecureStoreOptions): Promise<void>;
  deleteItemAsync(key: string, options?: SecureStore.SecureStoreOptions): Promise<void>;
}>;

export type OpenHandsCredentialStore = Readonly<{
  saveAccessToken(token: string): Promise<void>;
  getAccessToken(): Promise<string | null>;
  clearAccessToken(): Promise<void>;
}>;

export function createOpenHandsCredentialStore(
  secureStore: OpenHandsSecureStore = SecureStore,
): OpenHandsCredentialStore {
  return {
    async saveAccessToken(token) {
      const normalized = token.trim();
      if (!normalized) throw new Error('OpenHands access token must not be empty.');
      await secureStore.setItemAsync(ACCESS_TOKEN_KEY, normalized, SECURE_OPTIONS);
    },

    async getAccessToken() {
      const token = await secureStore.getItemAsync(ACCESS_TOKEN_KEY, SECURE_OPTIONS);
      return token?.trim() || null;
    },

    async clearAccessToken() {
      await secureStore.deleteItemAsync(ACCESS_TOKEN_KEY, SECURE_OPTIONS);
    },
  };
}

export const openHandsCredentialStore = createOpenHandsCredentialStore();
