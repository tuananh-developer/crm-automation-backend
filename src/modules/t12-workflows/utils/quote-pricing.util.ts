export interface PriceInputLine {
  catalogItemId: string;
  sku: string;
  name: string;
  description: string | null;
  quantity: number;
  unitPrice: string | number;
  taxRatePercent: string | number;
}

export interface PricedLine extends PriceInputLine {
  lineSubtotal: string;
  lineDiscount: string;
  lineTax: string;
  lineTotal: string;
}

export interface PriceResult {
  currency: string;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  totalAmount: string;
  approvalRequired: boolean;
  items: PricedLine[];
}

function toCents(value: string | number): number {
  const amount = Number(value);
  if (
    !Number.isFinite(amount) ||
    amount < 0 ||
    !Number.isSafeInteger(Math.round(amount * 100))
  ) {
    throw new Error('Invalid monetary amount');
  }
  return Math.round(amount * 100);
}

function money(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function calculateQuotePrice(
  lines: PriceInputLine[],
  currency: string,
  approvalThreshold: number,
): PriceResult {
  if (!lines.length) throw new Error('At least one quote line is required');
  if (!Number.isFinite(approvalThreshold) || approvalThreshold < 0) {
    throw new Error('Invalid quote approval threshold');
  }

  let subtotalCents = 0;
  let taxCents = 0;
  const items = lines.map((line) => {
    if (
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > 10000
    ) {
      throw new Error('Quote quantity must be an integer between 1 and 10000');
    }
    const unitCents = toCents(line.unitPrice);
    const taxRate = Number(line.taxRatePercent);
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
      throw new Error('Catalog tax rate must be between 0 and 100');
    }
    const lineSubtotalCents = unitCents * line.quantity;
    if (!Number.isSafeInteger(lineSubtotalCents))
      throw new Error('Quote line exceeds supported monetary range');
    const lineTaxCents = Math.round((lineSubtotalCents * taxRate) / 100);
    const lineTotalCents = lineSubtotalCents + lineTaxCents;
    subtotalCents += lineSubtotalCents;
    taxCents += lineTaxCents;
    return {
      ...line,
      lineSubtotal: money(lineSubtotalCents),
      lineDiscount: '0.00',
      lineTax: money(lineTaxCents),
      lineTotal: money(lineTotalCents),
    };
  });
  const totalCents = subtotalCents + taxCents;
  const totalAmount = totalCents / 100;
  return {
    currency,
    subtotal: money(subtotalCents),
    discountTotal: '0.00',
    taxTotal: money(taxCents),
    totalAmount: money(totalCents),
    // Safe v1 default: require approval unless an explicit positive threshold is configured.
    approvalRequired:
      approvalThreshold <= 0 || totalAmount >= approvalThreshold,
    items,
  };
}
