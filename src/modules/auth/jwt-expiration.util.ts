export const DEFAULT_JWT_EXPIRES_IN_SECONDS = 86400;
export const MAX_JWT_EXPIRES_IN_SECONDS = 30 * 24 * 60 * 60;

/**
 * Environment variables are strings. Passing "86400" directly to jsonwebtoken
 * means milliseconds, while passing 86400 as a number means seconds.
 */
export function parseJwtExpiresInSeconds(value: string | number | undefined): number {
  if (value === undefined || value === null || value === '') {
    return DEFAULT_JWT_EXPIRES_IN_SECONDS;
  }

  const seconds = typeof value === 'number' ? value : Number(value);
  if (
    !Number.isSafeInteger(seconds) ||
    seconds <= 0 ||
    seconds > MAX_JWT_EXPIRES_IN_SECONDS
  ) {
    throw new Error(
      `JWT_EXPIRES_IN_SECONDS must be an integer between 1 and ${MAX_JWT_EXPIRES_IN_SECONDS}`,
    );
  }
  return seconds;
}
