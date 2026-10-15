import { DataCleaningController } from './data-cleaning.controller.js';
import type { DataCleaningService } from './data-cleaning.service.js';
import { WorkflowStatus } from '../workflow/enums/workflow.enum.js';
import type {
  CreateScanDto,
  DataCleaningCallbackDto,
  ApplyCleaningDto,
} from './dto/index.js';

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
    it('should call service.applyCleaning with workflowRunId and dto', async () => {
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

      const res = await controller.applyCleaning('wf-123', dto);
      expect(service.applyCleaning).toHaveBeenCalledWith('wf-123', dto);
      expect(res).toBe(expectedResponse);
    });
  });
});
