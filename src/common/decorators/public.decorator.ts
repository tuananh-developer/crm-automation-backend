import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Decorator to mark routes as publicly accessible, bypassing JWT authentication guard.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
