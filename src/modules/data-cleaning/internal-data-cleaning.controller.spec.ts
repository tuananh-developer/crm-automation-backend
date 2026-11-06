import { BadRequestException } from '@nestjs/common';
import { InternalDataCleaningController } from './internal-data-cleaning.controller.js';
import { DataCleaningService } from './data-cleaning.service.js';

describe('InternalDataCleaningController (WF08)', () => {
  const getInternalScanContext = jest.fn();
  const ensureScanReviewerNotification = jest.fn();

  const service = {
    getInternalScanContext,
    ensureScanReviewerNotification,
  } as unknown as jest.Mocked<DataCleaningService>;

  let controller: InternalDataCleaningController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new InternalDataCleaningController(service);
  });

  it('delegates scoped scan context lookup', async () => {
    getInternalScanContext.mockResolvedValue({
      workflowRunId: 'run',
    });

    await expect(controller.getScanContext('run')).resolves.toEqual({
      workflowRunId: 'run',
    });

    expect(getInternalScanContext).toHaveBeenCalledWith('run');
  });

  it('rejects a mismatched idempotency header', () => {
    const notifyReviewer = controller.notifyReviewer.bind(controller);

    expect(() =>
      notifyReviewer(
        {
          workflowRunId: 'run',
          eventId: 'event',
          findingCount: 1,
          idempotencyKey: 'run',
        },
        'different',
      ),
    ).toThrow(BadRequestException);
  });

  it('requires matching header and body idempotency key', async () => {
    ensureScanReviewerNotification.mockResolvedValue({
      notificationFound: true,
    });

    const notifyReviewer = controller.notifyReviewer.bind(controller);

    await expect(
      notifyReviewer(
        {
          workflowRunId: 'run',
          eventId: 'event',
          findingCount: 1,
          idempotencyKey: 'run',
        },
        'run',
      ),
    ).resolves.toEqual({
      notificationFound: true,
    });

    expect(ensureScanReviewerNotification).toHaveBeenCalledWith('run', 'run');
  });
});
