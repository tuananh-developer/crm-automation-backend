import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Lead } from '../leads/entities/lead.entity.js';
import { WorkflowRun } from '../workflow/entities/workflow-run.entity.js';
import { WorkflowStatus } from '../workflow/enums/workflow.enum.js';
import { AuditLog } from '../audit/entities/audit-log.entity.js';
import { Notification } from '../notifications/entities/notification.entity.js';
import { NotificationType } from '../notifications/enums/notification.enum.js';
import { RabbitMQService } from '../../infrastructure/rabbitmq/rabbitmq.service.js';
import { CRM_EVENTS } from '../../infrastructure/rabbitmq/rabbitmq.constants.js';
import { UserRole } from '../users/enums/user.enum.js';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';
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
  async createScan(dto: CreateScanDto, actor: AuthenticatedUser | string): Promise<{
    workflowRunId: string;
    status: WorkflowStatus;
    message: string;
  }> {
    const userId = typeof actor === 'string' ? actor : actor.id;
    const ownerId =
      typeof actor === 'string' || actor.role === UserRole.ADMIN
        ? null
        : actor.id;
    const workflowRun = this.workflowRunRepository.create({
      workflowName: 'UC10_DATA_CLEANING',
      status: WorkflowStatus.PENDING,
      triggeredByUserId: userId,
      inputPayload: {
        scope: dto.scope,
        filter: dto.filter || null,
        ownerId,
        requestedAt: new Date().toISOString(),
      },
      outputPayload: null,
      startedAt: new Date(),
    });
    const savedRun = await this.dataSource.transaction(async (manager) => {
      const persisted = await manager.save(WorkflowRun, workflowRun);
      await this.rabbitmqService.enqueueEvent(manager, CRM_EVENTS.DATA_CLEANING_REQUESTED, {
        workflowRunId: persisted.id,
        triggeredByUserId: userId,
        ownerId,
        scope: dto.scope,
        filter: dto.filter || null,
        timestamp: new Date().toISOString(),
      });
      return persisted;
    });
    return { workflowRunId: savedRun.id, status: savedRun.status, message: 'Data cleaning scan initiated successfully' };
  }

  async getScan(workflowRunId: string, actor: AuthenticatedUser | string): Promise<Record<string, unknown>> {
    const workflowRun = await this.workflowRunRepository.findOne({
      where: { id: workflowRunId, workflowName: 'UC10_DATA_CLEANING' },
    });
    if (!workflowRun) throw new NotFoundException('Data cleaning scan not found');
    const actorId = typeof actor === 'string' ? actor : actor.id;
    const isAdmin = typeof actor !== 'string' && actor.role === UserRole.ADMIN;
    if (!isAdmin && workflowRun.triggeredByUserId !== actorId) {
      throw new ForbiddenException('You do not have permission to view this scan');
    }
    const output = (workflowRun.outputPayload as unknown as ScanOutputPayload) || {};
    return { workflowRunId: workflowRun.id, status: workflowRun.status, startedAt: workflowRun.startedAt, finishedAt: workflowRun.finishedAt, inputPayload: workflowRun.inputPayload, summary: output.summary ?? null, findings: output.findings ?? [], appliedStats: output.appliedStats ?? null, errorMessage: workflowRun.errorMessage };
  }

  async getLeadsForScan(workflowRunId: string): Promise<{ workflowRunId: string; count: number; leads: Lead[] }> {
    const workflowRun = await this.workflowRunRepository.findOne({ where: { id: workflowRunId, workflowName: 'UC10_DATA_CLEANING' } });
    if (!workflowRun) throw new NotFoundException('Data cleaning workflow run not found');
    if (![WorkflowStatus.PENDING, WorkflowStatus.RUNNING].includes(workflowRun.status)) {
      throw new ConflictException('Data-cleaning run is not active');
    }
    const inputPayload = (workflowRun.inputPayload as unknown as ScanInputPayload) || { scope: 'ALL' };
    const scope = inputPayload.scope || 'ALL'; const filter = inputPayload.filter || {}; const limit = Math.min(filter.limit || 500, 2000);
    const qb = this.leadsRepository.createQueryBuilder('lead');
    if (inputPayload.ownerId) {
      qb.andWhere('lead.ownerId = :ownerId', {
        ownerId: inputPayload.ownerId,
      });
    }
    if (scope === 'FILTER') {
      if (filter.status) qb.andWhere('lead.status = :status', { status: filter.status });
      if (filter.sourceId) qb.andWhere('lead.sourceId = :sourceId', { sourceId: filter.sourceId });
      if (filter.search && typeof filter.search === 'string') { const term = '%' + filter.search.trim() + '%'; qb.andWhere('(lead.firstName ILIKE :search OR lead.lastName ILIKE :search OR lead.email ILIKE :search OR lead.companyName ILIKE :search)', { search: term }); }
    }
    qb.orderBy('lead.createdAt', 'DESC'); qb.take(limit);
    const leads = await qb.getMany();
    return { workflowRunId, count: leads.length, leads };
  }

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
      where: {
        id: dto.workflowRunId,
        workflowName: 'UC10_DATA_CLEANING',
      },
    });

    if (!workflowRun) {
      throw new NotFoundException(
        `Workflow run '${dto.workflowRunId}' not found for callback`,
      );
    }

    if (
      workflowRun.workflowName !== 'UC10_DATA_CLEANING' ||
      ![WorkflowStatus.PENDING, WorkflowStatus.RUNNING].includes(
        workflowRun.status,
      )
    ) {
      if (
        workflowRun.workflowName === 'UC10_DATA_CLEANING' &&
        [
          WorkflowStatus.SUCCESS,
          WorkflowStatus.PARTIAL,
          WorkflowStatus.FAILED,
        ].includes(workflowRun.status)
      ) {
        return {
          success: true,
          workflowRunId: workflowRun.id,
          status: workflowRun.status,
        };
      }
      throw new ConflictException(
        'WorkflowRun is not an active data-cleaning run',
      );
    }

    const nextStatus =
      dto.status === 'FAILED'
        ? WorkflowStatus.FAILED
        : dto.status === 'PARTIAL'
          ? WorkflowStatus.PARTIAL
          : WorkflowStatus.SUCCESS;

    const existingOutput =
      (workflowRun.outputPayload as unknown as ScanOutputPayload) || {};
    const updatedOutput: ScanOutputPayload = {
      ...existingOutput,
      summary: dto.summary,
      findings: dto.findings,
      receivedAt: new Date().toISOString(),
    };
    const finishedAt = new Date();

    // A conditional UPDATE makes callback completion single-writer even when
    // n8n retries or two workers deliver the same callback concurrently.
    const updateResult = await this.workflowRunRepository.update(
      {
        id: workflowRun.id,
        workflowName: 'UC10_DATA_CLEANING',
        status: In([WorkflowStatus.PENDING, WorkflowStatus.RUNNING]),
      },
      {
        status: nextStatus,
        outputPayload: updatedOutput as Record<string, any>,
        finishedAt,
        errorMessage: dto.errorMessage || null,
      },
    );

    if ((updateResult.affected ?? 0) === 0) {
      const latestRun = await this.workflowRunRepository.findOne({
        where: {
          id: workflowRun.id,
          workflowName: 'UC10_DATA_CLEANING',
        },
      });
      if (
        latestRun &&
        [
          WorkflowStatus.SUCCESS,
          WorkflowStatus.PARTIAL,
          WorkflowStatus.FAILED,
        ].includes(latestRun.status)
      ) {
        return {
          success: true,
          workflowRunId: latestRun.id,
          status: latestRun.status,
        };
      }
      throw new ConflictException(
        'WorkflowRun stopped being active before callback completion',
      );
    }

    this.logger.log(
      `Updated WorkflowRun ${workflowRun.id} status to ${nextStatus} with ${dto.findings?.length || 0} findings`,
    );

    return {
      success: true,
      workflowRunId: workflowRun.id,
      status: nextStatus,
    };
  }

  /**
   * Applies approved remediation proposals in an atomic database transaction with AuditLog (UC10 - Step 12).
   */
  async applyCleaning(
    workflowRunId: string,
    dto: ApplyCleaningDto,
    actor: AuthenticatedUser | string,
  ): Promise<ApplyCleaningResult> {
    const actorId = typeof actor === 'string' ? actor : actor.id;
    const isAdmin = typeof actor !== 'string' && actor.role === UserRole.ADMIN;
    const workflowRun = await this.workflowRunRepository.findOne({
      where: { id: workflowRunId, workflowName: 'UC10_DATA_CLEANING' },
    });
    if (!workflowRun) throw new NotFoundException('Data cleaning scan not found');
    if (!isAdmin && workflowRun.triggeredByUserId !== actorId) throw new ForbiddenException('You do not have permission to apply cleaning proposals for this scan');
    if (workflowRun.status !== WorkflowStatus.SUCCESS) throw new BadRequestException('Scan must be completed before applying cleaning proposals');
    const output = (workflowRun.outputPayload as unknown as ScanOutputPayload) || {};
    const findings: DataCleaningFinding[] = output.findings || [];
    if (!findings.length) throw new BadRequestException('Scan report contains no findings to apply');
    const result = await this.dataSource.transaction(async (manager) => {
      const targetRun = await manager.findOne(WorkflowRun, {
        where: { id: workflowRunId, workflowName: 'UC10_DATA_CLEANING' },
        lock: { mode: 'pessimistic_write' },
      });
      if (!targetRun) {
        throw new NotFoundException('Data cleaning scan not found');
      }
      if (!isAdmin && targetRun.triggeredByUserId !== actorId) throw new ForbiddenException('You do not have permission to apply cleaning proposals for this scan');
      if (targetRun.status !== WorkflowStatus.SUCCESS) throw new BadRequestException('Data cleaning scan is no longer eligible for changes');
      const currentOutput = (targetRun.outputPayload as unknown as ScanOutputPayload) || {};
      const currentFindings = currentOutput.findings || [];
      if (!currentFindings.length) {
        throw new BadRequestException('Scan report contains no findings to apply');
      }
      const findingMap = new Map(currentFindings.map((finding) => [finding.id, finding]));
      const previouslyAppliedIds: string[] = currentOutput.appliedFindingIds || [];
      const newlyAppliedIds: string[] = [];
      const results: AppliedFindingResult[] = [];
      const grouped = new Map<string, DataCleaningFinding[]>();
      for (const findingId of dto.acceptedFindingIds) {
        const finding = findingMap.get(findingId);
        if (!finding) { results.push({ findingId, leadId: '', fieldName: '', oldValue: null, newValue: null, status: 'SKIPPED', skipReason: 'Finding ID not recognized in scan report' }); continue; }
        const group = grouped.get(finding.recordId) || []; group.push(finding); grouped.set(finding.recordId, group);
      }
      for (const [leadId, group] of grouped) {
        const lead = await manager.findOne(Lead, { where: { id: leadId }, lock: { mode: 'pessimistic_write' } });
        if (!lead) { for (const finding of group) results.push({ findingId: finding.id, leadId, fieldName: finding.fieldName, oldValue: finding.currentValue, newValue: finding.proposedValue, status: 'SKIPPED', skipReason: 'Lead not found in database' }); continue; }
        if (!isAdmin && lead.ownerId !== actorId) {
          throw new ForbiddenException(
            'You do not have permission to modify a Lead outside your ownership',
          );
        }
        const oldValues: Record<string, unknown> = {}; const newValues: Record<string, unknown> = {}; const appliedForLead: string[] = [];
        for (const finding of group) {
          const current = isAllowedCleaningField(finding.fieldName) ? getLeadFieldValue(lead, finding.fieldName) : (lead as unknown as Record<string, unknown>)[finding.fieldName];
          if (previouslyAppliedIds.includes(finding.id) || newlyAppliedIds.includes(finding.id)) { results.push({ findingId: finding.id, leadId, fieldName: finding.fieldName, oldValue: current, newValue: finding.proposedValue, status: 'SKIPPED', skipReason: 'Finding has already been applied' }); continue; }
          if (finding.safeToApply !== true) { results.push({ findingId: finding.id, leadId, fieldName: finding.fieldName, oldValue: current, newValue: finding.proposedValue, status: 'SKIPPED', skipReason: 'Finding is not safe to apply automatically' }); continue; }
          if (!isAllowedCleaningField(finding.fieldName)) { results.push({ findingId: finding.id, leadId, fieldName: finding.fieldName, oldValue: finding.currentValue, newValue: finding.proposedValue, status: 'SKIPPED', skipReason: 'Field is not whitelisted for automated updates' }); continue; }
          const normalize = (value: unknown) => {
            if (value == null) return '';
            if (typeof value === 'string') return value.trim();
            if (
              typeof value === 'number' ||
              typeof value === 'boolean' ||
              typeof value === 'bigint' ||
              typeof value === 'symbol'
            ) {
              return String(value);
            }
            return JSON.stringify(value) ?? '';
          };
          if (normalize(current) !== normalize(finding.currentValue)) { results.push({ findingId: finding.id, leadId, fieldName: finding.fieldName, oldValue: current, newValue: finding.proposedValue, status: 'SKIPPED', skipReason: 'Lead data has changed since scan was run' }); continue; }
          if (finding.fieldName === 'email') {
            const email = String(finding.proposedValue).trim().toLowerCase();
            const duplicate = await manager.findOne(Lead, { where: { email } });
            if (duplicate && duplicate.id !== lead.id) { results.push({ findingId: finding.id, leadId, fieldName: finding.fieldName, oldValue: current, newValue: email, status: 'SKIPPED', skipReason: 'Email is already taken by another lead' }); continue; }
            oldValues.email = lead.email; lead.email = email; newValues.email = email;
          } else { oldValues[finding.fieldName] = current; setLeadFieldValue(lead, finding.fieldName, finding.proposedValue); newValues[finding.fieldName] = finding.proposedValue; }
          appliedForLead.push(finding.id); newlyAppliedIds.push(finding.id);
          results.push({ findingId: finding.id, leadId, fieldName: finding.fieldName, oldValue: finding.currentValue, newValue: finding.proposedValue, status: 'APPLIED' });
        }
        if (Object.keys(newValues).length > 0) {
          await manager.save(lead);
          const audit = manager.create(AuditLog, { userId: actorId, action: 'LEAD_DATA_CLEANED', entityType: 'Lead', entityId: lead.id, oldValue: oldValues, newValue: newValues, metadata: { workflowRunId, appliedFindingIds: appliedForLead, modifiedFields: Object.keys(newValues) }, ipAddress: null, userAgent: null });
          await manager.save(audit);
        }
      }
      const appliedCount = results.filter((item) => item.status === 'APPLIED').length;
      const skippedCount = results.filter((item) => item.status === 'SKIPPED').length;
      targetRun.outputPayload = { ...currentOutput, appliedFindingIds: Array.from(new Set([...previouslyAppliedIds, ...newlyAppliedIds])), appliedStats: [...(currentOutput.appliedStats || []), { appliedAt: new Date().toISOString(), userId: actorId, appliedCount, skippedCount, totalRequested: dto.acceptedFindingIds.length }] } as Record<string, any>;
      await manager.save(targetRun);
      return { workflowRunId, appliedCount, skippedCount, totalRequested: dto.acceptedFindingIds.length, results };
    });
    this.logger.log('Applied ' + result.appliedCount + ' findings for WorkflowRun ' + workflowRunId);
    return result;
  }

  async getInternalScanContext(
    workflowRunId: string,
  ): Promise<Record<string, unknown>> {
    const run = await this.workflowRunRepository.findOne({
      where: { id: workflowRunId, workflowName: 'UC10_DATA_CLEANING' },
    });
    if (!run)
      throw new NotFoundException('Data cleaning WorkflowRun not found');
    const output = (run.outputPayload as unknown as ScanOutputPayload) || {};
    const findings = output.findings ?? [];
    return {
      workflowRunId: run.id,
      status: run.status,
      triggeredByUserId: run.triggeredByUserId,
      input: run.inputPayload,
      summary: output.summary ?? null,
      findingsCount: findings.length,
      requiresHumanReview: findings.some(
        (finding) => finding.requiresHumanApproval || !finding.safeToApply,
      ),
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
    };
  }

  /** Ensure exactly one reviewer notification after the scan callback is persisted. */
  async ensureScanReviewerNotification(
    workflowRunId: string,
    idempotencyKey: string,
  ): Promise<Record<string, unknown>> {
    if (idempotencyKey !== workflowRunId) {
      throw new BadRequestException('Idempotency-Key must equal workflowRunId');
    }
    return this.dataSource.transaction(async (manager) => {
      const runRepo = manager.getRepository(WorkflowRun);
      const notificationRepo = manager.getRepository(Notification);
      const run = await runRepo.findOne({
        where: { id: workflowRunId, workflowName: 'UC10_DATA_CLEANING' },
        lock: { mode: 'pessimistic_write' },
      });
      if (!run)
        throw new NotFoundException('Data cleaning WorkflowRun not found');
      if (
        ![WorkflowStatus.SUCCESS, WorkflowStatus.PARTIAL].includes(run.status)
      ) {
        throw new ConflictException(
          'Scan callback must complete before reviewer notification',
        );
      }
      const output = (run.outputPayload as unknown as ScanOutputPayload) || {};
      const findings = output.findings ?? [];
      const reviewRequired = findings.some(
        (finding) => finding.requiresHumanApproval || !finding.safeToApply,
      );
      if (!reviewRequired)
        return {
          workflowRunId,
          reviewRequired: false,
          notificationFound: false,
        };
      const recipientId = run.triggeredByUserId;
      if (!recipientId) {
        return {
          workflowRunId,
          reviewRequired: true,
          notificationFound: false,
          reason: 'WorkflowRun has no requesting user',
        };
      }
      const key = `wf08:${workflowRunId}:${recipientId}`;
      let notification = await notificationRepo.findOne({
        where: { idempotencyKey: key },
      });
      const reused = Boolean(notification);
      if (!notification) {
        notification = await notificationRepo.save(
          notificationRepo.create({
            userId: recipientId,
            type: NotificationType.HUMAN_REVIEW_REQUIRED,
            title: 'Data cleaning scan requires review',
            content: `Data cleaning scan ${workflowRunId} contains findings requiring human review.`,
            leadId: null,
            customerId: null,
            reviewTaskId: null,
            isRead: false,
            readAt: null,
            idempotencyKey: key,
          }),
        );
      }
      run.outputPayload = {
        ...(run.outputPayload ?? {}),
        reviewNotificationId: notification.id,
      };
      await runRepo.save(run);
      return {
        workflowRunId,
        reviewRequired: true,
        notificationFound: true,
        notificationId: notification.id,
        reused,
      };
    });
  }
}
