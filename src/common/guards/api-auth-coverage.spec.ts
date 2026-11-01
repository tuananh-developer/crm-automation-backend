import { DataCleaningController } from '../../modules/data-cleaning/data-cleaning.controller.js';
import { CustomersController } from '../../modules/customers/customers.controller.js';
import { SegmentsController } from '../../modules/customers/segments.controller.js';
import { EnrichmentController } from '../../modules/lead-intelligence/enrichment.controller.js';
import { LeadIntelligenceController } from '../../modules/lead-intelligence/lead-intelligence.controller.js';
import { N8nAuthGuard } from '../../modules/lead-intelligence/guards/n8n-auth.guard.js';
import { ScoringController } from '../../modules/lead-intelligence/scoring.controller.js';
import { LeadSourcesController } from '../../modules/leads/lead-sources.controller.js';
import { LeadsController } from '../../modules/leads/leads.controller.js';
import { UsersController } from '../../modules/users/users.controller.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { RolesGuard } from './roles.guard.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import { UserRole } from '../../modules/users/enums/user.enum.js';

const jwtProtectedControllers = [
  LeadsController,
  LeadSourcesController,
  CustomersController,
  SegmentsController,
  UsersController,
] as const;

describe('API authentication guard coverage', () => {
  it.each(jwtProtectedControllers)(
    '%p requires a JWT for its user-facing routes',
    (controller) => {
      const guards = Reflect.getMetadata('__guards__', controller);

      expect(guards).toContain(JwtAuthGuard);
    },
  );

  it('restricts lead source creation to Admin while keeping source reads authenticated', () => {
    const createHandler = Object.getOwnPropertyDescriptor(
      LeadSourcesController.prototype,
      'create',
    )?.value as object;
    const sourceRoles = Reflect.getMetadata(ROLES_KEY, createHandler);
    const methodGuards = Reflect.getMetadata('__guards__', createHandler);

    expect(sourceRoles).toEqual([UserRole.ADMIN]);
    expect(methodGuards).toContain(RolesGuard);
    expect(
      Reflect.getMetadata(
        '__guards__',
        Object.getOwnPropertyDescriptor(
          LeadSourcesController.prototype,
          'findAll',
        )?.value as object,
      ),
    ).toBeUndefined();
  });

  it('restricts shared segment deletion to Admin', () => {
    const removeHandler = Object.getOwnPropertyDescriptor(
      SegmentsController.prototype,
      'remove',
    )?.value as object;

    expect(Reflect.getMetadata(ROLES_KEY, removeHandler)).toEqual([
      UserRole.ADMIN,
    ]);
    expect(Reflect.getMetadata('__guards__', removeHandler)).toContain(
      RolesGuard,
    );
  });

  it.each([
    [LeadIntelligenceController, 'handleCallback'],
    [EnrichmentController, 'handleCallback'],
    [ScoringController, 'handleCallback'],
    [DataCleaningController, 'getLeadsForScan'],
    [DataCleaningController, 'handleCallback'],
  ] as const)(
    '%p.%s remains protected by the n8n service guard',
    (controller, method) => {
      const guards = Reflect.getMetadata(
        '__guards__',
        Object.getOwnPropertyDescriptor(controller.prototype, method)
          ?.value as object,
      );

      expect(guards).toContain(N8nAuthGuard);
    },
  );
});
