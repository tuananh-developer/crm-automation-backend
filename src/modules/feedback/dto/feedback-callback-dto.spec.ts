import { ValidationPipe, ArgumentMetadata } from '@nestjs/common';
import { FeedbackCallbackDto } from './feedback-callback.dto.js';

describe('FeedbackCallbackDto validation', () => {
  let target: ValidationPipe;
  const metadata: ArgumentMetadata = {
    type: 'body',
    metatype: FeedbackCallbackDto,
  };

  beforeEach(() => {
    target = new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    });
  });

  const validPayload = {
    feedbackId: '33333333-3333-4333-8333-333333333333',
    workflowRunId: '44444444-4444-4444-8444-444444444444',
    status: 'SUCCESS',
    sentiment: 'POSITIVE',
    category: 'PRODUCT',
    urgency: 'MEDIUM',
    escalationRequired: false,
  };

  it('accepts valid callback payload with status SUCCESS', async () => {
    const transformed = await target.transform(validPayload, metadata);
    expect(transformed).toBeDefined();
    expect(transformed.status).toBe('SUCCESS');
    expect(transformed.feedbackId).toBe(validPayload.feedbackId);
  });

  it('accepts valid callback payload with status FAILED', async () => {
    const transformed = await target.transform(
      {
        ...validPayload,
        status: 'FAILED',
        errorMessage: 'Classification timed out',
      },
      metadata,
    );
    expect(transformed).toBeDefined();
    expect(transformed.status).toBe('FAILED');
  });

  it.each([
    ['PENDING'],
    ['SUCCESSFUL'],
    ['failed'],
    ['success'],
    ['ERROR'],
    ['UNKNOWN'],
    [''],
    [null],
    [undefined],
  ])(
    'rejects invalid or malformed status %p with 400 Bad Request',
    async (invalidStatus) => {
      await expect(
        target.transform(
          {
            ...validPayload,
            status: invalidStatus,
          },
          metadata,
        ),
      ).rejects.toThrow();
    },
  );
});
