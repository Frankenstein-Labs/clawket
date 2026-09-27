/** A short, human-visible conversation excerpt; never include tool or reasoning payloads. */
export function sessionPreview(text: unknown, hasImage = false): string | undefined {
  if (typeof text !== 'string') return hasImage ? '📷' : undefined;
  const plain = text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/```[^\n]*\n?/g, '')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__|~~)(.*?)\1/g, '$2')
    .replace(/(^|\n)\s{0,3}(?:#{1,6}\s+|>\s+|[-*+]\s+|\d+[.)]\s+)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  const visible = plain || (hasImage ? '📷' : text.replace(/\s+/g, ' ').trim());
  return visible ? Array.from(visible).slice(0, 160).join('') : undefined;
}

export function lastVisiblePreview(messages: readonly Readonly<{
  role: string; text: string; timestampMs?: number; attachments?: readonly unknown[];
}>[]): { preview: string; lastActivityAt: number | null } | undefined {
  let latest: { preview: string; lastActivityAt: number | null; index: number } | undefined;
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index];
    if (message.role !== 'user' && message.role !== 'assistant') continue;
    const preview = sessionPreview(message.text, !!message.attachments?.length);
    if (!preview) continue;
    const lastActivityAt = typeof message.timestampMs === 'number' && Number.isFinite(message.timestampMs) ? message.timestampMs : null;
    if (!latest || (lastActivityAt !== null && latest.lastActivityAt !== null
      ? lastActivityAt >= latest.lastActivityAt : index > latest.index)) latest = { preview, lastActivityAt, index };
  }
  return latest ? { preview: latest.preview, lastActivityAt: latest.lastActivityAt } : undefined;
}
