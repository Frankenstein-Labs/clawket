import {
  humanDuration,
  formatRelativeTime,
  formatCronSchedule,
  formatRunStatusSymbol,
  formatDurationMs,
  formatTimestamp,
  truncateText,
  describeCronExpression,
  describeScheduleHuman,
} from './cron';

describe('humanDuration', () => {
  it('returns 0m for zero/negative/non-finite', () => {
    expect(humanDuration(0)).toBe('0m');
    expect(humanDuration(-100)).toBe('0m');
    expect(humanDuration(NaN)).toBe('0m');
    expect(humanDuration(Infinity)).toBe('0m');
  });

  it('formats exact days', () => {
    expect(humanDuration(86_400_000)).toBe('1d');
    expect(humanDuration(172_800_000)).toBe('2d');
  });

  it('formats exact hours', () => {
    expect(humanDuration(3_600_000)).toBe('1h');
    expect(humanDuration(7_200_000)).toBe('2h');
  });

  it('formats exact minutes', () => {
    expect(humanDuration(60_000)).toBe('1m');
    expect(humanDuration(300_000)).toBe('5m');
  });

  it('formats fractional minutes', () => {
    expect(humanDuration(90_000)).toBe('1.5m');
  });

  it('formats seconds', () => {
    expect(humanDuration(1_000)).toBe('1.0s');
    expect(humanDuration(2_500)).toBe('2.5s');
  });

  it('formats milliseconds', () => {
    expect(humanDuration(500)).toBe('500ms');
    expect(humanDuration(1)).toBe('1ms');
  });
});

describe('formatRelativeTime', () => {
  it('returns dash for non-finite', () => {
    expect(formatRelativeTime(NaN)).toBe('—');
    expect(formatRelativeTime(Infinity)).toBe('—');
  });

  it('returns "just now" for small differences', () => {
    expect(formatRelativeTime(Date.now())).toBe('just now');
    expect(formatRelativeTime(Date.now() - 10_000)).toBe('just now');
  });

  it('returns minutes ago', () => {
    const fiveMinAgo = Date.now() - 5 * 60_000;
    expect(formatRelativeTime(fiveMinAgo)).toBe('5m ago');
  });

  it('returns hours ago', () => {
    const twoHoursAgo = Date.now() - 2 * 3_600_000;
    expect(formatRelativeTime(twoHoursAgo)).toBe('2h ago');
  });

  it('returns days ago', () => {
    const threeDaysAgo = Date.now() - 3 * 86_400_000;
    expect(formatRelativeTime(threeDaysAgo)).toBe('3d ago');
  });

  it('returns future time with "in" prefix', () => {
    const inFiveMin = Date.now() + 5 * 60_000;
    expect(formatRelativeTime(inFiveMin)).toBe('in 5m');
  });
});

describe('formatCronSchedule', () => {
  it('formats "at" schedule', () => {
    const result = formatCronSchedule({ kind: 'at', at: '2024-01-15T10:00:00Z' } as any);
    expect(result).toContain('One-time:');
  });

  it('formats "at" schedule with invalid date', () => {
    const result = formatCronSchedule({ kind: 'at', at: 'not-a-date' } as any);
    expect(result).toBe('One-time: not-a-date');
  });

  it('formats "every" schedule', () => {
    const result = formatCronSchedule({ kind: 'every', everyMs: 3_600_000 } as any);
    expect(result).toBe('Every 1h');
  });

  it('formats cron expression with timezone', () => {
    const result = formatCronSchedule({ kind: 'cron', expr: '0 * * * *', tz: 'UTC' } as any);
    expect(result).toBe('0 * * * * (UTC)');
  });

  it('formats cron expression without timezone', () => {
    const result = formatCronSchedule({ kind: 'cron', expr: '0 * * * *' } as any);
    expect(result).toBe('0 * * * *');
  });
});

describe('formatRunStatusSymbol', () => {
  it('returns correct symbols', () => {
    expect(formatRunStatusSymbol('ok')).toBe('✓');
    expect(formatRunStatusSymbol('error')).toBe('✗');
    expect(formatRunStatusSymbol('skipped')).toBe('⊘');
    expect(formatRunStatusSymbol(undefined)).toBe('—');
  });
});

describe('formatDurationMs', () => {
  it('returns dash for undefined/non-finite', () => {
    expect(formatDurationMs(undefined)).toBe('—');
    expect(formatDurationMs(NaN)).toBe('—');
  });

  it('formats seconds', () => {
    expect(formatDurationMs(1500)).toBe('1.5s');
  });

  it('formats milliseconds', () => {
    expect(formatDurationMs(500)).toBe('500ms');
  });
});

describe('formatTimestamp', () => {
  it('returns dash for undefined/non-finite', () => {
    expect(formatTimestamp(undefined)).toBe('—');
    expect(formatTimestamp(NaN)).toBe('—');
  });

  it('formats valid timestamp', () => {
    const result = formatTimestamp(1705312800000);
    expect(typeof result).toBe('string');
    expect(result).not.toBe('—');
  });
});

