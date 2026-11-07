import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { isEmail } from 'class-validator';
import {
  DataSource,
  LessThanOrEqual,
  Repository,
} from 'typeorm';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';
import { UserRole } from '../users/enums/user.enum.js';
import { FollowUpExecution } from '../follow-up/entities/follow-up-execution.entity.js';
import { LeadFollowUpEnrollment } from '../follow-up/entities/lead-follow-up-enrollment.entity.js';
import {
  EnrollmentStatus,
  ExecutionStatus,
} from '../follow-up/enums/follow-up.enum.js';
import {
  CommunicationDelivery,
  CommunicationDeliveryStatus,
} from './entities/communication-delivery.entity.js';

export const SMTP_TRANSPORT_FACTORY = 'SMTP_TRANSPORT_FACTORY';
const MAX_DELIVERY_ATTEMPTS = 4;
const PROCESSING_LEASE_MS = 2 * 60_000;

export interface SmtpTransport {
  sendMail(this: void, message: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<{ messageId?: string }>;
  close(this: void): void;
}

export type SmtpTransportFactory = (
  options: Record<string, unknown>,
) => SmtpTransport;

interface FollowUpEmailPayload {
  recipient: string;
  subject: string;
  message: string;
}

export interface DeliveryResult {
  success: boolean;
  providerMessageId: string | null;
  error: string | null;
  retryable: boolean;
  deliveryStatus: CommunicationDeliveryStatus;
  idempotencyStatus: 'new' | 'replayed';
}

interface ClaimedDelivery {
  deliveryId: string;
  payload: FollowUpEmailPayload;
  idempotencyStatus: 'new' | 'replayed';
}

type ClaimResult =
  | { kind: 'send'; claim: ClaimedDelivery }
  | { kind: 'result'; result: DeliveryResult };

@Injectable()
export class CommunicationService {
  private readonly logger = new Logger(CommunicationService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(FollowUpExecution)
    private readonly executions: Repository<FollowUpExecution>,
    @InjectRepository(CommunicationDelivery)
    private readonly deliveries: Repository<CommunicationDelivery>,
    private readonly config: ConfigService,
    @Inject(SMTP_TRANSPORT_FACTORY)
    private readonly transportFactory: SmtpTransportFactory,
  ) {}

  async sendFollowUpExecution(
    executionId: string,
    rawIdempotencyKey?: string,
  ): Promise<DeliveryResult> {
    if (!rawIdempotencyKey || rawIdempotencyKey !== executionId) {
      throw new BadRequestException(
        'Idempotency-Key must match the follow-up execution ID',
      );
    }

    const claimed = await this.claimDelivery(executionId);
    if (claimed.kind === 'result') return claimed.result;

    let transporter: SmtpTransport | null = null;
    let sendResult: { messageId?: string } | undefined;
    try {
      transporter = this.createSmtpTransport();
      const sent = await transporter.sendMail({
        from: this.requireStringConfig('SMTP_FROM_EMAIL'),
        to: claimed.claim.payload.recipient,
        subject: claimed.claim.payload.subject,
        text: claimed.claim.payload.message,
        html: this.buildSafeHtml(claimed.claim.payload.message),
      });
      sendResult = sent;
    } catch (error: unknown) {
      const classification = this.classifyFailure(error);
      const failed = await this.finishDelivery(
        claimed.claim.deliveryId,
        classification.status,
        null,
        classification.safeCode,
      );
      return this.toResult(
        failed,
        false,
        classification.safeCode,
        claimed.claim.idempotencyStatus,
      );
    } finally {
      transporter?.close();
    }

    // Keep database acknowledgement outside the SMTP try/catch. If the provider
    // accepted the email but PostgreSQL is unavailable, leave PROCESSING for
    // stale recovery to UNKNOWN rather than recording a false permanent failure.
    const completed = await this.finishDelivery(
      claimed.claim.deliveryId,
      CommunicationDeliveryStatus.SENT,
      sendResult?.messageId ?? null,
      null,
    );
    if (completed.status !== CommunicationDeliveryStatus.SENT) {
      return this.toResult(completed, false, 'DELIVERY_OUTCOME_UNKNOWN');
    }

    this.logger.log(
      `Follow-up email delivered for execution ${executionId}; delivery ${completed.id}`,
    );
    return this.toResult(completed, true, null, claimed.claim.idempotencyStatus);
  }

