import type { ChatMessage, SessionHistory } from '@clawket/agent-protocol';
import type { CloudEvent } from './cloud-client';

/** Cloud conversations are messages-first sessions; the conversation id is the session key. */
export const CLOUD_AGENT_ID = 'main';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function timestampMs(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function messageText(llmMessage: unknown): string {
  const content = asRecord(llmMessage).content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => asRecord(part))
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text as string)
    .join('\n');
}

function toolInput(action: unknown): unknown {
  const record = asRecord(action);
  return Object.keys(record).length > 0 ? record : undefined;
}

/**
 * Projects the agent-server event stream into the app's rendering-neutral
 * {@link ChatMessage} list. Unknown kinds are ignored, so a newer server never
 * breaks an older client. Action/Observation pairs share one tool message.
 */
export function mapCloudEvents(events: ReadonlyArray<CloudEvent>): ChatMessage[] {
  const messages: ChatMessage[] = [];
  const toolByCallId = new Map<string, ChatMessage>();

  for (const event of events) {
    const id = typeof event.id === 'string' && event.id ? event.id : `evt-${messages.length}`;
    const at = timestampMs(event.timestamp);
    switch (event.kind) {
      case 'MessageEvent': {
        const llmMessage = asRecord(event.llm_message);
        const role = llmMessage.role;
        const text = messageText(llmMessage);
        if (!text || (role !== 'user' && role !== 'assistant' && role !== 'system')) break;
        messages.push({
          id,
          role,
          text,
          ...(at !== undefined ? { timestampMs: at } : {}),
        });
        break;
      }
      case 'ActionEvent': {
        const toolCall = asRecord(event.tool_call);
        const callId = typeof event.tool_call_id === 'string' ? event.tool_call_id
          : typeof toolCall.id === 'string' ? toolCall.id : id;
        const name = typeof event.tool_name === 'string' ? event.tool_name
          : typeof toolCall.name === 'string' ? toolCall.name : 'tool';
        const message: ChatMessage = {
          id,
          role: 'tool',
          text: typeof event.summary === 'string' ? event.summary : '',
          ...(at !== undefined ? { timestampMs: at } : {}),
          tool: { name, status: 'running', statusReported: true, callId, input: toolInput(event.action) },
        };
        toolByCallId.set(callId, message);
        messages.push(message);
        break;
      }
      case 'ObservationEvent': {
        const actionId = typeof event.action_id === 'string' ? event.action_id : '';
        const existing = toolByCallId.get(actionId);
        const failed = event.is_error === true
          || (asRecord(event.observation).is_error === true);
        const observation = typeof event.observation === 'string'
          ? event.observation
          : JSON.stringify(event.observation ?? '');
        if (existing && existing.tool) {
          existing.tool = {
            ...existing.tool,
            status: failed ? 'error' : 'success',
            output: event.observation,
            ...(at !== undefined ? { finishedAtMs: at } : {}),
          };
          if (!existing.text) existing.text = failed ? observation : (event.summary as string ?? observation);
        } else {
          messages.push({
            id,
            role: 'tool',
            text: typeof event.summary === 'string' ? event.summary : observation,
            ...(at !== undefined ? { timestampMs: at } : {}),
            tool: { name: 'tool', status: failed ? 'error' : 'success', statusReported: true, callId: actionId || id, output: event.observation },
          });
        }
        break;
      }
      case 'AgentErrorEvent': {
        messages.push({
          id,
          role: 'system',
          text: typeof event.error === 'string' ? event.error : 'The agent reported an error.',
          ...(at !== undefined ? { timestampMs: at } : {}),
        });
        break;
      }
      default:
        break;
    }
  }

  return messages;
}

/** A conversation is running while its newest event belongs to an unfinished agent turn. */
export function cloudHistoryFromEvents(
  key: string,
  events: ReadonlyArray<CloudEvent>,
  options: { executionStatus?: string | null; title?: string | null } = {},
): SessionHistory {
  const messages = mapCloudEvents(events);
  const running = options.executionStatus === 'running';
  return {
    key,
    messages,
    hasActiveRun: running,
  };
}
