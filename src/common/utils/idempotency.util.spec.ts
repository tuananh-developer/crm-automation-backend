import { hasSamePayload, isPostgresUniqueViolation } from './idempotency.util.js';

describe('idempotency utilities', () => {
  it('compares object payloads independent of key order', () => {
    expect(hasSamePayload({ a: 1, nested: { b: 2 } }, { nested: { b: 2 }, a: 1 })).toBe(true);
  });
  it('keeps array order significant', () => {
    expect(hasSamePayload({ ids: ['a', 'b'] }, { ids: ['b', 'a'] })).toBe(false);
  });
  it('recognizes PostgreSQL unique violations from TypeORM', () => {
    expect(isPostgresUniqueViolation({ driverError: { code: '23505' } })).toBe(true);
    expect(isPostgresUniqueViolation({ code: '23503' })).toBe(false);
  });
});
