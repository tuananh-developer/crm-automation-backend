import { DataCleaningController } from './data-cleaning.controller.js';
import type { DataCleaningService } from './data-cleaning.service.js';
import { WorkflowStatus } from '../workflow/enums/workflow.enum.js';
import type {
  CreateScanDto,
  DataCleaningCallbackDto,
  ApplyCleaningDto,
} from './dto/index.js';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';
import { UserRole, UserStatus } from '../users/enums/user.enum.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { N8nAuthGuard } from '../lead-intelligence/guards/n8n-auth.guard.js';

describe('DataCleaningController', () => {
  let controller: DataCleaningController;
  let service: jest.Mocked<Partial<DataCleaningService>>;

  beforeEach(() => {
    service = {
      createScan: jest.fn(),
      getScan: jest.fn(),
      getLeadsForScan: jest.fn(),
      handleCallback: jest.fn(),
      applyCleaning: jest.fn(),
    };

    controller = new DataCleaningController(service as DataCleaningService);
  });

  describe('createScan', () => {
    it('should call service.createScan with dto', async () => {
      const dto: CreateScanDto = { scope: 'ALL' };
      const expectedResponse = {
        workflowRunId: 'wf-123',
        status: WorkflowStatus.PENDING,
        message: 'Scan initiated',
      };
      (service.createScan as jest.Mock).mockResolvedValueOnce(expectedResponse);

      const res = await controller.createScan(dto);
      expect(service.createScan).toHaveBeenCalledWith(dto);
      expect(res).toBe(expectedResponse);
    });
  });

  describe('getScan', () => {
    it('should call service.getScan with workflowRunId', async () => {
      const expectedResponse = {
        workflowRunId: 'wf-123',
        status: WorkflowStatus.SUCCESS,
        findings: [],
      };
      (service.getScan as jest.Mock).mockResolvedValueOnce(expectedResponse);

      const res = await controller.getScan('wf-123');
      expect(service.getScan).toHaveBeenCalledWith('wf-123');
      expect(res).toBe(expectedResponse);
    });
  });

  describe('getLeadsForScan', () => {
    it('should call service.getLeadsForScan with workflowRunId', async () => {
      const expectedResponse = {
        workflowRunId: 'wf-123',
        count: 5,
        leads: [],
      };
      (service.getLeadsForScan as jest.Mock).mockResolvedValueOnce(
        expectedResponse,
      );

      const res = await controller.getLeadsForScan('wf-123');
      expect(service.getLeadsForScan).toHaveBeenCalledWith('wf-123');
      expect(res).toBe(expectedResponse);
    });
  });

  describe('handleCallback', () => {
    it('should call service.handleCallback with dto', async () => {
      const dto: DataCleaningCallbackDto = {
        workflowRunId: 'wf-123',
        status: 'SUCCESS',
        summary: {
          totalLeadsScanned: 10,
          totalIssuesFound: 0,
          issuesByType: {},
          issuesBySeverity: {},
          duplicatesFound: 0,
          safeToApplyCount: 0,
        },
        findings: [],
      };
      const expectedResponse = {
        success: true,
        workflowRunId: 'wf-123',
        status: WorkflowStatus.SUCCESS,
      };
      (service.handleCallback as jest.Mock).mockResolvedValueOnce(
        expectedResponse,
      );

      const res = await controller.handleCallback(dto);
      expect(service.handleCallback).toHaveBeenCalledWith(dto);
      expect(res).toBe(expectedResponse);
    });
  });

  describe('applyCleaning', () => {
    it('should call service.applyCleaning with workflowRunId, dto, and userId from user', async () => {
      const dto: ApplyCleaningDto = {
        acceptedFindingIds: ['f-1', 'f-2'],
      };
      const expectedResponse = {
        workflowRunId: 'wf-123',
        appliedCount: 2,
        skippedCount: 0,
        totalRequested: 2,
        results: [],
      };
      (service.applyCleaning as jest.Mock).mockResolvedValueOnce(
        expectedResponse,
      );

      const mockUser: AuthenticatedUser = {
        id: 'user-jwt-123',
        name: 'Test Sales',
        email: 'test@example.com',
        role: UserRole.SALES,
        status: UserStatus.ACTIVE,
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const res = await controller.applyCleaning('wf-123', dto, mockUser);
      expect(service.applyCleaning).toHaveBeenCalledWith(
        'wf-123',
        dto,
        'user-jwt-123',
      );
      expect(res).toBe(expectedResponse);
    });

    it('should pass undefined userId when user is not present', async () => {
      const dto: ApplyCleaningDto = {
        acceptedFindingIds: ['f-1'],
      };
      const expectedResponse = {
        workflowRunId: 'wf-123',
        appliedCount: 1,
        skippedCount: 0,
        totalRequested: 1,
        results: [],
      };
      (service.applyCleaning as jest.Mock).mockResolvedValueOnce(
        expectedResponse,
      );

      const res = await controller.applyCleaning('wf-123', dto, undefined);
      expect(service.applyCleaning).toHaveBeenCalledWith(
        'wf-123',
        dto,
        undefined,
      );
      expect(res).toBe(expectedResponse);
    });
  });

  describe('Authorization and Guard Metadata', () => {
    /* eslint-disable @typescript-eslint/unbound-method */
    it('should protect applyCleaning endpoint with JwtAuthGuard metadata', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        DataCleaningController.prototype.applyCleaning,
      );
      expect(guards).toBeDefined();
      expect(guards).toContain(JwtAuthGuard);
    });

    it('should protect handleCallback endpoint with N8nAuthGuard metadata', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        DataCleaningController.prototype.handleCallback,
      );
      expect(guards).toBeDefined();
      expect(guards).toContain(N8nAuthGuard);
    });
    /* eslint-enable @typescript-eslint/unbound-method */
  });
});
