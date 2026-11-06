/**
 * Conservative server-side PII minimization for meeting transcripts.
 * This is a deterministic baseline, not a complete DLP system; deployments
 * handling regulated transcripts should add a vetted DLP provider/policy.
 */
export function redactMeetingTranscript(input: string): string {
  return input
    .normalize('NFKC')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
    .replace(/(?:\+?\d[\d .()-]{7,}\d)/g, '[REDACTED_PHONE]')
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED_IDENTIFIER]')
    .replace(/\b\d{9,12}\b/g, '[REDACTED_IDENTIFIER]')
    .trim();
}
