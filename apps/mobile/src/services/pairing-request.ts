import { AdapterError } from '@clawket/agent-protocol';
import { connectionDiagnosticCode, startConnectionDiagnostic, type ConnectionDiagnosticContext } from './connection-diagnostics';

/** Bound the whole claim, including reading the response. Never replay a single-use claim. */
export async function pairingRequest<T>(
  request: (signal: AbortSignal, receivedResponse: (status: number) => void) => Promise<T>,
  context?: ConnectionDiagnosticContext,
): Promise<T> {
  const diagnostic = context ? startConnectionDiagnostic(context) : undefined;
  let phase: 'fetch' | 'body' = 'fetch';
  let http_status: number | undefined;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new AdapterError('timeout', 'Pairing service did not respond in time.'));
      controller.abort();
    }, 15_000);
  });
  try {
    const result = await Promise.race([request(controller.signal, status => {
      phase = 'body';
      http_status = status;
    }), deadline]);
    diagnostic?.finish({ outcome: 'success', phase, http_status });
    return result;
  } catch (error) {
    const code = connectionDiagnosticCode(error);
    diagnostic?.finish({ outcome: code === 'timeout' ? 'timeout' : 'error', phase, http_status, code });
    throw error;
  } finally { clearTimeout(timer); }
}
