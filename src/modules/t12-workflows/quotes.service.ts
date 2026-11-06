import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource, In, Repository } from 'typeorm';
import { isUUID } from 'class-validator';
import { Lead } from '../leads/entities/lead.entity.js';
import { Customer } from '../customers/entities/customer.entity.js';
import { UserRole, UserStatus } from '../users/enums/user.enum.js';
import { User } from '../users/entities/user.entity.js';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';
import { WorkflowRun } from '../workflow/entities/workflow-run.entity.js';
import { WorkflowStatus } from '../workflow/enums/workflow.enum.js';
import { Notification } from '../notifications/entities/notification.entity.js';
import { NotificationType } from '../notifications/enums/notification.enum.js';
import { ProductCatalogItem } from './entities/product-catalog-item.entity.js';
import { Quote } from './entities/quote.entity.js';
import { QuoteItem } from './entities/quote-item.entity.js';
import { QuoteApproval } from './entities/quote-approval.entity.js';
import { N8nWorkflowDispatchService } from './n8n-workflow-dispatch.service.js';
import { hasSamePayload, isPostgresUniqueViolation } from '../../common/utils/idempotency.util.js';
import {
  CreateCatalogItemDto,
  CreateQuoteInternalDto,
  DecideQuoteApprovalDto,
  QuotePricePreviewDto,
  StartQuoteDraftDto,
  SubmitQuoteApprovalDto,
  UpdateCatalogItemDto,
} from './dto/index.js';
import { calculateQuotePrice } from './utils/quote-pricing.util.js';

export const WF12_NAME = 'T12-WF12_QUOTE_PROPOSAL';

@Injectable()
export class QuotesService {
  constructor(
    @InjectRepository(WorkflowRun)
    private readonly runs: Repository<WorkflowRun>,
    @InjectRepository(Lead) private readonly leads: Repository<Lead>,
    @InjectRepository(Customer)
    private readonly customers: Repository<Customer>,
    @InjectRepository(ProductCatalogItem)
    private readonly catalog: Repository<ProductCatalogItem>,
    @InjectRepository(Quote) private readonly quotes: Repository<Quote>,
    @InjectRepository(QuoteItem)
    private readonly quoteItems: Repository<QuoteItem>,
    @InjectRepository(QuoteApproval)
    private readonly approvals: Repository<QuoteApproval>,
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly dispatcher: N8nWorkflowDispatchService,
    private readonly config: ConfigService,
  ) {}

  private requireKey(key?: string): string {
    if (!key || key.length < 8 || key.length > 180)
      throw new BadRequestException('Idempotency-Key header is required');
    return key;
  }

  private async assertActorTarget(
    dto: { customerId?: string | null; leadId?: string | null },
    actor: AuthenticatedUser,
  ) {
    if (Boolean(dto.customerId) === Boolean(dto.leadId))
      throw new BadRequestException(
        'Exactly one of customerId or leadId is required',
      );
    if (dto.leadId) {
      const lead = await this.leads.findOne({ where: { id: dto.leadId } });
      if (!lead || (actor.role !== UserRole.ADMIN && lead.ownerId !== actor.id))
        throw new NotFoundException('Lead not found');
      return { leadId: lead.id, customerId: null, ownerId: lead.ownerId };
    }
    const customer = await this.customers.findOne({
      where: { id: dto.customerId! },
    });
    if (
      !customer ||
      (actor.role !== UserRole.ADMIN && customer.createdBy !== actor.id)
    )
      throw new NotFoundException('Customer not found');
    return {
      leadId: null,
      customerId: customer.id,
      ownerId: customer.createdBy,
    };
  }

