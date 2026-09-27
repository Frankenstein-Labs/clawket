import { describe, expect, it } from 'vitest';
import { lastVisiblePreview, sessionPreview } from './session-preview.js';

describe('session preview', () => {
  it('keeps readable words while removing common markdown and excess whitespace', () => {
    expect(sessionPreview('## **Done**\n- See [the fix](https://example.com) in `src/app.ts`  ')).toBe('Done See the fix in src/app.ts');
    expect(sessionPreview('a'.repeat(200))).toHaveLength(160);
  });
  it('uses one neutral image marker and ignores tools and empty assistant events', () => {
    expect(lastVisiblePreview([
      { role: 'user', text: '', attachments: [{}], timestampMs: 10 },
      { role: 'tool', text: 'secret result', timestampMs: 20 },
      { role: 'assistant', text: '  ', timestampMs: 30 },
    ])).toEqual({ preview: '📷', lastActivityAt: 10 });
    expect(lastVisiblePreview([{ role: 'assistant', text: 'Answer', timestampMs: 40 }])).toEqual({ preview: 'Answer', lastActivityAt: 40 });
    expect(lastVisiblePreview([
      { role: 'assistant', text: 'Newer reply', timestampMs: 80 },
      { role: 'user', text: 'Older prompt', timestampMs: 60 },
    ])).toEqual({ preview: 'Newer reply', lastActivityAt: 80 });
  });
});
