import { FreshSessions } from './fresh-sessions';

describe('FreshSessions', () => {
  it('reports an untouched new session as abandoned exactly once', () => {
    FreshSessions.mark('c1', 'main', 'new-1');
    expect(FreshSessions.takeAbandoned('c1', 'main', 'new-1', '   ')).toBe(true);
    expect(FreshSessions.takeAbandoned('c1', 'main', 'new-1', '')).toBe(false);
  });

  it('keeps sessions that were written to, acted on, or hold the reader’s own draft', () => {
    FreshSessions.mark('c1', 'main', 'sent');
    FreshSessions.settle('c1', 'main', 'sent');
    expect(FreshSessions.takeAbandoned('c1', 'main', 'sent', '')).toBe(false);

    FreshSessions.mark('c1', 'main', 'drafted');
    expect(FreshSessions.takeAbandoned('c1', 'main', 'drafted', 'Half a thought')).toBe(false);
    // The draft kept it once; a later visit never discards it either.
    expect(FreshSessions.takeAbandoned('c1', 'main', 'drafted', '')).toBe(false);

    expect(FreshSessions.takeAbandoned('c1', 'main', 'never-marked', '')).toBe(false);
  });

  it('treats the app’s own seeded reply as untouched and scopes marks per connection and Agent', () => {
    FreshSessions.mark('c1', 'main', 'reply', 'A useful answer');
    expect(FreshSessions.takeAbandoned('c2', 'main', 'reply', '')).toBe(false);
    expect(FreshSessions.takeAbandoned('c1', 'other', 'reply', '')).toBe(false);
    expect(FreshSessions.takeAbandoned('c1', 'main', 'reply', ' A useful answer ')).toBe(true);
  });
});
