export function stableJson(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (input instanceof Date) return input.toISOString();
    if (Array.isArray(input)) return input.map(normalize);
    if (input !== null && typeof input === 'object') {
      const record = input as Record<string, unknown>;
      return Object.fromEntries(Object.keys(record).sort().map((key) => [key, normalize(record[key])]));
    }
    return input;
  };
  return JSON.stringify(normalize(value));
}

export function hasSamePayload(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right);
}

export function isPostgresUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const value = error as { code?: unknown; driverError?: { code?: unknown } };
  return value.code === '23505' || value.driverError?.code === '23505';
}
