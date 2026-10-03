export type AdapterErrorCode =
  | 'unauthorized'
  | 'pairing_required'
  | 'pairing_expired'
  | 'bridge_offline'
  | 'gateway_offline'
  | 'network'
  | 'timeout'
  | 'rate_limited'
  | 'frame_too_large'
  | 'unsupported'
  | 'server';

export class AdapterError extends Error {
  public readonly code: AdapterErrorCode;
  /** Only an explicitly classified pre-dispatch rejection may request this recovery. */
  public readonly recoveryAction?: 'confirm_permissions';

  public constructor(code: AdapterErrorCode, message: string, recoveryAction?: 'confirm_permissions') {
    super(message);
    this.name = 'AdapterError';
    this.code = code;
    this.recoveryAction = recoveryAction;
  }
}

/** A local adapter proved its frame was refused before any socket send. Remote codes are not this proof. */
export class LocalSendRejectedError extends AdapterError {
  public readonly dispatchOutcome = 'not_sent';

  public constructor() {
    super('frame_too_large', 'frame_too_large');
    this.name = 'LocalSendRejectedError';
  }
}
