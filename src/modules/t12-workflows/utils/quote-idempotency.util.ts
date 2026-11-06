import { hasSamePayload } from '../../../common/utils/idempotency.util.js';

type ExistingQuote = {
  title: string;
  executiveSummary: string | null;
  body: string | null;
  currency: string;
};

type ExistingQuoteItem = {
  catalogItemId: string | null;
  quantity: number;
};

type IncomingQuoteDraft = {
  title: string;
  executiveSummary?: string | null;
  body?: string | null;
  currency: string;
  items: Array<{
    catalogItemId: string;
    quantity: number;
  }>;
};

function normalizeItems(items: ExistingQuoteItem[]) {
  return items
    .map(({ catalogItemId, quantity }) => ({ catalogItemId, quantity }))
    .sort(
      (left, right) =>
        String(left.catalogItemId).localeCompare(String(right.catalogItemId)) ||
        left.quantity - right.quantity,
    );
}

/**
 * Compare the semantic AI-generated draft, not live catalog prices. The
 * catalog may legitimately change after the first successful save; retrying
 * the same generated draft must reuse the persisted price snapshot, while a
 * different draft for the same WorkflowRun must be rejected.
 */
export function hasSameQuoteDraftPayload(
  existingQuote: ExistingQuote,
  existingItems: ExistingQuoteItem[],
  incoming: IncomingQuoteDraft,
): boolean {
  return hasSamePayload(
    {
      title: existingQuote.title,
      executiveSummary: existingQuote.executiveSummary ?? null,
      body: existingQuote.body ?? null,
      currency: existingQuote.currency.toUpperCase(),
      items: normalizeItems(existingItems),
    },
    {
      title: incoming.title,
      executiveSummary: incoming.executiveSummary ?? null,
      body: incoming.body ?? null,
      currency: incoming.currency.trim().toUpperCase(),
      items: normalizeItems(incoming.items),
    },
  );
}
