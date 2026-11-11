import type { ConfigService } from '@nestjs/config';
import type { ChannelWrapper } from 'amqp-connection-manager';
import type { ConfirmChannel } from 'amqplib';
import { RabbitMQService } from './rabbitmq.service.js';
import {
  CRM_EVENTS,
  CRM_EXCHANGE,
  DATA_CLEANING_QUEUE,
  ENRICHMENT_QUEUE,
  FOLLOW_UP_QUEUE,
  LEGACY_CRM_QUEUE,
  LEAD_CREATED_QUEUE,
  QUALIFICATION_QUEUE,
  SCORING_QUEUE,
} from './rabbitmq.constants.js';

describe('RabbitMQService', () => {
  let service: RabbitMQService;
  let channel: jest.Mocked<Pick<ChannelWrapper, 'publish'>>;
  let configService: { get: jest.Mock };

  beforeEach(() => {
    configService = { get: jest.fn() };
    service = new RabbitMQService(configService as unknown as ConfigService);
    channel = { publish: jest.fn().mockResolvedValue(undefined) };
  });

  it('fails fast in production when RABBITMQ_URL is missing', () => {
    configService.get.mockImplementation((key: string) =>
      key === 'NODE_ENV' ? 'production' : undefined,
    );

    expect(() => service.getRabbitmqUrl()).toThrow(
      'FATAL: RABBITMQ_URL is required in production',
    );
  });

  it('rejects plaintext AMQP URLs in production', () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'NODE_ENV') return 'production';
      if (key === 'RABBITMQ_URL') return 'amqp://broker.example.test/vhost';
      return undefined;
    });

    expect(() => service.getRabbitmqUrl()).toThrow(
      'RABBITMQ_URL must use amqps in production',
    );
  });

  it('accepts an AMQPS URL in production', () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'NODE_ENV') return 'production';
      if (key === 'RABBITMQ_URL') return 'amqps://broker.example.test/vhost';
      return undefined;
    });

    expect(service.getRabbitmqUrl()).toBe('amqps://broker.example.test/vhost');
  });

  it('fails fast when CloudAMQP is explicitly enabled without a URL', () => {
    configService.get.mockImplementation((key: string) =>
      key === 'USE_CLOUD_AMQP' ? 'true' : undefined,
    );

    expect(() => service.getRabbitmqUrl()).toThrow(
      'RABBITMQ_URL is required when USE_CLOUD_AMQP=true',
    );
  });

  it('uses local broker defaults only outside production and cloud mode', () => {
    configService.get.mockImplementation((key: string) =>
      key === 'LOCAL_RABBITMQ_HOST' ? 'rabbitmq.local' : undefined,
    );

    expect(service.getRabbitmqUrl()).toBe(
      'amqp://guest:guest@rabbitmq.local:5672',
    );
  });

  it('returns the envelope only after the broker confirms publication', async () => {
    (service as unknown as { channelWrapper: typeof channel }).channelWrapper =
      channel;

    const event = await service.publishEvent('lead.created', {
      leadId: 'lead-1',
    });

    expect(event).toMatchObject({
      eventType: 'lead.created',
      version: 1,
      data: { leadId: 'lead-1' },
    });
    expect(event.eventId).toBeTruthy();
    expect(event.occurredAt).toBeTruthy();
    expect(channel.publish).toHaveBeenCalledWith(
      'crm.events',
      'lead.created',
      event,
      { persistent: true, contentType: 'application/json' },
    );
  });

  it('rejects when the broker rejects publication', async () => {
    channel.publish.mockRejectedValueOnce(new Error('broker unavailable'));
    (service as unknown as { channelWrapper: typeof channel }).channelWrapper =
      channel;

    await expect(
      service.publishEvent('lead.created', { leadId: 'lead-1' }),
    ).rejects.toThrow(
      "Failed to publish event 'lead.created': broker unavailable",
    );
  });

  it('rejects when no channel is ready', async () => {
    await expect(
      service.publishEvent('lead.created', { leadId: 'lead-1' }),
    ).rejects.toThrow(
      "RabbitMQ channel not ready; event 'lead.created' was not published.",
    );
  });

  it('provisions exact dedicated consumer queues and unbinds legacy broad routing', async () => {
    const channel = {
      assertExchange: jest.fn().mockResolvedValue(undefined),
      assertQueue: jest.fn().mockResolvedValue(undefined),
      bindQueue: jest.fn().mockResolvedValue(undefined),
      unbindQueue: jest.fn().mockResolvedValue(undefined),
    };

    await (
      service as unknown as {
        setupChannel(channel: ConfirmChannel): Promise<void>;
      }
    ).setupChannel(channel as unknown as ConfirmChannel);

    expect(channel.assertExchange).toHaveBeenCalledWith(CRM_EXCHANGE, 'topic', {
      durable: true,
    });
    expect(channel.bindQueue.mock.calls).toEqual([
      [LEAD_CREATED_QUEUE, CRM_EXCHANGE, CRM_EVENTS.LEAD_CREATED],
      [
        QUALIFICATION_QUEUE,
        CRM_EXCHANGE,
        CRM_EVENTS.LEAD_QUALIFICATION_REQUESTED,
      ],
      [ENRICHMENT_QUEUE, CRM_EXCHANGE, CRM_EVENTS.LEAD_ENRICHMENT_REQUESTED],
      [SCORING_QUEUE, CRM_EXCHANGE, CRM_EVENTS.LEAD_SCORING_REQUESTED],
      [DATA_CLEANING_QUEUE, CRM_EXCHANGE, CRM_EVENTS.DATA_CLEANING_REQUESTED],
      [FOLLOW_UP_QUEUE, CRM_EXCHANGE, CRM_EVENTS.FOLLOW_UP_TRIGGERED],
    ]);
    expect(channel.unbindQueue).toHaveBeenCalledWith(
      LEGACY_CRM_QUEUE,
      CRM_EXCHANGE,
      'lead.#',
    );
    expect(channel.unbindQueue).toHaveBeenCalledWith(
      LEGACY_CRM_QUEUE,
      CRM_EXCHANGE,
      'lead.*',
    );
    expect(channel.unbindQueue).toHaveBeenCalledWith(
      LEGACY_CRM_QUEUE,
      CRM_EXCHANGE,
      CRM_EVENTS.LEAD_QUALIFICATION_REQUESTED,
    );
  });
});