  async getDeliveryStatus(
    executionId: string,
    actor: AuthenticatedUser,
  ) {
    const execution = await this.executions.findOne({
      where: { id: executionId },
      relations: { enrollment: { lead: true } },
    });
    if (
      !execution ||
      (actor.role !== UserRole.ADMIN &&
        execution.enrollment?.lead?.ownerId !== actor.id)
    ) {
      throw new NotFoundException('Communication delivery not found');
    }

    const delivery = await this.deliveries.findOne({
      where: { executionId },
    });
    if (!delivery) {
      throw new NotFoundException('Communication delivery not found');
    }

    return {
      executionId,
      status: delivery.status,
      attempts: delivery.attempts,
      providerMessageId: delivery.providerMessageId,
      lastError: delivery.lastError,
      sentAt: delivery.sentAt,
      createdAt: delivery.createdAt,
      updatedAt: delivery.updatedAt,
    };
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async sweepStaleProcessingDeliveries(): Promise<void> {
    const staleBefore = new Date(Date.now() - PROCESSING_LEASE_MS);
    const candidates = await this.deliveries.find({
      where: {
        status: CommunicationDeliveryStatus.PROCESSING,
        startedAt: LessThanOrEqual(staleBefore),
      },
      select: { id: true },
      order: { startedAt: 'ASC' },
      take: 50,
    });

    for (const candidate of candidates) {
      try {
        const markedUnknown = await this.dataSource.transaction(
          async (manager) => {
            const repository = manager.getRepository(CommunicationDelivery);
            const delivery = await repository.findOne({
              where: { id: candidate.id },
              lock: { mode: 'pessimistic_write' },
            });
            if (
              !delivery ||
              delivery.status !== CommunicationDeliveryStatus.PROCESSING ||
              delivery.startedAt > staleBefore
            ) {
              return false;
            }

            delivery.status = CommunicationDeliveryStatus.UNKNOWN;
            delivery.lastError = 'DELIVERY_OUTCOME_UNKNOWN';
            await repository.save(delivery);
            return true;
          },
        );

        if (markedUnknown) {
          this.logger.warn(
            `Marked stale communication delivery ${candidate.id} UNKNOWN after the processing lease expired`,
          );
        }
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Failed to reconcile stale communication delivery ${candidate.id}: ${message}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
  }

  private async claimDelivery(executionId: string): Promise<ClaimResult> {
    return this.dataSource.transaction(async (manager) => {
      const enrollmentsRepository = manager.getRepository(
        LeadFollowUpEnrollment,
      );
      const executionRepository = manager.getRepository(FollowUpExecution);
      const deliveryRepository = manager.getRepository(CommunicationDelivery);

      // FollowUp lifecycle operations lock enrollment before execution. Keep
      // the same lock order here so cancellation cannot deadlock with dispatch.
      // Read only the immutable FK first, then acquire locks in the same
      // enrollment -> execution order used by pause/cancel/complete handlers.
      const executionReference = await executionRepository.findOne({
        where: { id: executionId },
        select: { id: true, enrollmentId: true },
      });
      if (!executionReference) {
        throw new NotFoundException('Follow-up execution not found');
      }

      const enrollment = await enrollmentsRepository.findOne({
        where: { id: executionReference.enrollmentId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!enrollment) {
        throw new NotFoundException('Follow-up enrollment not found');
      }

      const execution = await executionRepository.findOne({
        where: { id: executionId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!execution) {
        throw new NotFoundException('Follow-up execution not found');
      }

      const payload = this.validatePayload(execution.requestPayload);
      const idempotencyKey = `follow-up:${execution.id}`;
      const requestHash = this.hashPayload(payload);
      const delivery = await deliveryRepository.findOne({
        where: { executionId: execution.id },
        lock: { mode: 'pessimistic_write' },
      });

      // A completed or ambiguous delivery is immutable and replayable even if
      // the enrollment has since been paused, cancelled or completed.
      if (delivery) {
        if (
          delivery.idempotencyKey !== idempotencyKey ||
          delivery.requestHash !== requestHash
        ) {
          throw new ConflictException(
            'Follow-up execution delivery payload changed after it was claimed',
          );
        }

        if (delivery.status === CommunicationDeliveryStatus.SENT) {
          return {
            kind: 'result',
            result: this.toResult(delivery, true, null, 'replayed'),
          };
        }

        if (
          delivery.status === CommunicationDeliveryStatus.UNKNOWN ||
          delivery.status === CommunicationDeliveryStatus.PERMANENT_FAILURE
        ) {
          return {
            kind: 'result',
            result: this.toResult(
              delivery,
              false,
              delivery.lastError,
              'replayed',
            ),
          };
        }

        if (delivery.status === CommunicationDeliveryStatus.PROCESSING) {
          const isStale =
            Date.now() - delivery.startedAt.getTime() > PROCESSING_LEASE_MS;
          if (isStale) {
            delivery.status = CommunicationDeliveryStatus.UNKNOWN;
            delivery.lastError = 'DELIVERY_OUTCOME_UNKNOWN';
            await deliveryRepository.save(delivery);
            return {
              kind: 'result',
              result: this.toResult(
                delivery,
                false,
                'DELIVERY_OUTCOME_UNKNOWN',
                'replayed',
              ),
            };
          }

          return {
            kind: 'result',
            result: this.toResult(
              delivery,
              false,
              'DELIVERY_ALREADY_PROCESSING',
              'replayed',
            ),
          };
        }
      }

      // No new delivery or retry may start after a lifecycle transition.
      if (enrollment.status === EnrollmentStatus.PAUSED) {
        throw new HttpException(
          'Follow-up enrollment is paused; delivery will resume with the enrollment',
          HttpStatus.LOCKED,
        );
      }
      if (
        enrollment.status === EnrollmentStatus.CANCELLED ||
        enrollment.status === EnrollmentStatus.COMPLETED
      ) {
        throw new ConflictException(
          `Follow-up enrollment is '${enrollment.status}' and cannot send new messages`,
        );
      }
      if (execution.status !== ExecutionStatus.RUNNING) {
        throw new ConflictException(
          'Only a RUNNING follow-up execution may start or retry a delivery',
        );
      }

      if (!delivery) {
        const created = await deliveryRepository.save(
          deliveryRepository.create({
            executionId: execution.id,
            idempotencyKey,
            requestHash,
            status: CommunicationDeliveryStatus.PROCESSING,
            attempts: 1,
            providerMessageId: null,
            lastError: null,
            startedAt: new Date(),
            sentAt: null,
          }),
        );
        return {
          kind: 'send',
          claim: {
            deliveryId: created.id,
            payload,
            idempotencyStatus: 'new',
          },
        };
      }

      if (delivery.attempts >= MAX_DELIVERY_ATTEMPTS) {
        delivery.status = CommunicationDeliveryStatus.PERMANENT_FAILURE;
        delivery.lastError = 'DELIVERY_ATTEMPTS_EXHAUSTED';
        await deliveryRepository.save(delivery);
        return {
          kind: 'result',
          result: this.toResult(
            delivery,
            false,
            'DELIVERY_ATTEMPTS_EXHAUSTED',
            'replayed',
          ),
        };
      }

      delivery.status = CommunicationDeliveryStatus.PROCESSING;
      delivery.attempts += 1;
      delivery.startedAt = new Date();
      delivery.lastError = null;
      await deliveryRepository.save(delivery);

      return {
        kind: 'send',
        claim: {
          deliveryId: delivery.id,
          payload,
          idempotencyStatus: 'replayed',
        },
      };
    });
  }


  private async finishDelivery(
    deliveryId: string,
    status: CommunicationDeliveryStatus,
    providerMessageId: string | null,
    safeError: string | null,
  ): Promise<CommunicationDelivery> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(CommunicationDelivery);
      const delivery = await repository.findOne({
        where: { id: deliveryId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!delivery) {
        throw new NotFoundException('Communication delivery not found');
      }

      // A stale PROCESSING lease may already have been moved to UNKNOWN by a
      // second request. Never turn that ambiguous outcome into an automatic retry.
      if (delivery.status !== CommunicationDeliveryStatus.PROCESSING) {
        return delivery;
      }

      const attemptsExhausted =
        status === CommunicationDeliveryStatus.RETRYABLE_FAILURE &&
        delivery.attempts >= MAX_DELIVERY_ATTEMPTS;
      delivery.status = attemptsExhausted
        ? CommunicationDeliveryStatus.PERMANENT_FAILURE
        : status;
      delivery.providerMessageId = providerMessageId;
      delivery.lastError = attemptsExhausted
        ? safeError ?? 'DELIVERY_ATTEMPTS_EXHAUSTED'
        : safeError;
      delivery.sentAt =
        delivery.status === CommunicationDeliveryStatus.SENT ? new Date() : null;
      return repository.save(delivery);
    });
  }

  private createSmtpTransport(): SmtpTransport {
    const host = this.requireStringConfig('SMTP_HOST');
    const from = this.requireStringConfig('SMTP_FROM_EMAIL');
    const portValue = this.config.get<string>('SMTP_PORT');
    const port = portValue ? Number(portValue) : 587;
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('SMTP_CONFIG_INVALID_PORT');
    }

    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');
    if (Boolean(user) !== Boolean(pass)) {
      throw new Error('SMTP_CONFIG_INCOMPLETE_AUTH');
    }

    const options: Record<string, unknown> = {
      host,
      port,
      secure: this.config.get<string>('SMTP_SECURE') === 'true',
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
      tls: { rejectUnauthorized: true },
      disableFileAccess: true,
      disableUrlAccess: true,
    };
    if (user && pass) options.auth = { user, pass };
    // Validate the sender before opening the connection.
    if (!isEmail(from)) throw new Error('SMTP_CONFIG_INVALID_FROM_ADDRESS');
    return this.transportFactory(options);
  }

  private requireStringConfig(key: string): string {
    const value = this.config.get<string>(key)?.trim();
    if (!value) throw new Error(`SMTP_CONFIG_MISSING_${key}`);
    return value;
  }

  private validatePayload(
    value: Record<string, unknown> | null,
  ): FollowUpEmailPayload {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException(
        'Follow-up execution does not contain a persisted message payload',
      );
    }

    if (
      typeof value.channel !== 'string' ||
      value.channel.toUpperCase() !== 'EMAIL' ||
      typeof value.actionType !== 'string' ||
      value.actionType.toUpperCase() !== 'SEND_EMAIL'
    ) {
      throw new BadRequestException(
        'Communication provider does not support this follow-up channel',
      );
    }

    const recipient =
      typeof value.recipient === 'string' ? value.recipient.trim() : '';
    const subject = typeof value.subject === 'string' ? value.subject : '';
    const message = typeof value.message === 'string' ? value.message : '';

    if (!isEmail(recipient) || recipient.length > 320) {
      throw new BadRequestException('Follow-up recipient email is invalid');
    }
    if (
      !subject.trim() ||
      subject.length > 180 ||
      /[\r\n]/.test(subject)
    ) {
      throw new BadRequestException('Follow-up email subject is invalid');
    }
    if (!message.trim() || message.length > 20_000) {
      throw new BadRequestException('Follow-up email message is invalid');
    }

    return { recipient, subject: subject.trim(), message };
  }

  private hashPayload(payload: FollowUpEmailPayload): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          recipient: payload.recipient.toLowerCase(),
          subject: payload.subject,
          message: payload.message,
        }),
      )
      .digest('hex');
  }