describe('truncateText', () => {
  it('returns empty string for empty input', () => {
    expect(truncateText('')).toBe('');
  });

  it('returns original text if under max', () => {
    expect(truncateText('hello', 10)).toBe('hello');
  });

  it('truncates with ellipsis at max', () => {
    const result = truncateText('hello world', 5);
    expect(result).toBe('hello…');
  });

  it('uses default max of 140', () => {
    const short = 'a'.repeat(140);
    expect(truncateText(short)).toBe(short);
    const long = 'a'.repeat(141);
    expect(truncateText(long)).toBe('a'.repeat(140) + '…');
  });
});

describe('describeScheduleHuman', () => {
  // Mock t that simulates i18next: looks up the English translation and interpolates
  const translations: Record<string, string> = {
    'schedule_daily_at': 'Every day at {{time}}',
    'schedule_weekday_at': 'Every {{weekday}} at {{time}}',
    'schedule_every_minute': 'Every minute',
    'schedule_every_n_minutes': 'Every {{count}} minutes',
    'schedule_every_n_hours': 'Every {{count}} hours',
    'schedule_every_n_days': 'Every {{count}} days',
    'schedule_once_at': 'Once: {{datetime}}',
    'weekday_Sun': 'Sun', 'weekday_Mon': 'Mon', 'weekday_Tue': 'Tue',
    'weekday_Wed': 'Wed', 'weekday_Thu': 'Thu', 'weekday_Fri': 'Fri', 'weekday_Sat': 'Sat',
  };
  const t = (key: string, opts?: Record<string, string | number>) => {
    let result = translations[key] ?? key;
    if (opts) {
      for (const [k, v] of Object.entries(opts)) {
        result = result.replace(`{{${k}}}`, String(v));
      }
    }
    return result;
  };

  // --- "at" kind ---
  it('describes one-time schedule', () => {
    const result = describeScheduleHuman({ kind: 'at', at: '2026-03-07T09:00:00.000Z' } as any, t);
    expect(result).toMatch(/^Once:/);
    expect(result).toContain('2026');
  });

  it('returns raw string for invalid at date', () => {
    const result = describeScheduleHuman({ kind: 'at', at: 'not-a-date' } as any, t);
    expect(result).toBe('not-a-date');
  });

  // --- "every" kind ---
  it('describes every N minutes', () => {
    const result = describeScheduleHuman({ kind: 'every', everyMs: 1_800_000 } as any, t);
    expect(result).toBe('Every 30 minutes');
  });

  it('describes every N hours', () => {
    const result = describeScheduleHuman({ kind: 'every', everyMs: 7_200_000 } as any, t);
    expect(result).toBe('Every 2 hours');
  });

  it('describes every N days', () => {
    const result = describeScheduleHuman({ kind: 'every', everyMs: 86_400_000 } as any, t);
    expect(result).toBe('Every 1 days');
  });

  // --- "cron" kind ---
  it('describes daily cron: 0 9 * * *', () => {
    const result = describeScheduleHuman({ kind: 'cron', expr: '0 9 * * *' } as any, t);
    expect(result).toBe('Every day at 09:00');
  });

  it('describes weekly cron: 30 14 * * 1', () => {
    const result = describeScheduleHuman({ kind: 'cron', expr: '30 14 * * 1' } as any, t);
    expect(result).toBe('Every Mon at 14:30');
  });

  it('describes every N minutes cron: */15 * * * *', () => {
    const result = describeScheduleHuman({ kind: 'cron', expr: '*/15 * * * *' } as any, t);
    expect(result).toBe('Every 15 minutes');
  });

  it('describes an on-the-hour step cron in the user language: 0 */2 * * *', () => {
    expect(describeScheduleHuman({ kind: 'cron', expr: '0 */2 * * *' } as any, t)).toBe('Every 2 hours');
    // Hourly and offset-minute steps keep the full description rather than a wrong count.
    expect(describeScheduleHuman({ kind: 'cron', expr: '0 */1 * * *' } as any, t)).not.toBe('Every 1 hours');
    expect(describeScheduleHuman({ kind: 'cron', expr: '15 */2 * * *' } as any, t)).not.toBe('Every 2 hours');
  });

  it('describes every minute cron: * * * * *', () => {
    const result = describeScheduleHuman({ kind: 'cron', expr: '* * * * *' } as any, t);
    expect(result).toBe('Every minute');
  });

  it('describes multi-day cron: 0 9 * * 1,3,5', () => {
    const result = describeScheduleHuman({ kind: 'cron', expr: '0 9 * * 1,3,5' } as any, t);
    expect(result).toBe('Every Mon, Wed, Fri at 09:00');
  });

  it('describes weekday range cron: 0 9 * * 1-5', () => {
    const result = describeScheduleHuman({ kind: 'cron', expr: '0 9 * * 1-5' } as any, t);
    expect(result).toBe('Every Mon\u2013Fri at 09:00');
  });

  it('falls back to English description for complex expressions', () => {
    const result = describeScheduleHuman({ kind: 'cron', expr: '0 0 1 * *' } as any, t);
    expect(result).toContain('00:00');
    expect(result).toContain('day 1');
  });
});

