import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '../../modules/users/enums/user.enum.js';

export const ROLES_KEY = 'roles';

/**
 * Decorator to enforce Role-Based Access Control on controller classes or routes.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
