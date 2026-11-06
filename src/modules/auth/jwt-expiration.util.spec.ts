import {
  DEFAULT_JWT_EXPIRES_IN_SECONDS,
  MAX_JWT_EXPIRES_IN_SECONDS,
  parseJwtExpiresInSeconds,
} from './jwt-expiration.util.js';

describe('parseJwtExpiresInSeconds', () => {
  it('uses the documented 24-hour default when unset', () => {
    expect(parseJwtExpiresInSeconds(undefined)).toBe(86400);
    expect(DEFAULT_JWT_EXPIRES_IN_SECONDS).toBe(86400);
  });

  it('parses environment strings as seconds, not milliseconds', () => {
    expect(parseJwtExpiresInSeconds('86400')).toBe(86400);
    expect(parseJwtExpiresInSeconds('3600')).toBe(3600);
  });

  it('accepts a numeric configuration value', () => {
    expect(parseJwtExpiresInSeconds(900)).toBe(900);
  });

  it.each(['abc', '1.5', '0', '-1', String(MAX_JWT_EXPIRES_IN_SECONDS + 1)])(
    'rejects invalid expiration value %s',
    (value) => {
      expect(() => parseJwtExpiresInSeconds(value)).toThrow(
        'JWT_EXPIRES_IN_SECONDS must be an integer',
      );
    },
  );
});
