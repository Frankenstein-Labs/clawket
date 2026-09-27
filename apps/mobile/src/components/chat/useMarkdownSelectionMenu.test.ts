import { renderHook } from '@testing-library/react-native';
import { useMarkdownSelectionMenu } from './useMarkdownSelectionMenu';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => `${String(options?.ns)}:${key.replace(/{{(.*?)}}/g, (_, name) => String(options?.[name] ?? name))}`,
  }),
}));

describe('useMarkdownSelectionMenu', () => {
  it('localizes every built-in copy action and keeps the library count placeholder', () => {
    const { result } = renderHook(() => useMarkdownSelectionMenu());
    expect(result.current).toEqual({
      copy: { label: 'common:Copy' },
      copyAsMarkdown: { label: 'chat:Copy as Markdown' },
      copyImageUrl: { label: 'chat:Copy image URL', pluralLabels: { other: 'chat:Copy {count} image URLs' } },
    });
  });
});
