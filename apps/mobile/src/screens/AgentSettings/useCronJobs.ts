import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AgentAdapter, AgentDescriptor, CronJob } from '@clawket/agent-protocol';
import { loadAgentCronJobs } from './cron-model';

// In-memory, adapter- and Agent-scoped cache for native stack navigation/offline reads.
const cache = new WeakMap<AgentAdapter, Map<string, ReadonlyArray<CronJob>>>();

type AgentScope = Pick<AgentDescriptor, 'connectionId' | 'agentId'>;
// A job the editor just created, consumed once by that Agent's list when it regains focus: the
// list opens its job definitions with the new row first and marked (owner decision 2026-09-27).
const createdJobs = new Map<string, string>();

export function markCronJobCreated(agent: AgentScope, jobId: string): void {
  createdJobs.set(`${agent.connectionId}:${agent.agentId}`, jobId);
}

export function takeCreatedCronJob(agent: AgentScope): string | null {
  const key = `${agent.connectionId}:${agent.agentId}`;
  const jobId = createdJobs.get(key) ?? null;
  createdJobs.delete(key);
  return jobId;
}

export function useCronJobs(adapter: AgentAdapter, agent: AgentDescriptor, online: boolean, refreshKey = 0) {
  const key = `${agent.connectionId}:${agent.agentId}`;
  const scope = useMemo(() => ({}), [adapter, key]);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const mounted = useRef(true);
  const generation = useRef(0);
  const leadingJobId = useRef<string | null>(null);
  const [jobs, setJobs] = useState<ReadonlyArray<CronJob> | null>(() => cache.get(adapter)?.get(key) ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const isCurrent = useCallback(() => mounted.current && currentScope.current === scope, [scope]);
  const publish = useCallback((next: ReadonlyArray<CronJob>) => {
    if (!isCurrent()) return;
    let values = cache.get(adapter);
    if (!values) { values = new Map(); cache.set(adapter, values); }
    values.set(key, next);
    setJobs(next);
  }, [adapter, isCurrent, key]);
  const invalidate = useCallback(() => { generation.current++; if (isCurrent()) setLoading(false); }, [isCurrent]);
  const reload = useCallback(async () => {
    if (!isCurrent()) return;
    const cached = cache.get(adapter)?.get(key);
    if (cached) setJobs(cached);
    if (!online) return;
    const request = ++generation.current;
    setLoading(true);
    try {
      const result = await loadAgentCronJobs(adapter.management?.cron, agent);
      if (!isCurrent() || generation.current !== request) return;
      // Preserve the visible order across refreshes and status mutations.
      const previous = cache.get(adapter)?.get(key) ?? [];
      const positions = new Map(previous.map((job, index) => [job.id, index]));
      const rank = (job: CronJob) => job.id === leadingJobId.current ? -1 : positions.get(job.id) ?? Number.MAX_SAFE_INTEGER;
      publish([...result].sort((a, b) => rank(a) - rank(b)));
      setError(null);
    } catch (reason) {
      if (isCurrent() && generation.current === request) setError(reason);
    } finally {
      if (isCurrent() && generation.current === request) setLoading(false);
    }
  }, [adapter, agent, isCurrent, key, online, publish]);
  useEffect(() => {
    mounted.current = true;
    setJobs(cache.get(adapter)?.get(key) ?? null);
    setError(null);
    return () => { mounted.current = false; generation.current++; };
  }, [adapter, key, scope]);
  useEffect(() => { void reload(); }, [reload, refreshKey]);
  const accept = useCallback((job: CronJob) => {
    if (!isCurrent()) return;
    invalidate();
    const existing = cache.get(adapter)?.get(key) ?? [];
    publish(existing.some(value => value.id === job.id) ? existing.map(value => value.id === job.id ? job : value) : [...existing, job]);
    setLoading(false);
  }, [adapter, invalidate, isCurrent, key, publish]);
  const remove = useCallback((id: string) => {
    if (!isCurrent()) return;
    invalidate();
    publish((cache.get(adapter)?.get(key) ?? []).filter(job => job.id !== id));
    setLoading(false);
  }, [adapter, invalidate, isCurrent, key, publish]);
  /** Moves a just-created job to the top and keeps it there across later refreshes. */
  const lead = useCallback((id: string) => {
    if (!isCurrent()) return;
    leadingJobId.current = id;
    const existing = cache.get(adapter)?.get(key) ?? [];
    const job = existing.find(value => value.id === id);
    if (job) publish([job, ...existing.filter(value => value.id !== id)]);
  }, [adapter, isCurrent, key, publish]);
  return { jobs, loading, error, reload, accept, remove, invalidate, isCurrent, lead };
}
