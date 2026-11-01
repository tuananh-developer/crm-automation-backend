import { redactMeetingTranscript } from './transcript-redaction.util.js';

describe('redactMeetingTranscript', () => {
  it('redacts email and phone-like values before persistence/provider calls', () => {
    const result = redactMeetingTranscript(
      'Contact me at sales@example.com or +84 912 345 678 today.',
    );
    expect(result).toContain('[REDACTED_EMAIL]');
    expect(result).toContain('[REDACTED_PHONE]');
    expect(result).not.toContain('sales@example.com');
  });

  it('normalizes Unicode and trims the transcript', () => {
    expect(redactMeetingTranscript('  ＡＢＣ  ')).toBe('ABC');
  });
});