  async requestDraft(dto: StartQuoteDraftDto, actor: AuthenticatedUser, rawKey?: string) {
    const target = await this.assertActorTarget(dto, actor);
    const idempotencyKey = 'WF12:' + actor.id + ':' + this.requireKey(rawKey);
    const requestedIds = [...new Set(dto.requestedItems.map((item) => item.catalogItemId))];
    const catalogItems = await this.catalog.find({ where: { id: In(requestedIds), isActive: true } });
    if (catalogItems.length !== requestedIds.length) throw new BadRequestException('One or more requested catalog items are unavailable');
    const currency = dto.currency.toUpperCase();
    if (catalogItems.some((item) => item.currency !== currency)) throw new BadRequestException('All catalog items must use the requested currency');
    const inputPayload = { ...target, requestedItems: dto.requestedItems, requirements: dto.requirements ?? null, currency };
    const reuseExisting = (existing: WorkflowRun) => {
      if (existing.workflowName !== WF12_NAME) throw new ConflictException('Idempotency key is already used by another workflow');
      if (!hasSamePayload(existing.inputPayload, inputPayload)) throw new ConflictException('Idempotency key was already used with a different quote payload');
      return { workflowRunId: existing.id, status: existing.status, reused: true };
    };
    const existing = await this.runs.findOne({ where: { idempotencyKey } });
    if (existing) return reuseExisting(existing);
    let run: WorkflowRun;
    try {
      run = await this.runs.save(this.runs.create({ workflowName: WF12_NAME, idempotencyKey, leadId: target.leadId, customerId: target.customerId, triggeredByUserId: actor.id, status: WorkflowStatus.PENDING, inputPayload, outputPayload: null, errorMessage: null, startedAt: new Date(), finishedAt: null }));
    } catch (error) {
      if (!isPostgresUniqueViolation(error)) throw error;
      const concurrent = await this.runs.findOne({ where: { idempotencyKey } });
      if (!concurrent) throw error;
      return reuseExisting(concurrent);
    }
    try {
      await this.dispatcher.dispatch('N8N_WF12_WEBHOOK_URL', 'internal/t12-wf12-quote-proposal', { workflowRunId: run.id, customerId: target.customerId, leadId: target.leadId, requestedItems: dto.requestedItems, requirements: dto.requirements ?? null, currency, requestedBy: actor.id, idempotencyKey: run.id });
      // A fast callback may move the run to a terminal state before dispatch returns.
      await this.runs.update(
        { id: run.id, status: WorkflowStatus.PENDING },
        { status: WorkflowStatus.RUNNING },
      );
      const latest = await this.runs.findOne({ where: { id: run.id } });
      return {
        workflowRunId: run.id,
        status: latest?.status ?? WorkflowStatus.RUNNING,
        reused: false,
      };
    } catch (error) {
      await this.runs.update(
        { id: run.id, status: In([WorkflowStatus.PENDING, WorkflowStatus.RUNNING]) },
        {
          status: WorkflowStatus.FAILED,
          errorMessage: error instanceof Error ? error.message.slice(0, 1000) : 'n8n dispatch failed',
          finishedAt: new Date(),
        },
      );
      const latest = await this.runs.findOne({ where: { id: run.id } });
      if (latest && [WorkflowStatus.SUCCESS, WorkflowStatus.PARTIAL].includes(latest.status)) {
        return { workflowRunId: run.id, status: latest.status, reused: false };
      }
      throw error instanceof ServiceUnavailableException ? error : new ServiceUnavailableException('Unable to dispatch Quote & Proposal workflow');
    }
  }

  private async getRun(workflowRunId: string) {
    if (!isUUID(workflowRunId))
      throw new BadRequestException('workflowRunId must be a UUID');
    const run = await this.runs.findOne({
      where: { id: workflowRunId, workflowName: WF12_NAME },
    });
    if (!run) throw new NotFoundException('Quote workflow run not found');
    return run;
  }

