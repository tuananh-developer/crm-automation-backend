import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Lead } from '../leads/entities/lead.entity.js';
import { WorkflowRun } from '../workflow/entities/workflow-run.entity.js';
import { WorkflowStatus } from '../workflow/enums/workflow.enum.js';
import { AuditLog } from '../audit/entities/audit-log.entity.js';
import { RabbitMQService } from '../../infrastructure/rabbitmq/rabbitmq.service.js';
import {
  CreateScanDto,
  DataCleaningCallbackDto,
  ApplyCleaningDto,
} from './dto/index.js';
import type {
  ApplyCleaningResult,
  AppliedFindingResult,
  DataCleaningFinding,
  DataCleaningSummary,
} from './interfaces/data-cleaning.interface.js';
import type { LeadStatus } from '../leads/enums/lead.enum.js';

export const ALLOWED_DATA_CLEANING_FIELDS = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'companyName',
  'companyWebsite',
  'jobTitle',
  'industry',
] as const;

export type AllowedCleaningField =
  (typeof ALLOWED_DATA_CLEANING_FIELDS)[number];

interface ScanInputPayload {
  scope: 'ALL' | 'FILTER';
  filter?: {
    status?: LeadStatus;
    sourceId?: string;
    search?: string;
    limit?: number;
  } | null;
  requestedAt?: string;
}

interface AppliedStatItem {
  appliedAt: string;
  userId: string | null;
  appliedCount: number;
  skippedCount: number;
  totalRequested: number;
}

interface ScanOutputPayload {
  summary?: DataCleaningSummary | null;
  findings?: DataCleaningFinding[];
  appliedStats?: AppliedStatItem[];
  receivedAt?: string;
}

function isAllowedCleaningField(field: string): field is AllowedCleaningField {
  return (ALLOWED_DATA_CLEANING_FIELDS as readonly string[]).includes(field);
}

function getLeadFieldValue(lead: Lead, field: AllowedCleaningField): unknown {
  return lead[field];
}

function setLeadFieldValue(
  lead: Lead,
  field: AllowedCleaningField,
  val: unknown,
): void {
  const target = lead as unknown as Record<AllowedCleaningField, unknown>;
  target[field] = val;
}

@Injectable()
export class DataCleaningService {
  private readonly logger = new Logger(DataCleaningService.name);

