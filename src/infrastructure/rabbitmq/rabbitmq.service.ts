import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp, {
  type ChannelWrapper,
  type AmqpConnectionManager,
} from 'amqp-connection-manager';
import type { ConfirmChannel } from 'amqplib';
import { randomUUID } from 'node:crypto';
import {
  CRM_EVENTS,
  CRM_EXCHANGE,
  DEFAULT_CRM_QUEUE,
  DATA_CLEANING_QUEUE,
} from './rabbitmq.constants.js';
import type {
  CrmEvent,
  LeadCreatedEventData,
  LeadQualificationRequestedEventData,
  LeadEnrichmentRequestedEventData,
  LeadScoringRequestedEventData,
  DataCleaningRequestedEventData,
} from './rabbitmq.interface.js';

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name);
  private connection: AmqpConnectionManager | null = null;
  private channelWrapper: ChannelWrapper | null = null;
  private isConnected = false;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const url = this.getRabbitmqUrl();
    const queueName =
      this.configService.get<string>('RABBITMQ_QUEUE') || DEFAULT_CRM_QUEUE;

    try {
      this.connection = amqp.connect([url]);

      this.connection.on('connect', () => {
        this.isConnected = true;
        this.logger.log('Connected to RabbitMQ successfully');
      });

      this.connection.on('disconnect', (err: { err?: Error }) => {
        this.isConnected = false;
        this.logger.warn(
          `Disconnected from RabbitMQ: ${err?.err?.message || 'unknown error'}`,
        );
      });

      this.channelWrapper = this.connection.createChannel({
        json: true,
        setup: async (channel: ConfirmChannel) => {
          await channel.assertExchange(CRM_EXCHANGE, 'topic', {
            durable: true,
          });
          await channel.assertQueue(queueName, { durable: true });
          await channel.bindQueue(queueName, CRM_EXCHANGE, 'lead.#');
          await channel.bindQueue(
            queueName,
            CRM_EXCHANGE,
            CRM_EVENTS.LEAD_QUALIFICATION_REQUESTED,
          );

          // Assert dedicated queue for AI Lead Enrichment (UC03)
          await channel.assertQueue('lead.enrichment.queue', { durable: true });
          await channel.bindQueue(
            'lead.enrichment.queue',
            CRM_EXCHANGE,
            CRM_EVENTS.LEAD_ENRICHMENT_REQUESTED,
          );

          // Assert dedicated queue for AI Lead Scoring (UC04)
          await channel.assertQueue('lead.scoring.queue', { durable: true });
          await channel.bindQueue(
            'lead.scoring.queue',
            CRM_EXCHANGE,
            CRM_EVENTS.LEAD_SCORING_REQUESTED,
          );

          // Assert dedicated queue for AI CRM Data Cleaning (UC10)
          await channel.assertQueue(DATA_CLEANING_QUEUE, { durable: true });
          await channel.bindQueue(
            DATA_CLEANING_QUEUE,
            CRM_EXCHANGE,
            CRM_EVENTS.DATA_CLEANING_REQUESTED,
          );

          this.logger.log(
            `Exchange '${CRM_EXCHANGE}', default queue '${queueName}', 'lead.enrichment.queue', 'lead.scoring.queue', and '${DATA_CLEANING_QUEUE}' asserted and bound`,
          );
        },
      });

      if (this.channelWrapper) {
        await this.channelWrapper.waitForConnect();
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to establish initial RabbitMQ connection: ${msg}. Event publishing will run in resilient fallback mode.`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      if (this.channelWrapper) {
        await this.channelWrapper.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
      this.logger.log('RabbitMQ connection closed');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error closing RabbitMQ connection: ${msg}`);
    }
  }

  getRabbitmqUrl(): string {
    const isProd = this.configService.get<string>('NODE_ENV') === 'production';
    const useCloudAmqp =
      this.configService.get<string>('USE_CLOUD_AMQP') === 'true';
    const fullUrl = this.configService.get<string>('RABBITMQ_URL');

    // 1. In production or when USE_CLOUD_AMQP=true: target CloudAMQP broker
    if ((isProd || useCloudAmqp) && fullUrl) {
      this.logger.log('Targeting CloudAMQP broker (Production / Cloud mode)');
      return fullUrl;
    }

    // 2. In development / local mode: prioritize local Docker RabbitMQ broker
    const host =
      this.configService.get<string>('LOCAL_RABBITMQ_HOST') || 'localhost';
    const port = this.configService.get<number>('LOCAL_RABBITMQ_PORT') || 5672;
    const user =
      this.configService.get<string>('LOCAL_RABBITMQ_USER') || 'guest';
    const password =
      this.configService.get<string>('LOCAL_RABBITMQ_PASSWORD') || 'guest';

    this.logger.log(
      `Targeting Local RabbitMQ broker at ${host}:${port} (Development mode)`,
    );
    return `amqp://${user}:${password}@${host}:${port}`;
  }

  isReady(): boolean {
    return this.isConnected;
  }

  async publishEvent<T = Record<string, any>>(
    eventType: string,
    data: T,
  ): Promise<CrmEvent<T>> {
    const event: CrmEvent<T> = {
      eventId: randomUUID(),
      eventType,
      version: 1,
      occurredAt: new Date().toISOString(),
      data,
    };

    if (this.channelWrapper) {
      try {
        await this.channelWrapper.publish(CRM_EXCHANGE, eventType, event, {
          persistent: true,
          contentType: 'application/json',
        });
        this.logger.log(
          `Event '${eventType}' published successfully (ID: ${event.eventId})`,
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed to publish event '${eventType}': ${msg}`);
      }
    } else {
      this.logger.warn(
        `RabbitMQ channel not ready. Event '${eventType}' could not be sent to broker.`,
      );
    }

    return event;
  }

  async publishLeadCreated(
    leadId: string,
  ): Promise<CrmEvent<LeadCreatedEventData>> {
    return this.publishEvent<LeadCreatedEventData>(CRM_EVENTS.LEAD_CREATED, {
      leadId,
    });
  }

  async publishLeadQualificationRequested(
    data: LeadQualificationRequestedEventData,
  ): Promise<CrmEvent<LeadQualificationRequestedEventData>> {
    return this.publishEvent<LeadQualificationRequestedEventData>(
      CRM_EVENTS.LEAD_QUALIFICATION_REQUESTED,
      data,
    );
  }

  async publishLeadEnrichmentRequested(
    data: LeadEnrichmentRequestedEventData,
  ): Promise<CrmEvent<LeadEnrichmentRequestedEventData>> {
    return this.publishEvent<LeadEnrichmentRequestedEventData>(
      CRM_EVENTS.LEAD_ENRICHMENT_REQUESTED,
      data,
    );
  }

  async publishLeadScoringRequested(
    data: LeadScoringRequestedEventData,
  ): Promise<CrmEvent<LeadScoringRequestedEventData>> {
    return this.publishEvent<LeadScoringRequestedEventData>(
      CRM_EVENTS.LEAD_SCORING_REQUESTED,
      data,
    );
  }

  async publishDataCleaningRequested(
    data: DataCleaningRequestedEventData,
  ): Promise<CrmEvent<DataCleaningRequestedEventData>> {
    return this.publishEvent<DataCleaningRequestedEventData>(
      CRM_EVENTS.DATA_CLEANING_REQUESTED,
      data,
    );
  }
}
