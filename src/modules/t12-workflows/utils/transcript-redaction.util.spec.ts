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

  it('redacts names when introduced by an honorific or an identity label', () => {
    const result = redactMeetingTranscript(
      'Anh Tran Minh Khoa called. Contact: Nguyen Van An will review the proposal.',
    );

    expect(result).toContain('[REDACTED_PERSON]');
    expect(result).not.toContain('Tran Minh Khoa');
    expect(result).not.toContain('Nguyen Van An');
  });

  it('redacts address, account-number and credential patterns', () => {
    const result = redactMeetingTranscript(
      'Address: 12 Nguyen Trai Street, District 1; account number: 123456789012; api_key=sk_live_sensitive',
    );

    expect(result).toContain('[REDACTED_ADDRESS]');
    expect(result).toContain('[REDACTED_IDENTIFIER]');
    expect(result).toContain('[REDACTED_SECRET]');
    expect(result).not.toContain('Nguyen Trai');
    expect(result).not.toContain('123456789012');
    expect(result).not.toContain('sk_live_sensitive');
  });

  it('normalizes Unicode and trims the transcript', () => {
    expect(redactMeetingTranscript('  ＡＢＣ  ')).toBe('ABC');
  });
});
