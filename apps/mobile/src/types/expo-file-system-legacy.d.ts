declare module 'expo-file-system/legacy' {
  export const documentDirectory: string | null;
  export const cacheDirectory: string | null;
  export const EncodingType: {
    Base64: 'base64';
    UTF8: 'utf8';
  };

  export function getInfoAsync(uri: string): Promise<{ exists: boolean }>;
  export function makeDirectoryAsync(uri: string, options?: { intermediates?: boolean }): Promise<void>;
  export function copyAsync(options: { from: string; to: string }): Promise<void>;
  export function moveAsync(options: { from: string; to: string }): Promise<void>;
  export function readAsStringAsync(uri: string): Promise<string>;
  export function writeAsStringAsync(
    uri: string,
    contents: string,
    options?: { encoding?: string },
  ): Promise<void>;
  export function deleteAsync(uri: string, options?: { idempotent?: boolean }): Promise<void>;
}