describe('describeCronExpression', () => {
  // Common expressions
  it('describes every minute', () => {
    const r = describeCronExpression('* * * * *');
    expect(r).toEqual({ valid: true, description: 'Every minute' });
  });

  it('describes daily at specific time', () => {
    const r = describeCronExpression('0 9 * * *');
    expect(r).toEqual({ valid: true, description: 'At 09:00, every day' });
  });

  it('describes midnight on day 1 of month', () => {
    const r = describeCronExpression('0 0 1 * *');
    expect(r).toEqual({ valid: true, description: 'At 00:00, on day 1 of every month' });
  });

  it('describes specific months', () => {
    const r = describeCronExpression('0 9 * 1,6 *');
    expect(r).toEqual({ valid: true, description: 'At 09:00, in January and June' });
  });

  it('describes weekday range', () => {
    const r = describeCronExpression('0 9 * * 1-5');
    expect(r).toEqual({ valid: true, description: 'At 09:00, Monday through Friday' });
  });

  // Steps
  it('describes step on minute', () => {
    const r = describeCronExpression('*/15 * * * *');
    expect(r).toEqual({ valid: true, description: 'Every 15 minutes' });
  });

  it('describes step on minute every 5', () => {
    const r = describeCronExpression('*/5 * * * *');
    expect(r).toEqual({ valid: true, description: 'Every 5 minutes' });
  });

  // Lists
  it('describes hour list', () => {
    const r = describeCronExpression('30 8,12 * * *');
    expect(r).toEqual({ valid: true, description: 'At minute 30, at 08 and 12, every day' });
  });

  it('describes dow list', () => {
    const r = describeCronExpression('0 9 * * 1,3,5');
    expect(r).toEqual({ valid: true, description: 'At 09:00, Monday and Wednesday and Friday' });
  });

  // Ranges
  it('describes dom range', () => {
    const r = describeCronExpression('0 6 1-15 * *');
    expect(r).toEqual({ valid: true, description: 'At 06:00, on days 1 through 15 of every month' });
  });

  it('describes month range', () => {
    const r = describeCronExpression('0 12 * 3-6 *');
    expect(r).toEqual({ valid: true, description: 'At 12:00, March through June' });
  });

  // Step on range
  it('describes step on range for minutes', () => {
    const r = describeCronExpression('0-30/10 * * * *');
    expect(r.valid).toBe(true);
    expect(r.description).toContain('10');
    expect(r.description).toContain('0 through 30');
  });

  // Edge cases
  it('handles extra whitespace', () => {
    const r = describeCronExpression('  0  9  *  *  *  ');
    expect(r).toEqual({ valid: true, description: 'At 09:00, every day' });
  });

  it('accepts 7 as Sunday', () => {
    const r = describeCronExpression('0 9 * * 7');
    expect(r).toEqual({ valid: true, description: 'At 09:00, Sunday' });
  });

  // Validation errors
  it('rejects wrong number of fields', () => {
    expect(describeCronExpression('0 9 *')).toEqual({
      valid: false,
      description: 'Expected 5 fields, got 3',
    });
    expect(describeCronExpression('0 9 * * * *')).toEqual({
      valid: false,
      description: 'Expected 5 fields, got 6',
    });
  });

  it('rejects out-of-range minute', () => {
    const r = describeCronExpression('60 * * * *');
    expect(r.valid).toBe(false);
    expect(r.description).toContain('Minute');
  });

  it('rejects out-of-range hour', () => {
    const r = describeCronExpression('0 25 * * *');
    expect(r.valid).toBe(false);
    expect(r.description).toContain('Hour');
  });

  it('rejects invalid characters', () => {
    const r = describeCronExpression('blah * * * *');
    expect(r.valid).toBe(false);
  });

  it('rejects single invalid token', () => {
    const r = describeCronExpression('blah');
    expect(r.valid).toBe(false);
    expect(r.description).toBe('Expected 5 fields, got 1');
  });

  it('rejects out-of-range month', () => {
    const r = describeCronExpression('0 0 * 13 *');
    expect(r.valid).toBe(false);
    expect(r.description).toContain('Month');
  });

  it('rejects out-of-range day-of-month', () => {
    const r = describeCronExpression('0 0 32 * *');
    expect(r.valid).toBe(false);
    expect(r.description).toContain('Day-of-month');
  });

  it('rejects out-of-range day-of-week', () => {
    const r = describeCronExpression('0 0 * * 8');
    expect(r.valid).toBe(false);
    expect(r.description).toContain('Day-of-week');
  });
});
