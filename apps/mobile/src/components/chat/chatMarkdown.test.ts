import { builtInAccents } from '../../theme/accents';
import { buildTheme } from '../../theme/theme';
import { createChatMarkdownStyle } from './chatMarkdown';

describe('createChatMarkdownStyle', () => {
  it('keeps room for three-digit ordered numbers without the old 2.5em column', () => {
    const colors = buildTheme('light', 'light', builtInAccents.iceBlue).colors;
    // "100." is about 2em wide in Roboto, SamsungOne and SF; 2.1em keeps it inside the column.
    expect(createChatMarkdownStyle(colors, 17).list.markerMinWidth).toBe(36);
    expect(createChatMarkdownStyle(colors, 15).list.markerMinWidth).toBe(32);
    expect(createChatMarkdownStyle(colors, 17).list.markerMinWidth).toBeGreaterThanOrEqual(Math.ceil(17 * 2));
  });
});
