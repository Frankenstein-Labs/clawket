import { useEffect, useState } from 'react';
import { Image } from 'react-native';
import type { ImageMeta } from '../types/chat';
import { readDataUriImageSize } from '../utils/data-uri-image-size';

/**
 * Module-level cache for resolved image dimensions.
 * Keyed by URI, stores { width, height }.
 */
const dimensionCache = new Map<string, { width: number; height: number }>();

/**
 * Resolve image dimensions for URIs that are missing from imageMetas.
 *
 * Uses RN Image.getSize() with an in-memory cache.
 * Returns resolved ImageMeta[] once all are loaded, or undefined while loading.
 */
export function useImageDimensions(
  imageUris: string[] | undefined,
  imageMetas: ImageMeta[] | undefined,
): ImageMeta[] | undefined {
  const [resolved, setResolved] = useState<ImageMeta[] | undefined>(() => {
    if (imageMetas && imageMetas.length > 0 && imageMetas.every((m) => m.width > 0 && m.height > 0)) {
      return imageMetas;
    }
    return undefined;
  });

  useEffect(() => {
    // If imageMetas are already fully populated, use them directly
    if (imageMetas && imageMetas.length > 0 && imageMetas.every((m) => m.width > 0 && m.height > 0)) {
      setResolved(imageMetas);
      return;
    }

    const uris = imageMetas?.map((m) => m.uri) ?? imageUris;
    if (!uris || uris.length === 0) {
      setResolved(undefined);
      return;
    }

    let cancelled = false;

    const resolveAll = async () => {
      const results: ImageMeta[] = [];

      for (let i = 0; i < uris.length; i++) {
        const uri = uris[i];
        const existingMeta = imageMetas?.[i];

        // If this individual meta already has dimensions, use it
        if (existingMeta && existingMeta.width > 0 && existingMeta.height > 0) {
          results.push(existingMeta);
          continue;
        }

        // Check module cache
        const cached = dimensionCache.get(uri);
        if (cached) {
          results.push({ uri, ...cached });
          continue;
        }

        // Inline history images: Android's getSize cannot fetch `data:` URIs, so read the header.
        const inline = uri.startsWith('data:') ? readDataUriImageSize(uri) : null;
        if (inline) {
          dimensionCache.set(uri, inline);
          results.push({ uri, ...inline });
          continue;
        }

        // Resolve via RN Image.getSize
        try {
          const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
            Image.getSize(
              uri,
              (w, h) => resolve({ width: w, height: h }),
              reject,
            );
          });
          dimensionCache.set(uri, dims);
          results.push({ uri, ...dims });
        } catch {
          // Failed to get size — use 0×0 (layout will use fallback)
          results.push({ uri, width: 0, height: 0 });
        }
      }

      if (!cancelled) {
        setResolved(results);
      }
    };

    resolveAll();
    return () => { cancelled = true; };
  }, [imageUris, imageMetas]);

  return resolved;
}
