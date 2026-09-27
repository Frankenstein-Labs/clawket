import type {
  AgentFileSummary,
  Capabilities,
  AgentFileOperations,
} from '@clawket/agent-protocol';

const CORE_FILE_ORDER = ['SOUL.md', 'MEMORY.md', 'USER.md', 'AGENTS.md'];

/** A search field above two to four core files was clutter (device review 2026-09-27). */
export const FILE_SEARCH_MIN_COUNT = 7;

export function shouldShowFileSearch(count: number, query: string): boolean {
  return count >= FILE_SEARCH_MIN_COUNT || query.trim().length > 0;
}

export function filterAgentFiles(
  files: ReadonlyArray<AgentFileSummary>,
  query: string,
): ReadonlyArray<AgentFileSummary> {
  const needle = query.trim().toLowerCase();
  return [...files]
    .filter((file) => !needle || `${file.name}\n${file.path}`.toLowerCase().includes(needle))
    .sort((left, right) => {
      const leftIndex = CORE_FILE_ORDER.indexOf(left.name);
      const rightIndex = CORE_FILE_ORDER.indexOf(right.name);
      if (leftIndex >= 0 || rightIndex >= 0) {
        if (leftIndex < 0) return 1;
        if (rightIndex < 0) return -1;
        if (leftIndex !== rightIndex) return leftIndex - rightIndex;
      }
      return left.name.localeCompare(right.name);
    });
}

export function formatFileSize(size?: number): string | undefined {
  if (size === undefined || !Number.isFinite(size) || size < 0) return undefined;
  if (size < 1_024) return `${size} B`;
  if (size < 1_048_576) return `${(size / 1_024).toFixed(1)} KB`;
  return `${(size / 1_048_576).toFixed(1)} MB`;
}

export function canEditAgentFile(
  capabilities: Pick<Capabilities, 'fileEdit'>,
  operations: AgentFileOperations | undefined,
): boolean {
  return capabilities.fileEdit && Boolean(operations?.set);
}
