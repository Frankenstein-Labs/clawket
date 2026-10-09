import { cloudHistoryFromEvents, mapCloudEvents } from './cloud-events';
import type { CloudEvent } from './cloud-client';

describe('mapCloudEvents', () => {
  test('projects user and assistant messages with timestamps', () => {
    const messages = mapCloudEvents([
      { id: 'e1', kind: 'MessageEvent', timestamp: '2026-01-01T00:00:00Z', llm_message: { role: 'user', content: [{ type: 'text', text: 'Hi' }] } },
      { id: 'e2', kind: 'MessageEvent', timestamp: '2026-01-01T00:00:05Z', llm_message: { role: 'assistant', content: [{ type: 'text', text: 'Hello' }] } },
    ] as CloudEvent[]);

    expect(messages).toEqual([
      { id: 'e1', role: 'user', text: 'Hi', timestampMs: Date.parse('2026-01-01T00:00:00Z') },
      { id: 'e2', role: 'assistant', text: 'Hello', timestampMs: Date.parse('2026-01-01T00:00:05Z') },
    ]);
  });

  test('pairs an ActionEvent with its ObservationEvent into one settled tool message', () => {
    const messages = mapCloudEvents([
      { id: 'a1', kind: 'ActionEvent', tool_call_id: 'call-1', tool_name: 'terminal', action: { command: 'ls' } },
      { id: 'o1', kind: 'ObservationEvent', action_id: 'call-1', observation: 'file.txt' },
    ] as CloudEvent[]);

    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('tool');
    expect(messages[0].tool).toMatchObject({ name: 'terminal', status: 'success', callId: 'call-1', output: 'file.txt' });
  });

  test('marks a failed observation as an error', () => {
    const messages = mapCloudEvents([
      { id: 'a1', kind: 'ActionEvent', tool_call_id: 'c', tool_name: 'bash', action: {} },
      { id: 'o1', kind: 'ObservationEvent', action_id: 'c', is_error: true, observation: 'boom' },
    ] as CloudEvent[]);

    expect(messages[0].tool?.status).toBe('error');
  });

  test('ignores unknown kinds and empty messages', () => {
    const messages = mapCloudEvents([
      { id: 'e2', kind: 'SystemPromptEvent' },
      { id: 'e3', kind: 'MessageEvent', llm_message: { role: 'assistant', content: [] } },
    ] as CloudEvent[]);

    expect(messages).toEqual([]);
  });
});

describe('cloudHistoryFromEvents', () => {
  test('reports an active run only while the execution status is running', () => {
    const running = cloudHistoryFromEvents('c1', [], { executionStatus: 'running' });
    expect(running).toMatchObject({ key: 'c1', hasActiveRun: true, messages: [] });

    const idle = cloudHistoryFromEvents('c1', [], { executionStatus: 'idle' });
    expect(idle.hasActiveRun).toBe(false);
  });
});
