import { BadRequestException, ConflictException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { Repository } from 'typeorm';
import { CommunicationService } from './communication.service.js';
import { CommunicationDelivery } from './entities/communication-delivery.entity.js';
import type { SendCommunicationDto } from './dto/send-communication.dto.js';

describe('CommunicationService', () => {
  let service: CommunicationService;
  let deliveriesRepository: jest.Mocked<
    Partial<Repository<CommunicationDelivery>>
  >;
  let sendMail: jest.Mock;

  const dto: SendCommunicationDto = {
    to: 'recipient@example.test',
    subject: 'Follow-up',
    html: '<p>Hello</p>',
    correlationId: 'correlation-1',
    idempotencyKey: 'execution-1:step-1',
  };

  const smtpConfig = {
    SMTP_HOST: 'smtp.example.test',
    SMTP_USER: 'smtp-user',
    SMTP_PASS: 'smtp-password',
  };

  function createService(values: Record<string, unknown> = smtpConfig): void {
    const configService = {
      get: jest.fn((key: string, defaultValue?: unknown) =>
        key in values ? values[key] : defaultValue,
      ),
    };

    deliveriesRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest
        .fn()
        .mockImplementation((value) =>
          Object.assign(new CommunicationDelivery(), value),
        ),
      save: jest
        .fn()
        .mockImplementation((delivery: CommunicationDelivery) =>
          Promise.resolve(delivery),
        ),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    sendMail = jest.fn().mockResolvedValue({ messageId: 'smtp-message-1' });
    jest.spyOn(nodemailer, 'createTransport').mockReturnValue({
      sendMail,
    } as unknown as Transporter);

    service = new CommunicationService(
      configService as unknown as ConfigService,
      deliveriesRepository as Repository<CommunicationDelivery>,
    );
  }

  beforeEach(() => {
    createService();
  });

  afterEach(() => jest.restoreAllMocks());

  it('sends email and persists the successful provider result', async () => {
    const result = await service.send(dto);

    expect(result).toMatchObject({
      success: true,
      providerMessageId: 'smtp-message-1',
      idempotencyStatus: 'new',
    });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: dto.to,
        subject: dto.subject,
        html: dto.html,
      }),
    );
    expect(deliveriesRepository.save).toHaveBeenCalledTimes(2);
    expect(deliveriesRepository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'SUCCEEDED' }),
    );
  });

  it('replays a successful idempotency key without sending again', async () => {
    await service.send(dto);
    const persistedDelivery = (deliveriesRepository.save as jest.Mock).mock
      .results[1].value as CommunicationDelivery;
    (deliveriesRepository.findOne as jest.Mock).mockResolvedValueOnce(
      persistedDelivery,
    );

    const result = await service.send(dto);

    expect(result.idempotencyStatus).toBe('replayed');
    expect(result.providerMessageId).toBe('smtp-message-1');
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it('rejects reuse of an idempotency key with a different payload', async () => {
    (deliveriesRepository.findOne as jest.Mock).mockResolvedValueOnce({
      id: 'delivery-1',
      idempotencyKey: dto.idempotencyKey,
      payloadHash: 'different-hash',
      status: 'SUCCEEDED',
    });

    await expect(service.send(dto)).rejects.toBeInstanceOf(ConflictException);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('retries a known connection-refused failure once with the same key', async () => {
    sendMail
      .mockRejectedValueOnce(
        Object.assign(new Error('connection refused'), {
          code: 'ECONNREFUSED',
        }),
      )
      .mockResolvedValueOnce({ messageId: 'smtp-message-2' });

    const failedResult = await service.send(dto);
    const failedDelivery = (deliveriesRepository.save as jest.Mock).mock
      .results[1].value as CommunicationDelivery;
    expect(failedResult).toMatchObject({ success: false, retryable: true });
    (deliveriesRepository.findOne as jest.Mock).mockResolvedValueOnce(
      failedDelivery,
    );

    const retryResult = await service.send(dto);

    expect(retryResult).toMatchObject({
      success: true,
      providerMessageId: 'smtp-message-2',
      idempotencyStatus: 'new',
    });
    expect(deliveriesRepository.update).toHaveBeenCalledWith(
      { id: failedDelivery.id, status: 'FAILED', retryable: true },
      expect.objectContaining({ status: 'PENDING' }),
    );
    expect(sendMail).toHaveBeenCalledTimes(2);
  });

  it('does not retry an ambiguous SMTP timeout', async () => {
    sendMail.mockRejectedValueOnce(
      Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }),
    );

    const result = await service.send(dto);

    expect(result).toMatchObject({
      success: false,
      retryable: false,
      error: 'SMTP timed out; delivery outcome is unknown',
    });
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it('does not expose SMTP authentication details', async () => {
    sendMail.mockRejectedValueOnce(
      Object.assign(new Error('credentials rejected smtp-password'), {
        code: 'EAUTH',
      }),
    );

    const result = await service.send(dto);

    expect(result.error).toBe('SMTP authentication failed');
    expect(result.error).not.toContain('smtp-password');
    expect(result.retryable).toBe(false);
  });

  it('rejects an invalid recipient before creating a delivery', async () => {
    await expect(service.send({ ...dto, to: 'not-an-email' })).rejects.toThrow(
      BadRequestException,
    );
    expect(deliveriesRepository.save).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('rejects requests without an idempotency key', async () => {
    await expect(service.send({ ...dto, idempotencyKey: '' })).rejects.toThrow(
      BadRequestException,
    );
    expect(deliveriesRepository.save).not.toHaveBeenCalled();
  });

  it('never reports success when SMTP configuration is missing', async () => {
    createService({ NODE_ENV: 'development' });

    const result = await service.send(dto);

    expect(result).toMatchObject({
      success: false,
      retryable: false,
      simulated: true,
    });
    expect(sendMail).not.toHaveBeenCalled();
  });
});
