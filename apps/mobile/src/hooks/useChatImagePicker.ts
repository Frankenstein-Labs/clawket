import { useCallback, useMemo, useState, useRef, useEffect, type SetStateAction } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { PendingImage } from '../types/chat';

const DEFAULT_MAX_IMAGES = 6;

function imagePayloadMimeType(base64: string): string | undefined {
  // Inspect at most 12 bytes without requiring a runtime base64 global.
  // A provider may retain its original MIME after export.
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let header = '';
  let buffer = 0;
  let bits = 0;
  for (let index = 0; index < Math.min(base64.length, 16); index += 1) {
    const char = base64[index]!;
    if (char === '=') break;
    const value = alphabet.indexOf(char);
    if (value < 0) return undefined;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      header += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  if (header.startsWith('\xff\xd8\xff')) return 'image/jpeg';
  if (header.startsWith('\x89PNG\r\n\x1a\n')) return 'image/png';
  if (header.startsWith('GIF87a') || header.startsWith('GIF89a')) return 'image/gif';
  if (header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP') return 'image/webp';
  return undefined;
}

export function useChatImagePicker(maxImages = DEFAULT_MAX_IMAGES, scope = '') {
  const [stored, updatePendingImages] = useState(() => ({ scope, generation: {}, images: [] as PendingImage[] }));
  let entry = stored;
  if (entry.scope !== scope) {
    // Retire before the new conversation renders its tray. Re-entering the
    // same scope creates a new generation, so old A→B→A callbacks stay retired.
    entry = { scope, generation: {}, images: [] };
    updatePendingImages(entry);
  }
  const generation = entry.generation;
  const currentGeneration = useRef<object | null>(generation);
  currentGeneration.current = generation;
  useEffect(() => {
    currentGeneration.current = generation;
    return () => { if (currentGeneration.current === generation) currentGeneration.current = null; };
  }, [generation]);
  const isCurrentAttachmentScope = useCallback(() => currentGeneration.current === generation, [generation]);
  const setPendingImages = useCallback((next: SetStateAction<PendingImage[]>) => {
    if (!isCurrentAttachmentScope()) return;
    updatePendingImages(previous => {
      if (!isCurrentAttachmentScope() || previous.generation !== generation) return previous;
      return { ...previous, images: typeof next === 'function' ? next(previous.images) : next };
    });
  }, [generation, isCurrentAttachmentScope]);
  const pendingImages = entry.images;

  const pickImage = useCallback(async () => {
    if (!isCurrentAttachmentScope() || pendingImages.length >= maxImages) return;

    const remaining = maxImages - pendingImages.length;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.8,
      base64: true,
      exif: false,
    });

    if (!isCurrentAttachmentScope()) return;
    if (!result.canceled && result.assets.length > 0) {
      const newImages = result.assets
        .filter((asset) => asset.base64)
        .map((asset) => ({
          uri: asset.uri,
          base64: asset.base64!,
          mimeType: imagePayloadMimeType(asset.base64!) ?? asset.mimeType ?? 'image/jpeg',
          width: asset.width,
          height: asset.height,
        }));
      setPendingImages((prev) => [...prev, ...newImages].slice(0, maxImages));
    }
  }, [maxImages, pendingImages.length, isCurrentAttachmentScope, setPendingImages]);

  /**
   * Attaches photos already on disk (the Add sheet's recent-photo picks) with
   * the same JPEG quality the system picker path uses, so HEIC originals
   * become the format the backends accept.
   */
  const attachLocalImages = useCallback(async (uris: readonly string[]) => {
    const remaining = maxImages - pendingImages.length;
    if (!isCurrentAttachmentScope() || remaining <= 0 || uris.length === 0) return;
    const ImageManipulator = await import('expo-image-manipulator');
    if (!isCurrentAttachmentScope()) return;
    const next: PendingImage[] = [];
    for (const uri of uris.slice(0, remaining)) {
      try {
        const result = await ImageManipulator.manipulateAsync(uri, [], {
          base64: true,
          compress: 0.8,
          format: ImageManipulator.SaveFormat.JPEG,
        });
        if (!isCurrentAttachmentScope()) return;
        if (!result.base64) continue;
        next.push({
          uri: result.uri,
          base64: result.base64,
          mimeType: 'image/jpeg',
          width: result.width,
          height: result.height,
        });
      } catch {
        /* skip unreadable photo */
      }
    }
    if (next.length === 0 || !isCurrentAttachmentScope()) return;
    setPendingImages((prev) => [...prev, ...next].slice(0, maxImages));
  }, [maxImages, pendingImages.length, isCurrentAttachmentScope, setPendingImages]);

  const clearPendingImages = useCallback(() => setPendingImages([]), [setPendingImages]);

  const removePendingImage = useCallback((index: number) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== index));
  }, [setPendingImages]);

  const canAddMoreImages = useMemo(() => pendingImages.length < maxImages, [maxImages, pendingImages.length, scope]);

  return {
    pendingImages,
    pickImage,
    attachLocalImages,
    clearPendingImages,
    removePendingImage,
    canAddMoreImages,
    maxImages,
    setPendingImages,
    isCurrentAttachmentScope,
  };
}
