import { User } from '../../users/entities/user.entity';

export function stripUserHash(
  user: User | null | undefined,
): User | null | undefined {
  if (!user) {
    return user;
  }

  const { passwordHash, ...safeUser } = user;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _ = passwordHash; // suppress unused variable warning
  return safeUser as User;
}
