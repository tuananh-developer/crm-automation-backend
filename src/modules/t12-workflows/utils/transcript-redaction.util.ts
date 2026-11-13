/**
 * Deterministic PII minimization for meeting transcripts before persistence or
 * external AI processing. This is defense-in-depth, not a complete DLP system:
 * names without identifying context and arbitrary sensitive prose may remain.
 * Production external processing therefore also requires an explicit policy flag.
 */
export function redactMeetingTranscript(input: string): string {
  return input
    .normalize('NFKC')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
    .replace(
      /(api[_ -]?key|access[_ -]?token|refresh[_ -]?token|password|passwd|secret|mật khẩu)\s*[:=]\s*["']?[^\s,"';]+/giu,
      '$1=[REDACTED_SECRET]',
    )
    .replace(/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]){11,30}\b/giu, '[REDACTED_IDENTIFIER]')
    .replace(
      /\b(?:bank\s+account|account(?:\s+(?:number|no\.?))?|acct|routing(?:\s+number)?|số\s+tài\s+khoản|stk)\s*[:#-]?\s*(?:[A-Z]{2}\d{2}[A-Z0-9 ]{10,30}|(?:\d[ -]?){7,34})/giu,
      '[REDACTED_IDENTIFIER]',
    )
    .replace(/(?:\+?\d[\d .()-]{7,}\d)/g, '[REDACTED_PHONE]')
    .replace(/(?<!\d)(?:\d[ -]?){8,34}(?!\d)/g, '[REDACTED_IDENTIFIER]')
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED_IDENTIFIER]')
    .replace(
      /\b(?:mr|mrs|ms|dr|prof|anh|chị|ông|bà|cô|chú|bác)\.?\s+[\p{Lu}][\p{L}'’.-]*(?:\s+[\p{Lu}][\p{L}'’.-]*){1,3}/giu,
      '[REDACTED_PERSON]',
    )
    .replace(
      /((?:full\s+name|customer\s+name|contact(?:\s+person)?|attendee|name|họ\s+tên|tên\s+khách\s+hàng|người\s+liên\s+hệ)\s*[:=]\s*)[\p{Lu}][\p{L}'’.-]*(?:\s+[\p{Lu}][\p{L}'’.-]*){1,3}/giu,
      '$1[REDACTED_PERSON]',
    )
    .replace(
      /((?:residential\s+address|office\s+address|address|địa\s+chỉ|nơi\s+ở)\s*[:=]?\s*)[^\n,;.!?]{4,100}(?:,\s*[^\n,;.!?]{2,60})?/giu,
      '$1[REDACTED_ADDRESS]',
    )
    .replace(
      /\b\d{1,6}\s+[\p{L}\d.'-]+(?:\s+[\p{L}\d.'-]+){0,4}\s+(?:street|st\.?|road|rd\.?|avenue|ave\.?|lane|ln\.?|boulevard|blvd\.?)\b[^,\n;]*/giu,
      '[REDACTED_ADDRESS]',
    )
    .replace(
      /(?:số\s+\d{1,6}\s*,?\s*)?(?:đường|phố|ngõ|hẻm)\s+[\p{L}\d .'-]{2,60}/giu,
      '[REDACTED_ADDRESS]',
    )
    .trim();
}
