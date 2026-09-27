import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TextSelectionMenuConfig } from 'react-native-enriched-markdown';

/**
 * Localized labels for the native markdown selection menu. The library shows
 * English "Copy" / "Copy as Markdown" beside the system's localized items
 * otherwise (iOS device review 2026-09-27). `{count}` is the library's own
 * placeholder for the multi-image form.
 */
export function useMarkdownSelectionMenu(): TextSelectionMenuConfig {
  const { t } = useTranslation(['chat', 'common']);
  return useMemo(() => ({
    copy: { label: t('Copy', { ns: 'common' }) },
    copyAsMarkdown: { label: t('Copy as Markdown', { ns: 'chat' }) },
    copyImageUrl: {
      label: t('Copy image URL', { ns: 'chat' }),
      pluralLabels: { other: t('Copy {{total}} image URLs', { ns: 'chat', total: '{count}' }) },
    },
  }), [t]);
}
