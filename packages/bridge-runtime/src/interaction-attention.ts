import type { SessionDescriptor, SessionUpdate } from '@clawket/agent-protocol';

/** Display state only. Native interaction stores remain the authority for consent. */
export class InteractionAttention {
  private questions = new Map<string, Set<string>>();
  private approvals = new Map<string, string>();

  get(key: string): SessionDescriptor['attention'] {
    if ([...this.approvals.values()].includes(key)) return 'approval';
    return this.questions.get(key)?.size ? 'input' : null;
  }

  accept(update: SessionUpdate): SessionUpdate | undefined {
    if (update.type !== 'question_requested' && update.type !== 'question_resolved'
      && update.type !== 'approval_requested' && update.type !== 'approval_resolved' && update.type !== 'run_finished') return;
    const key = update.type === 'approval_resolved' ? this.approvals.get(update.approvalId)
      : 'sessionKey' in update ? update.sessionKey : undefined;
    if (!key) return;
    const previous = this.get(key);
    if (update.type === 'question_requested') {
      const pending = this.questions.get(key) ?? new Set<string>();
      pending.add(update.question.id);
      this.questions.set(key, pending);
    } else if (update.type === 'question_resolved') {
      const pending = this.questions.get(key);
      pending?.delete(update.questionId);
      if (!pending?.size) this.questions.delete(key);
    } else if (update.type === 'approval_requested' && update.sessionKey && update.approval.kind === 'exec') {
      this.approvals.set(update.approval.id, key);
    } else if (update.type === 'approval_resolved') {
      this.approvals.delete(update.approvalId);
    } else if (update.type === 'run_finished') {
      this.questions.delete(key);
      for (const [id, owner] of this.approvals) if (owner === key) this.approvals.delete(id);
    }
    const attention = this.get(key);
    return attention !== previous ? { type: 'session_info_update', session: { key, attention } } : undefined;
  }
}
