import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
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
  AllowedCleaningField,
  AppliedStatItem,
  ScanInputPayload,
  ScanOutputPayload,
} from './interfaces/data-cleaning.interface.js';

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

export type { AllowedCleaningField };

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

    // Resilient fallback worker: if n8n/RabbitMQ takes >20s or is delayed, automatically process in-process
    setTimeout(() => {
      void (async () => {
        try {
          const check = await this.workflowRunRepository.findOne({
            where: { id: savedRun.id },
          });
          if (
            check &&
            (check.status === WorkflowStatus.PENDING ||
              check.status === WorkflowStatus.RUNNING)
          ) {
            this.logger.log(
              `Executing resilient in-process data cleaning for WorkflowRun ${savedRun.id}`,
            );
            await this.executeInProcessScan(savedRun.id);
          }
        } catch (err: unknown) {
          const errText = err instanceof Error ? err.message : String(err);
          this.logger.error(
            `Error in fallback data cleaning worker: ${errText}`,
          );
        }
      })();
    }, 20000).unref();

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
   * Resilient in-process scan engine: executes duplicate detection and format audits
   * directly within the backend service if n8n/RabbitMQ is delayed or inaccessible.
   */
  async executeInProcessScan(workflowRunId: string): Promise<void> {
    const { leads } = await this.getLeadsForScan(workflowRunId);
    const findings: DataCleaningFinding[] = [];
    const emailMap = new Map<string, Lead[]>();
    const phoneMap = new Map<string, Lead[]>();

    for (const lead of leads) {
      if (lead.email) {
        const cleanEmail = lead.email.trim().toLowerCase();
        if (!emailMap.has(cleanEmail)) emailMap.set(cleanEmail, []);
        emailMap.get(cleanEmail)!.push(lead);
      }
      if (lead.phone) {
        const cleanPhone = lead.phone.replace(/[^0-9+]/g, '');
        if (cleanPhone.length >= 8) {
          if (!phoneMap.has(cleanPhone)) phoneMap.set(cleanPhone, []);
          phoneMap.get(cleanPhone)!.push(lead);
        }
      }
    }

    for (const duplicateLeads of emailMap.values()) {
      if (duplicateLeads.length > 1) {
        for (const lead of duplicateLeads) {
          findings.push({
            id: randomUUID(),
            recordType: 'Lead',
            recordId: lead.id,
            leadIdentifier:
              `${lead.firstName || ''} ${lead.lastName || ''} (${lead.email})`.trim(),
            fieldName: 'email',
            issueType: 'DUPLICATE_CANDIDATE',
            severity: 'CRITICAL',
            currentValue: lead.email,
            proposedValue: `Duplicate conflict with ${duplicateLeads.length - 1} other record(s)`,
            confidence: 0.99,
            reason:
              'Lead shares exact email with other leads in database. Requires manual review.',
            safeToApply: false,
            requiresHumanApproval: true,
          });
        }
      }
    }

    for (const [phone, duplicateLeads] of phoneMap.entries()) {
      if (duplicateLeads.length > 1) {
        for (const lead of duplicateLeads) {
          findings.push({
            id: randomUUID(),
            recordType: 'Lead',
            recordId: lead.id,
            leadIdentifier:
              `${lead.firstName || ''} ${lead.lastName || ''} (${lead.email})`.trim(),
            fieldName: 'phone',
            issueType: 'DUPLICATE_CANDIDATE',
            severity: 'HIGH',
            currentValue: lead.phone,
            proposedValue: `Duplicate phone conflict with ${duplicateLeads.length - 1} other record(s)`,
            confidence: 0.95,
            reason: `Lead shares same normalized phone number (${phone}). Requires manual review.`,
            safeToApply: false,
            requiresHumanApproval: true,
          });
        }
      }
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    for (const lead of leads) {
      const leadName =
        `${lead.firstName || ''} ${lead.lastName || ''}`.trim() ||
        'Unnamed Lead';
      const leadIdent = `${leadName} (${lead.email || 'No email'})`;

      if (!lead.firstName || !lead.firstName.trim()) {
        findings.push({
          id: randomUUID(),
          recordType: 'Lead',
          recordId: lead.id,
          leadIdentifier: leadIdent,
          fieldName: 'firstName',
          issueType: 'MISSING_FIELD',
          severity: 'HIGH',
          currentValue: lead.firstName || null,
          proposedValue: null,
          confidence: 1.0,
          reason:
            'First name is a required field but is currently missing or blank.',
          safeToApply: false,
          requiresHumanApproval: true,
        });
      }

      if (lead.email) {
        const rawEmail = lead.email;
        const trimmed = rawEmail.trim();
        const lower = trimmed.toLowerCase();

        if (rawEmail !== trimmed) {
          findings.push({
            id: randomUUID(),
            recordType: 'Lead',
            recordId: lead.id,
            leadIdentifier: leadIdent,
            fieldName: 'email',
            issueType: 'WHITESPACE_TRIM',
            severity: 'LOW',
            currentValue: rawEmail,
            proposedValue: lower,
            confidence: 1.0,
            reason: 'Email contains leading or trailing whitespace.',
            safeToApply: true,
            requiresHumanApproval: true,
          });
        } else if (rawEmail !== lower) {
          findings.push({
            id: randomUUID(),
            recordType: 'Lead',
            recordId: lead.id,
            leadIdentifier: leadIdent,
            fieldName: 'email',
            issueType: 'CASE_NORMALIZATION',
            severity: 'LOW',
            currentValue: rawEmail,
            proposedValue: lower,
            confidence: 1.0,
            reason:
              'Email contains uppercase characters. Standard convention is lowercase.',
            safeToApply: true,
            requiresHumanApproval: true,
          });
        }

        if (!emailRegex.test(lower)) {
          findings.push({
            id: randomUUID(),
            recordType: 'Lead',
            recordId: lead.id,
            leadIdentifier: leadIdent,
            fieldName: 'email',
            issueType: 'INVALID_EMAIL',
            severity: 'HIGH',
            currentValue: rawEmail,
            proposedValue: null,
            confidence: 0.98,
            reason: 'Email address does not match standard RFC email format.',
            safeToApply: false,
            requiresHumanApproval: true,
          });
        }
      }

      if (lead.companyWebsite) {
        const rawWeb = lead.companyWebsite.trim();
        if (rawWeb && !/^https?:\/\//i.test(rawWeb)) {
          const cleanWeb =
            'https://' + rawWeb.replace(/^www\./i, '').replace(/\/+$/, '');
          findings.push({
            id: randomUUID(),
            recordType: 'Lead',
            recordId: lead.id,
            leadIdentifier: leadIdent,
            fieldName: 'companyWebsite',
            issueType: 'INVALID_WEBSITE',
            severity: 'LOW',
            currentValue: lead.companyWebsite,
            proposedValue: cleanWeb,
            confidence: 0.95,
            reason:
              'Company website is missing standard https:// protocol prefix.',
            safeToApply: true,
            requiresHumanApproval: true,
          });
        } else if (rawWeb.includes(',')) {
          const cleanWeb = rawWeb.replace(/,/g, '.');
          findings.push({
            id: randomUUID(),
            recordType: 'Lead',
            recordId: lead.id,
            leadIdentifier: leadIdent,
            fieldName: 'companyWebsite',
            issueType: 'INVALID_WEBSITE',
            severity: 'MEDIUM',
            currentValue: lead.companyWebsite,
            proposedValue: cleanWeb,
            confidence: 0.98,
            reason:
              'Company website domain contains typo comma instead of dot.',
            safeToApply: true,
            requiresHumanApproval: true,
          });
        }
      }

      if (lead.phone) {
        const rawPhone = lead.phone.trim();
        const cleanedDigits = rawPhone.replace(/[^0-9+]/g, '');
        if (rawPhone !== cleanedDigits && cleanedDigits.length >= 9) {
          findings.push({
            id: randomUUID(),
            recordType: 'Lead',
            recordId: lead.id,
            leadIdentifier: leadIdent,
            fieldName: 'phone',
            issueType: 'INCONSISTENT_PHONE',
            severity: 'LOW',
            currentValue: rawPhone,
            proposedValue: cleanedDigits,
            confidence: 0.92,
            reason:
              'Phone contains formatting noise or symbols. Normalized to clean dialable digits.',
            safeToApply: true,
            requiresHumanApproval: true,
          });
        }
      }
    }

    const issuesByType: Record<string, number> = {};
    const issuesBySeverity: Record<string, number> = {};
    let duplicatesFound = 0;
    let safeToApplyCount = 0;

    for (const f of findings) {
      issuesByType[f.issueType] = (issuesByType[f.issueType] || 0) + 1;
      issuesBySeverity[f.severity] = (issuesBySeverity[f.severity] || 0) + 1;
      if (f.issueType === 'DUPLICATE_CANDIDATE') duplicatesFound++;
      if (f.safeToApply) safeToApplyCount++;
    }

    const summary = {
      totalLeadsScanned: leads.length,
      totalIssuesFound: findings.length,
      issuesByType,
      issuesBySeverity,
      duplicatesFound,
      safeToApplyCount,
    };

    await this.handleCallback({
      workflowRunId,
      status: 'SUCCESS',
      summary,
      findings: findings,
    });
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