  private buildSafeHtml(message: string): string {
    const escaped = message
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    return `<!doctype html><html><body><p>${escaped.replace(/\r?\n/g, '<br>')}</p></body></html>`;
  }

  private classifyFailure(error: unknown): {
    status: CommunicationDeliveryStatus;
    safeCode: string;
  } {
    const candidate =
      typeof error === 'object' && error !== null
        ? (error as { code?: unknown; responseCode?: unknown })
        : {};
    const responseCode =
      typeof candidate.responseCode === 'number'
        ? candidate.responseCode
        : null;
    const code = typeof candidate.code === 'string' ? candidate.code : '';

    if (responseCode !== null && responseCode >= 400 && responseCode < 500) {
      return {
        status: CommunicationDeliveryStatus.RETRYABLE_FAILURE,
        safeCode: `SMTP_${responseCode}`,
      };
    }
    if (responseCode !== null && responseCode >= 500) {
      return {
        status: CommunicationDeliveryStatus.PERMANENT_FAILURE,
        safeCode: `SMTP_${responseCode}`,
      };
    }
    if (['ECONNREFUSED', 'ENOTFOUND'].includes(code)) {
      return {
        status: CommunicationDeliveryStatus.RETRYABLE_FAILURE,
        safeCode: code,
      };
    }
    if (['ETIMEDOUT', 'ECONNRESET', 'EPIPE', 'ESOCKET'].includes(code)) {
      return {
        status: CommunicationDeliveryStatus.UNKNOWN,
        safeCode: `SMTP_OUTCOME_UNKNOWN_${code}`,
      };
    }
    return {
      status: CommunicationDeliveryStatus.PERMANENT_FAILURE,
      safeCode: code ? `SMTP_${code}` : 'SMTP_DELIVERY_FAILED',
    };
  }

  private toResult(
    delivery: CommunicationDelivery,
    success: boolean,
    error: string | null,
    idempotencyStatus: 'new' | 'replayed' = 'new',
  ): DeliveryResult {
    return {
      success,
      providerMessageId: delivery.providerMessageId,
      error,
      retryable:
        delivery.status === CommunicationDeliveryStatus.RETRYABLE_FAILURE ||
        (delivery.status === CommunicationDeliveryStatus.PROCESSING &&
          error === 'DELIVERY_ALREADY_PROCESSING'),
      deliveryStatus: delivery.status,
      idempotencyStatus,
    };
  }
}
