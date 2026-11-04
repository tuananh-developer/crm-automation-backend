import { ROLES_KEY } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { UserRole } from './enums/user.enum.js';
import { UsersController } from './users.controller.js';

describe('UsersController access policy', () => {
  it('keeps JWT authentication and applies the roles guard', () => {
    const guards = Reflect.getMetadata(
      '__guards__',
      UsersController,
    ) as unknown[];
    expect(guards).toEqual(expect.arrayContaining([JwtAuthGuard, RolesGuard]));
  });

  it('restricts every administrative endpoint to Admin', () => {
    for (const method of [
      'findAll',
      'findOne',
      'create',
      'update',
      'disable',
    ]) {
      const handler = Object.getOwnPropertyDescriptor(
        UsersController.prototype,
        method,
      )?.value as object;
      expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([UserRole.ADMIN]);
    }
  });

  it('keeps the assignee directory available to any authenticated role', () => {
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        Object.getOwnPropertyDescriptor(
          UsersController.prototype,
          'findAssignees',
        )?.value as object,
      ),
    ).toBeUndefined();
  });
});
