import type { User } from '../entities/user.entity.js';

export type SafeUser = Omit<User, 'passwordHash'>;
