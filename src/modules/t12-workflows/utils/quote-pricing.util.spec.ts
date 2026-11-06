import { calculateQuotePrice } from './quote-pricing.util.js';

describe('calculateQuotePrice', () => {
  it('calculates server-side subtotal and tax using catalog snapshots', () => {
    const result = calculateQuotePrice(
      [
        {
          catalogItemId: 'item-1',
          sku: 'A',
          name: 'A',
          description: null,
          quantity: 2,
          unitPrice: '100.00',
          taxRatePercent: '10.00',
        },
      ],
      'USD',
      0,
    );
    expect(result.subtotal).toBe('200.00');
    expect(result.taxTotal).toBe('20.00');
    expect(result.totalAmount).toBe('220.00');
    expect(result.approvalRequired).toBe(true);
  });

  it('rejects non-integer quantities and negative price values', () => {
    expect(() =>
      calculateQuotePrice(
        [
          {
            catalogItemId: 'x',
            sku: 'X',
            name: 'X',
            description: null,
            quantity: 1.5,
            unitPrice: 10,
            taxRatePercent: 0,
          },
        ],
        'VND',
        0,
      ),
    ).toThrow();
  });
});
