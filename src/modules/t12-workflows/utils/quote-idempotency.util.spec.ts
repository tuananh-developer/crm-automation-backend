import { hasSameQuoteDraftPayload } from './quote-idempotency.util.js';

describe('hasSameQuoteDraftPayload', () => {
  const existingQuote = {
    title: 'CRM proposal',
    executiveSummary: 'Reduce manual follow-up.',
    body: 'A detailed implementation proposal.',
    currency: 'VND',
  };
  const existingItems = [
    { catalogItemId: 'catalog-a', quantity: 2 },
    { catalogItemId: 'catalog-b', quantity: 1 },
  ];
  const incoming = {
    title: 'CRM proposal',
    executiveSummary: 'Reduce manual follow-up.',
    body: 'A detailed implementation proposal.',
    currency: 'vnd',
    items: [
      { catalogItemId: 'catalog-b', quantity: 1 },
      { catalogItemId: 'catalog-a', quantity: 2 },
    ],
  };

  it('treats item ordering and currency casing as semantically equivalent', () => {
    expect(
      hasSameQuoteDraftPayload(existingQuote, existingItems, incoming),
    ).toBe(true);
  });

  it.each([
    ['title', { ...incoming, title: 'Different title' }],
    ['summary', { ...incoming, executiveSummary: 'Different summary' }],
    ['body', { ...incoming, body: 'Different body' }],
    ['currency', { ...incoming, currency: 'USD' }],
    [
      'item quantity',
      {
        ...incoming,
        items: [
          { catalogItemId: 'catalog-b', quantity: 1 },
          { catalogItemId: 'catalog-a', quantity: 3 },
        ],
      },
    ],
    [
      'catalog item',
      {
        ...incoming,
        items: [
          { catalogItemId: 'catalog-b', quantity: 1 },
          { catalogItemId: 'catalog-c', quantity: 2 },
        ],
      },
    ],
  ])('detects a changed %s', (_field, changed) => {
    expect(
      hasSameQuoteDraftPayload(existingQuote, existingItems, changed),
    ).toBe(false);
  });

  it('normalizes omitted optional text fields to null', () => {
    expect(
      hasSameQuoteDraftPayload(
        { ...existingQuote, executiveSummary: null, body: null },
        existingItems,
        {
          title: existingQuote.title,
          currency: existingQuote.currency,
          items: incoming.items,
        },
      ),
    ).toBe(true);
  });
});