  constructor(
    @InjectRepository(Lead)
    private readonly leadsRepository: Repository<Lead>,
    @InjectRepository(WorkflowRun)
    private readonly workflowRunRepository: Repository<WorkflowRun>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
    private readonly rabbitmqService: RabbitMQService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Initiates a new Lead Data Cleaning Scan (UC10 - Step 4 & 5).
   * Creates a WorkflowRun and dispatches data.cleaning.requested event to RabbitMQ.
   */
  async createScan(
    dto: CreateScanDto,
    userId?: string,
  ): Promise<{
    workflowRunId: string;
    status: WorkflowStatus;
    message: string;
  }> {
    const effectiveUserId = dto.userId || userId || null;

    const inputData: ScanInputPayload = {
      scope: dto.scope,
      filter: dto.filter || null,
      requestedAt: new Date().toISOString(),
    };

    const workflowRun = this.workflowRunRepository.create({
      workflowName: 'UC10_DATA_CLEANING',
      status: WorkflowStatus.PENDING,
      triggeredByUserId: effectiveUserId,
      inputPayload: inputData as unknown as Record<string, any>,
      outputPayload: null,
      startedAt: new Date(),
    });

    const savedRun = await this.workflowRunRepository.save(workflowRun);

    // Publish event to RabbitMQ dedicated queue
    try {
      await this.rabbitmqService.publishDataCleaningRequested({
        workflowRunId: savedRun.id,
        triggeredByUserId: effectiveUserId,
        scope: dto.scope,
        filter: dto.filter || null,
        timestamp: new Date().toISOString(),
      });
      this.logger.log(
        `Dispatched data cleaning requested event for WorkflowRun ${savedRun.id}`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Failed to publish RabbitMQ event for WorkflowRun ${savedRun.id}: ${msg}. Fallback mode active.`,
      );
    }

    return {
      workflowRunId: savedRun.id,
      status: savedRun.status,
      message: 'Data cleaning scan initiated successfully',
    };
  }

  /**
   * Retrieves scan status and findings report for a given WorkflowRun (UC10 - Step 11).
   */
  async getScan(workflowRunId: string): Promise<Record<string, unknown>> {
    const workflowRun = await this.workflowRunRepository.findOne({
      where: { id: workflowRunId },
    });

    if (!workflowRun) {
      throw new NotFoundException(
        `Data cleaning workflow run '${workflowRunId}' not found`,
      );
    }

    const output =
      (workflowRun.outputPayload as unknown as ScanOutputPayload) || {};

    return {
      workflowRunId: workflowRun.id,
      status: workflowRun.status,
      startedAt: workflowRun.startedAt,
      finishedAt: workflowRun.finishedAt,
      inputPayload: workflowRun.inputPayload,
      summary: output.summary ?? null,
      findings: output.findings ?? [],
      appliedStats: output.appliedStats ?? null,
      errorMessage: workflowRun.errorMessage,
    };
  }

  /**
   * Fetches the batch of leads targeted by the scan so n8n can inspect and clean them (UC10 - Step 6).
   */
  async getLeadsForScan(
    workflowRunId: string,
  ): Promise<{ workflowRunId: string; count: number; leads: Lead[] }> {
    const workflowRun = await this.workflowRunRepository.findOne({
      where: { id: workflowRunId },
    });

    if (!workflowRun) {
      throw new NotFoundException(`Workflow run '${workflowRunId}' not found`);
    }

    const inputPayload =
      (workflowRun.inputPayload as unknown as ScanInputPayload) || {
        scope: 'ALL',
      };
    const scope = inputPayload.scope || 'ALL';
    const filter = inputPayload.filter || {};
    const limit = Math.min(filter.limit || 500, 2000);

    const qb = this.leadsRepository.createQueryBuilder('lead');

    if (scope === 'FILTER') {
      if (filter.status) {
        qb.andWhere('lead.status = :status', { status: filter.status });
      }
      if (filter.sourceId) {
        qb.andWhere('lead.sourceId = :sourceId', { sourceId: filter.sourceId });
      }
      if (filter.search && typeof filter.search === 'string') {
        const searchKeyword = `%${filter.search.trim()}%`;
        qb.andWhere(
          '(lead.firstName ILIKE :search OR lead.lastName ILIKE :search OR lead.email ILIKE :search OR lead.companyName ILIKE :search)',
          { search: searchKeyword },
        );
      }
    }

    qb.orderBy('lead.createdAt', 'DESC');
    qb.take(limit);

    const leads = await qb.getMany();

    return {
      workflowRunId,
      count: leads.length,
      leads,
    };
  }

  /**
   * Handles n8n callback to store findings report and update WorkflowRun status (UC10 - Step 10).
   */
  async handleCallback(dto: DataCleaningCallbackDto): Promise<{
    success: boolean;
    workflowRunId: string;
    status: WorkflowStatus;
  }> {
    const workflowRun = await this.workflowRunRepository.findOne({
      where: { id: dto.workflowRunId },
    });

    if (!workflowRun) {
      throw new NotFoundException(
        `Workflow run '${dto.workflowRunId}' not found for callback`,
      );
    }

    const isSuccess = dto.status !== 'FAILED';
    workflowRun.status = isSuccess
      ? WorkflowStatus.SUCCESS
      : WorkflowStatus.FAILED;

    const existingOutput =
      (workflowRun.outputPayload as unknown as ScanOutputPayload) || {};

    const updatedOutput: ScanOutputPayload = {
      ...existingOutput,
      summary: dto.summary,
      findings: dto.findings,
      receivedAt: new Date().toISOString(),
    };

    workflowRun.outputPayload = updatedOutput as Record<string, any>;
    workflowRun.finishedAt = new Date();
    workflowRun.errorMessage = dto.errorMessage || null;

    await this.workflowRunRepository.save(workflowRun);

    this.logger.log(
      `Updated WorkflowRun ${workflowRun.id} status to ${workflowRun.status} with ${dto.findings?.length || 0} findings`,
    );

    return {
      success: true,
      workflowRunId: workflowRun.id,
      status: workflowRun.status,
    };
  }

  /**
   * Applies approved remediation proposals in an atomic database transaction with AuditLog (UC10 - Step 12).
   */
  async applyCleaning(
    workflowRunId: string,
    dto: ApplyCleaningDto,
    userId?: string,
  ): Promise<ApplyCleaningResult> {
    const workflowRun = await this.workflowRunRepository.findOne({
      where: { id: workflowRunId },
    });

    if (!workflowRun) {
      throw new NotFoundException(`Workflow run '${workflowRunId}' not found`);
    }

    if (workflowRun.status !== WorkflowStatus.SUCCESS) {
      throw new BadRequestException(
        `Cannot apply changes to workflow run with status '${workflowRun.status}'. Scan must be completed.`,
      );
    }

    const output =
      (workflowRun.outputPayload as unknown as ScanOutputPayload) || {};
    const findings: DataCleaningFinding[] = output.findings || [];

    if (!findings.length) {
      throw new BadRequestException(
        'Scan report contains no findings to apply',
      );
    }

    const findingMap = new Map<string, DataCleaningFinding>();
    for (const f of findings) {
      findingMap.set(f.id, f);
    }

    const effectiveUserId =
      dto.userId || userId || workflowRun.triggeredByUserId || null;

    // Execute updates within an ACID transaction
    const result = await this.dataSource.transaction(async (manager) => {
      const results: AppliedFindingResult[] = [];

      // Group requested findings by leadId to minimize lock overhead
      const findingsByLead = new Map<string, DataCleaningFinding[]>();

      for (const findingId of dto.acceptedFindingIds) {
        const finding = findingMap.get(findingId);
        if (!finding) {
          results.push({
            findingId,
            leadId: '',
            fieldName: '',
            oldValue: null,
            newValue: null,
            status: 'SKIPPED',
            skipReason: 'Finding ID not recognized in scan report',
          });
          continue;
        }

        const list = findingsByLead.get(finding.recordId) || [];
        list.push(finding);
        findingsByLead.set(finding.recordId, list);
      }

      for (const [leadId, leadFindings] of findingsByLead.entries()) {
        const lead = await manager.findOne(Lead, {
          where: { id: leadId },
        });

        if (!lead) {
          for (const f of leadFindings) {
            results.push({
              findingId: f.id,
              leadId,
              fieldName: f.fieldName,
              oldValue: f.currentValue,
              newValue: f.proposedValue,
              status: 'SKIPPED',
              skipReason: 'Lead not found in database',
            });
          }
          continue;
        }

        const oldValuesSnapshot: Record<string, unknown> = {};
        const newValuesSnapshot: Record<string, unknown> = {};
        const appliedFindingIds: string[] = [];

        for (const finding of leadFindings) {
          // 1. Whitelist verification
          if (!isAllowedCleaningField(finding.fieldName)) {
            results.push({
              findingId: finding.id,
              leadId: lead.id,
              fieldName: finding.fieldName,
              oldValue: finding.currentValue,
              newValue: finding.proposedValue,
              status: 'SKIPPED',
              skipReason: `Field '${finding.fieldName}' is not whitelisted for automated updates`,
            });
            continue;
          }

          const targetField = finding.fieldName;

          // 2. Concurrency re-validation: Check if field has been modified since scan
          const currentLeadVal = getLeadFieldValue(lead, targetField);
          const scannedVal = finding.currentValue;

          const currentLeadStr =
            typeof currentLeadVal === 'string'
              ? currentLeadVal
              : typeof currentLeadVal === 'number' ||
                  typeof currentLeadVal === 'boolean'
                ? String(currentLeadVal)
                : '';
          const scannedValStr =
            typeof scannedVal === 'string'
              ? scannedVal
              : typeof scannedVal === 'number' ||
                  typeof scannedVal === 'boolean'
                ? String(scannedVal)
                : '';

          // Normalize string comparison to tolerate trivial whitespace discrepancies in current val
          const isStale =
            scannedVal !== null &&
            scannedVal !== undefined &&
            currentLeadStr.trim() !== scannedValStr.trim();

          if (isStale) {
            results.push({
              findingId: finding.id,
              leadId: lead.id,
              fieldName: finding.fieldName,
              oldValue: currentLeadVal,
              newValue: finding.proposedValue,
              status: 'SKIPPED',
              skipReason: `Lead data has changed since scan was run (DB has '${currentLeadStr}', scan observed '${scannedValStr}')`,
            });
            continue;
          }

          // 3. Email uniqueness check if updating email
          if (targetField === 'email') {
            const normalizedEmail = String(finding.proposedValue)
              .trim()
              .toLowerCase();
            const existingWithEmail = await manager.findOne(Lead, {
              where: { email: normalizedEmail },
            });

            if (existingWithEmail && existingWithEmail.id !== lead.id) {
              results.push({
                findingId: finding.id,
                leadId: lead.id,
                fieldName: finding.fieldName,
                oldValue: currentLeadVal,
                newValue: finding.proposedValue,
                status: 'SKIPPED',
                skipReason: `Email '${normalizedEmail}' is already taken by another lead`,
              });
              continue;
            }

            oldValuesSnapshot['email'] = lead.email;
            lead.email = normalizedEmail;
            newValuesSnapshot['email'] = normalizedEmail;
          } else {
            oldValuesSnapshot[targetField] = currentLeadVal;
            setLeadFieldValue(lead, targetField, finding.proposedValue);
            newValuesSnapshot[targetField] = finding.proposedValue;
          }

          appliedFindingIds.push(finding.id);

          results.push({
            findingId: finding.id,
            leadId: lead.id,
            fieldName: finding.fieldName,
            oldValue: finding.currentValue,
            newValue: finding.proposedValue,
            status: 'APPLIED',
          });
        }

        // If any field on this lead was modified, save lead and create AuditLog
        if (Object.keys(newValuesSnapshot).length > 0) {
          await manager.save(lead);

          const auditLog = manager.create(AuditLog, {
            userId: effectiveUserId,
            action: 'LEAD_DATA_CLEANED',
            entityType: 'Lead',
            entityId: lead.id,
            oldValue: oldValuesSnapshot,
            newValue: newValuesSnapshot,
            metadata: {
              workflowRunId,
              appliedFindingIds,
              modifiedFields: Object.keys(newValuesSnapshot),
            },
            ipAddress: null,
            userAgent: null,
          });

          await manager.save(auditLog);
        }
      }

      const appliedCount = results.filter((r) => r.status === 'APPLIED').length;
      const skippedCount = results.filter((r) => r.status === 'SKIPPED').length;

      // Update WorkflowRun metadata with applied summary
      const currentOutput =
        (workflowRun.outputPayload as unknown as ScanOutputPayload) || {};
      const existingAppliedStats: AppliedStatItem[] =
        currentOutput.appliedStats || [];

      const newStatItem: AppliedStatItem = {
        appliedAt: new Date().toISOString(),
        userId: effectiveUserId,
        appliedCount,
        skippedCount,
        totalRequested: dto.acceptedFindingIds.length,
      };

      const updatedAppliedStats: AppliedStatItem[] = [
        ...existingAppliedStats,
        newStatItem,
      ];

      workflowRun.outputPayload = {
        ...currentOutput,
        appliedStats: updatedAppliedStats,
      } as Record<string, any>;

      await manager.save(workflowRun);

      return {
        workflowRunId,
        appliedCount,
        skippedCount,
        totalRequested: dto.acceptedFindingIds.length,
        results,
      };
    });

    this.logger.log(
      `Applied ${result.appliedCount} findings (skipped ${result.skippedCount}) for WorkflowRun ${workflowRunId}`,
    );

    return result;
  }
}