  async getEntityContext(
    customerId?: string,
    leadId?: string,
    workflowRunId?: string,
  ) {
    if (!workflowRunId || Boolean(customerId) === Boolean(leadId))
      throw new BadRequestException(
        'workflowRunId and exactly one entity ID are required',
      );
    if ((customerId && !isUUID(customerId)) || (leadId && !isUUID(leadId)))
      throw new BadRequestException('Entity ID must be a UUID');
    const run = await this.getRun(workflowRunId);
    if (
      (customerId && run.customerId !== customerId) ||
      (leadId && run.leadId !== leadId)
    )
      throw new NotFoundException(
        'Quote workflow run does not belong to this entity',
      );
    if (leadId) {
      const lead = await this.leads.findOne({
        where: { id: leadId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          companyName: true,
          companyWebsite: true,
          jobTitle: true,
          industry: true,
          ownerId: true,
        },
      });
      if (!lead) throw new NotFoundException('Lead not found');
      return { entityType: 'Lead', entity: lead, workflowRunId };
    }
    const customer = await this.customers.findOne({
      where: { id: customerId! },
      select: {
        id: true,
        name: true,
        email: true,
        companyName: true,
        companyWebsite: true,
        jobTitle: true,
        industry: true,
        createdBy: true,
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return { entityType: 'Customer', entity: customer, workflowRunId };
  }

  async listCatalogForRun(workflowRunId: string) {
    await this.getRun(workflowRunId);
    return {
      items: await this.catalog.find({
        where: { isActive: true },
        order: { sku: 'ASC' },
        select: {
          id: true,
          sku: true,
          name: true,
          description: true,
          unitPrice: true,
          currency: true,
          taxRatePercent: true,
        },
      }),
    };
  }

  private async canonicalPrice(
    dto: QuotePricePreviewDto | CreateQuoteInternalDto,
  ) {
    const run = await this.getRun(dto.workflowRunId);
    if (
      ![
        WorkflowStatus.RUNNING,
        WorkflowStatus.PENDING,
        WorkflowStatus.SUCCESS,
        WorkflowStatus.PARTIAL,
      ].includes(run.status)
    )
      throw new ConflictException('Quote workflow is not eligible for pricing');
    const input = run.inputPayload ?? {};
    if (
      (dto.leadId ?? null) !== (run.leadId ?? null) ||
      (dto.customerId ?? null) !== (run.customerId ?? null)
    )
      throw new BadRequestException('Quote entity does not match WorkflowRun');
    const requested = (input.requestedItems ?? []) as Array<{
      catalogItemId: string;
      quantity: number;
    }>;
    const passed = dto.items;
    const normalizedRequested = [...requested].sort((a, b) =>
      a.catalogItemId.localeCompare(b.catalogItemId),
    );
    const normalizedPassed = [...passed].sort((a, b) =>
      a.catalogItemId.localeCompare(b.catalogItemId),
    );
    if (
      JSON.stringify(normalizedRequested) !== JSON.stringify(normalizedPassed)
    )
      throw new BadRequestException(
        'Line item IDs and quantities must match the original request; AI cannot add or change products',
      );
    const currency = String(input.currency ?? '').toUpperCase();
    if (dto.currency.toUpperCase() !== currency)
      throw new BadRequestException(
        'Currency must match the original quote request',
      );
    const ids = requested.map((item) => item.catalogItemId);
    const catalog = await this.catalog.find({
      where: { id: In(ids), isActive: true },
    });
    if (catalog.length !== new Set(ids).size)
      throw new BadRequestException('Catalog item unavailable or inactive');
    if (catalog.some((item) => item.currency !== currency))
      throw new BadRequestException('Catalog currency mismatch');
    const map = new Map(catalog.map((item) => [item.id, item]));
    const lines = requested.map((item) => {
      const product = map.get(item.catalogItemId)!;
      return {
        catalogItemId: product.id,
        sku: product.sku,
        name: product.name,
        description: product.description,
        quantity: item.quantity,
        unitPrice: product.unitPrice,
        taxRatePercent: product.taxRatePercent,
      };
    });
    const threshold = Number(
      this.config.get<string>('QUOTE_APPROVAL_THRESHOLD') ?? '0',
    );
    return {
      run,
      input,
      lines,
      priced: calculateQuotePrice(lines, currency, threshold),
    };
  }

  async pricePreview(dto: QuotePricePreviewDto, headerKey?: string) {
    if (
      headerKey !== dto.idempotencyKey ||
      dto.idempotencyKey !== dto.workflowRunId
    )
      throw new BadRequestException('Idempotency-Key must equal workflowRunId');
    const { priced } = await this.canonicalPrice(dto);
    return { workflowRunId: dto.workflowRunId, ...priced };
  }

  async saveDraft(dto: CreateQuoteInternalDto) {
    const { run, priced } = await this.canonicalPrice({
      ...dto,
      idempotencyKey: dto.workflowRunId,
    });
    const existing = await this.quotes.findOne({
      where: { workflowRunId: run.id },
    });
    if (existing)
      return {
        id: existing.id,
        workflowRunId: run.id,
        status: existing.status,
        totalAmount: existing.totalAmount,
        approvalRequired: existing.approvalRequired,
        reused: true,
      };
    return this.dataSource.transaction(async (manager) => {
      const quoteRepo = manager.getRepository(Quote);
      const lineRepo = manager.getRepository(QuoteItem);
      const runRepo = manager.getRepository(WorkflowRun);
      const quote = await quoteRepo.save(
        quoteRepo.create({
          workflowRunId: run.id,
          createdBy: run.triggeredByUserId!,
          customerId: run.customerId,
          leadId: run.leadId,
          title: dto.title,
          executiveSummary: dto.executiveSummary ?? null,
          body: dto.body ?? null,
          currency: priced.currency,
          subtotal: priced.subtotal,
          discountTotal: priced.discountTotal,
          taxTotal: priced.taxTotal,
          totalAmount: priced.totalAmount,
          status: 'DRAFT',
          approvalRequired: priced.approvalRequired,
          submittedForApprovalAt: null,
          approvedBy: null,
          approvedAt: null,
          rejectionReason: null,
          pricingSnapshot: priced as unknown as Record<string, unknown>,
        }),
      );
      for (const line of priced.items) {
        await lineRepo.save(
          lineRepo.create({
            quoteId: quote.id,
            catalogItemId: line.catalogItemId,
            sku: line.sku,
            nameSnapshot: line.name,
            descriptionSnapshot: line.description,
            quantity: line.quantity,
            unitPriceSnapshot: String(line.unitPrice),
            taxRatePercent: String(line.taxRatePercent),
            lineSubtotal: line.lineSubtotal,
            lineDiscount: line.lineDiscount,
            lineTax: line.lineTax,
            lineTotal: line.lineTotal,
          }),
        );
      }
      run.status = priced.approvalRequired
        ? WorkflowStatus.PARTIAL
        : WorkflowStatus.SUCCESS;
      run.outputPayload = {
        ...(run.outputPayload ?? {}),
        quoteId: quote.id,
        quoteStatus: quote.status,
        approvalRequired: priced.approvalRequired,
        pricingSource: 'BACKEND_CATALOG',
      };
      run.finishedAt = priced.approvalRequired ? null : new Date();
      await runRepo.save(run);
      return {
        id: quote.id,
        workflowRunId: run.id,
        status: quote.status,
        subtotal: quote.subtotal,
        taxTotal: quote.taxTotal,
        totalAmount: quote.totalAmount,
        currency: quote.currency,
        approvalRequired: quote.approvalRequired,
        reused: false,
      };
    });
  }

  async submitForApproval(
    quoteId: string,
    dto: SubmitQuoteApprovalDto,
    headerKey?: string,
  ) {
    if (
      headerKey !== dto.idempotencyKey ||
      dto.idempotencyKey !== dto.workflowRunId
    )
      throw new BadRequestException('Idempotency-Key must equal workflowRunId');
    const quote = await this.quotes.findOne({
      where: { id: quoteId, workflowRunId: dto.workflowRunId },
    });
    if (!quote) throw new NotFoundException('Quote not found for WorkflowRun');
    if (!quote.approvalRequired)
      return { quoteId, approvalRequired: false, status: quote.status };
    return this.dataSource.transaction(async (manager) => {
      const qRepo = manager.getRepository(Quote);
      const aRepo = manager.getRepository(QuoteApproval);
      const nRepo = manager.getRepository(Notification);
      const current = await qRepo.findOne({
        where: { id: quoteId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!current) throw new NotFoundException('Quote not found');
      let approval = await aRepo.findOne({ where: { quoteId } });
      const reused = Boolean(approval);
      if (!approval)
        approval = await aRepo.save(
          aRepo.create({
            quoteId,
            requestedBy: current.createdBy,
            reviewedBy: null,
            status: 'PENDING',
            decisionComment: null,
            idempotencyKey: `wf12:${dto.workflowRunId}:approval`,
            resolvedAt: null,
          }),
        );
      if (approval.status !== 'PENDING')
        throw new ConflictException('Quote approval has already been resolved');
      if (current.status === 'DRAFT') current.status = 'PENDING_APPROVAL';
      current.submittedForApprovalAt =
        current.submittedForApprovalAt ?? new Date();
      await qRepo.save(current);
      const admins = await manager.getRepository(User).find({
        where: { role: UserRole.ADMIN, status: UserStatus.ACTIVE },
        select: { id: true },
      });
      const recipientIds = [
        ...new Set([current.createdBy, ...admins.map((user) => user.id)]),
      ];
      const createdNotificationIds: string[] = [];
      for (const userId of recipientIds) {
        const key = `wf12:${dto.workflowRunId}:approver:${userId}`;
        let notification = await nRepo.findOne({
          where: { idempotencyKey: key },
        });
        if (!notification) {
          notification = await nRepo.save(
            nRepo.create({
              userId,
              type: NotificationType.HUMAN_REVIEW_REQUIRED,
              title: 'Quote requires approval',
              content: `Quote ${current.id} is ready for approval.`,
              leadId: current.leadId,
              customerId: current.customerId,
              reviewTaskId: null,
              isRead: false,
              readAt: null,
              idempotencyKey: key,
            }),
          );
        }
        createdNotificationIds.push(notification.id);
      }
      return {
        quoteId,
        approvalId: approval.id,
        approvalRequired: true,
        status: current.status,
        notificationIds: createdNotificationIds,
        reused,
      };
    });
  }

  async listCatalog() {
    return this.catalog.find({
      where: { isActive: true },
      order: { sku: 'ASC' },
    });
  }

  async createCatalogItem(dto: CreateCatalogItemDto, actor: AuthenticatedUser) {
    if (actor.role !== UserRole.ADMIN)
      throw new ForbiddenException('Only Admin can manage the product catalog');
    const exists = await this.catalog.findOne({ where: { sku: dto.sku } });
    if (exists) throw new ConflictException('Catalog SKU already exists');
    return this.catalog.save(
      this.catalog.create({
        sku: dto.sku.trim(),
        name: dto.name.trim(),
        description: dto.description ?? null,
        unitPrice: dto.unitPrice.toFixed(2),
        currency: dto.currency.toUpperCase(),
        taxRatePercent: dto.taxRatePercent.toFixed(2),
        isActive: true,
        createdBy: actor.id,
        updatedBy: actor.id,
      }),
    );
  }

  async updateCatalogItem(
    id: string,
    dto: UpdateCatalogItemDto,
    actor: AuthenticatedUser,
  ) {
    if (actor.role !== UserRole.ADMIN)
      throw new ForbiddenException('Only Admin can manage the product catalog');
    const item = await this.catalog.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Catalog item not found');
    if (dto.name !== undefined) item.name = dto.name;
    if (dto.description !== undefined) item.description = dto.description;
    if (dto.unitPrice !== undefined) item.unitPrice = dto.unitPrice.toFixed(2);
    if (dto.taxRatePercent !== undefined)
      item.taxRatePercent = dto.taxRatePercent.toFixed(2);
    if (dto.isActive !== undefined) item.isActive = dto.isActive;
    item.updatedBy = actor.id;
    return this.catalog.save(item);
  }

  async getQuote(quoteId: string, actor: AuthenticatedUser) {
    const quote = await this.quotes.findOne({ where: { id: quoteId } });
    if (
      !quote ||
      (actor.role !== UserRole.ADMIN && quote.createdBy !== actor.id)
    )
      throw new NotFoundException('Quote not found');
    const [items, approval] = await Promise.all([
      this.quoteItems.find({ where: { quoteId }, order: { id: 'ASC' } }),
      this.approvals.findOne({ where: { quoteId } }),
    ]);
    return { ...quote, items, approval };
  }

  async listQuotes(actor: AuthenticatedUser) {
    if (actor.role === UserRole.ADMIN)
      return this.quotes.find({ order: { createdAt: 'DESC' }, take: 100 });
    return this.quotes.find({
      where: { createdBy: actor.id },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async decideApproval(
    quoteId: string,
    dto: DecideQuoteApprovalDto,
    actor: AuthenticatedUser,
    approve: boolean,
  ) {
    if (actor.role !== UserRole.ADMIN)
      throw new ForbiddenException('Only Admin can approve or reject quotes');
    return this.dataSource.transaction(async (manager) => {
      const qRepo = manager.getRepository(Quote);
      const aRepo = manager.getRepository(QuoteApproval);
      const quote = await qRepo.findOne({
        where: { id: quoteId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!quote) throw new NotFoundException('Quote not found');
      const approval = await aRepo.findOne({ where: { quoteId } });
      if (!approval)
        throw new NotFoundException('Quote approval request not found');
      if (approval.status !== 'PENDING')
        throw new ConflictException('Quote approval has already been resolved');
      approval.status = approve ? 'APPROVED' : 'REJECTED';
      approval.reviewedBy = actor.id;
      approval.decisionComment = dto.comment ?? null;
      approval.resolvedAt = new Date();
      quote.status = approve ? 'APPROVED' : 'REJECTED';
      quote.approvedBy = approve ? actor.id : null;
      quote.approvedAt = approve ? new Date() : null;
      quote.rejectionReason = approve
        ? null
        : (dto.comment ?? 'Rejected by Admin');
      const runRepo = manager.getRepository(WorkflowRun);
      const run = await runRepo.findOne({
        where: { id: quote.workflowRunId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!run) throw new NotFoundException('Quote WorkflowRun not found');
      // A rejected quote is a completed business decision, not a failed workflow execution.
      run.status = WorkflowStatus.SUCCESS;
      run.finishedAt = new Date();
      run.outputPayload = {
        ...(run.outputPayload ?? {}),
        quoteId,
        quoteStatus: quote.status,
        approvalId: approval.id,
        decidedBy: actor.id,
      };
      await Promise.all([
        aRepo.save(approval),
        qRepo.save(quote),
        runRepo.save(run),
      ]);
      return {
        quoteId,
        status: quote.status,
        approvalId: approval.id,
        workflowRunStatus: run.status,
      };
    });
  }
}
