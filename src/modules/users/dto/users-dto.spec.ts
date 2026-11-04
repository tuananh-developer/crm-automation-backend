import { validate } from 'class-validator';
import { CreateUserDto } from './create-user.dto.js';
import { UpdateUserDto } from './update-user.dto.js';
import { UserRole, UserStatus } from '../enums/user.enum.js';

describe('User administration DTO validation', () => {
  it('rejects malformed email, short password, and unknown role', async () => {
    const dto = Object.assign(new CreateUserDto(), {
      name: 'User',
      email: 'bad',
      password: 'short',
      role: 'ROOT',
    });
    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['email', 'password', 'role']),
    );
  });

  it('rejects a blank name after trimming whitespace', async () => {
    const dto = Object.assign(new CreateUserDto(), {
      name: '   ',
      email: 'valid@example.test',
      password: 'long-enough-password',
      role: UserRole.SALES,
    });
    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toContain('name');
  });

  it('accepts supported account role and status values', async () => {
    const dto = Object.assign(new UpdateUserDto(), {
      role: UserRole.SALES,
      status: UserStatus.LOCKED,
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
  });
});
