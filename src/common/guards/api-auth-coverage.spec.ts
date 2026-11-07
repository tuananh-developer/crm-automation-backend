import { DataCleaningController } from '../../modules/data-cleaning/data-cleaning.controller.js';
import { CustomersController } from '../../modules/customers/customers.controller.js';
import { SegmentsController } from '../../modules/customers/segments.controller.js';
import { FollowUpController } from '../../modules/follow-up/follow-up.controller.js';
import { SequencesController } from '../../modules/follow-up/sequences.controller.js';
import { EnrichmentController } from '../../modules/lead-intelligence/enrichment.controller.js';
import { LeadIntelligenceController } from '../../modules/lead-intelligence/lead-intelligence.controller.js';
import { N8nAuthGuard } from '../../modules/lead-intelligence/guards/n8n-auth.guard.js';
import { ScoringController } from '../../modules/lead-intelligence/scoring.controller.js';
import { NotificationsController } from '../../modules/notifications/notifications.controller.js';
import { ReviewController } from '../../modules/review/review.controller.js';
import { LeadSourcesController } from '../../modules/leads/lead-sources.controller.js';
import { LeadsController } from '../../modules/leads/leads.controller.js';
import { UsersController } from '../../modules/users/users.controller.js';
import { NextBestActionsController } from '../../modules/t12-workflows/next-best-actions.controller.js';
import { SalesMeetingsController } from '../../modules/t12-workflows/sales-meetings.controller.js';
import { QuotesController } from '../../modules/t12-workflows/quotes.controller.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { JwtOrN8nAuthGuard } from './jwt-or-n8n-auth.guard.js';
import { RolesGuard } from './roles.guard.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import { UserRole } from '../../modules/users/enums/user.enum.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

const jwtProtectedControllers = [
  LeadsController,
  LeadSourcesController,
  SegmentsController,
  FollowUpController,
  SequencesController,
  ReviewController,
  NotificationsController,
  UsersController,
  NextBestActionsController,
  SalesMeetingsController,
  QuotesController,
] as const;

describe('API authentication guard coverage', () => {
  it.each(jwtProtectedControllers)(
    '%p requires a JWT for its user-facing routes',
    (controller) => {
      const guards = Reflect.getMetadata('__guards__', controller);

      expect(guards).toContain(JwtAuthGuard);
    },
  );

  it('secures CustomersController user-facing browser routes with JwtAuthGuard and hybrid routes with JwtOrN8nAuthGuard', () => {
    const classGuards = Reflect.getMetadata('__guards__', CustomersController);
    expect(classGuards).toBeUndefined();

    const userFacingMethods = ['findAll', 'triggerCustomer360'] as const;
    for (const method of userFacingMethods) {
      const handler = Object.getOwnPropertyDescriptor(
        CustomersController.prototype,
        method,
      )?.value as object;
      const guards = Reflect.getMetadata('__guards__', handler);
      expect(guards).toContain(JwtAuthGuard);
    }

    const hybridMethods = [
      'findOne',
      'getCustomer360',
      'getCustomerInteractions',
      'getCustomerIntelligence',
      'getCustomerFollowUps',
      'getCustomerSegments',
    ] as const;
    for (const method of hybridMethods) {
      const handler = Object.getOwnPropertyDescriptor(
        CustomersController.prototype,
        method,
      )?.value as object;
      const guards = Reflect.getMetadata('__guards__', handler);
      expect(guards).toContain(JwtOrN8nAuthGuard);
    }

    const callbackHandler = Object.getOwnPropertyDescriptor(
      CustomersController.prototype,
      'handleCustomer360Callback',
    )?.value as object;
    const callbackGuards = Reflect.getMetadata('__guards__', callbackHandler);
    expect(callbackGuards).toContain(N8nAuthGuard);
  });

  it.each([
    [DataCleaningController, 'createScan'],
    [DataCleaningController, 'getScan'],
    [DataCleaningController, 'applyCleaning'],
  ] as const)(
    '%p.%s requires JWT authentication for user-facing Data Cleaning routes',
    (controller, method) => {
      const guards = Reflect.getMetadata(
        '__guards__',
        Object.getOwnPropertyDescriptor(controller.prototype, method)
          ?.value as object,
      );
      expect(guards).toContain(JwtAuthGuard);
    },
  );

  it('keeps the internal notification route on N8N auth without requiring a browser JWT', () => {
    const handler = Object.getOwnPropertyDescriptor(
      NotificationsController.prototype,
      'createInternal',
    )?.value as object;

    expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBe(true);
    expect(Reflect.getMetadata('__guards__', handler)).toContain(N8nAuthGuard);
  });

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

  it.each([
    [LeadIntelligenceController, 'getQualifications'],
    [LeadIntelligenceController, 'getLatestQualification'],
    [LeadIntelligenceController, 'getEnrichments'],
    [LeadIntelligenceController, 'getLatestEnrichment'],
    [LeadIntelligenceController, 'mockEnrichment'],
    [EnrichmentController, 'mockEnrichment'],
    [EnrichmentController, 'getEnrichmentsByLead'],
    [EnrichmentController, 'getLatestEnrichment'],
    [ScoringController, 'getScoringContext'],
    [ScoringController, 'getScores'],
    [ScoringController, 'getLatestScore'],
  ] as const)(
    '%p.%s requires JWT authentication for CRM read access',
    (controller, method) => {
      const guards = Reflect.getMetadata(
        '__guards__',
        Object.getOwnPropertyDescriptor(controller.prototype, method)
          ?.value as object,
      );

      expect(guards).toContain(JwtAuthGuard);
    },
  );
});
