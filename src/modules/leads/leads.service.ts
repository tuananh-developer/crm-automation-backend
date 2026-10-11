import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { Lead } from './entities/lead.entity.js';
import { LeadSource } from './entities/lead-source.entity.js';
import { User } from '../users/entities/user.entity.js';
import { Customer } from '../customers/entities/customer.entity.js';
import { AuditLog } from '../audit/entities/audit-log.entity.js';
import { LeadStatus } from './enums/lead.enum.js';
import { RabbitMQService } from '../../infrastructure/rabbitmq/rabbitmq.service.js';
import {
  ConvertLeadDto,
  CreateLeadDto,
  CreateLeadSourceDto,
  QueryLeadDto,
  UpdateLeadDto,
} from './dto/index.js';

export type CustomerMatchSource = 'EMAIL' | 'PHONE';

export interface ConvertLeadResult {
  lead: Lead;
  customer: Customer;
  customerCreated: boolean;
  matchedBy: CustomerMatchSource | null;
  message: string;
}

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    @InjectRepository(Lead)
    private readonly leadsRepository: Repository<Lead>,
    @InjectRepository(LeadSource)
    private readonly leadSourcesRepository: Repository<LeadSource>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Customer)
    private readonly customersRepository: Repository<Customer>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
    private readonly dataSource: DataSource,
    private readonly rabbitmqService: RabbitMQService,
  ) {}

  async create(dto: CreateLeadDto): Promise<Lead> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    // 1. Check duplicate lead by email
    const existing = await this.leadsRepository.findOne({
      where: { email: normalizedEmail },
    });
    if (existing) {
      throw new ConflictException(
        `Lead with email '${normalizedEmail}' already exists (ID: ${existing.id})`,
      );
    }

    // 2. Validate lead source
    const source = await this.leadSourcesRepository.findOne({
      where: { id: dto.sourceId },
    });
    if (!source) {
      throw new NotFoundException(
        `LeadSource with ID '${dto.sourceId}' not found`,
      );
    }
    if (!source.isActive) {
      throw new BadRequestException(
        `LeadSource '${source.name}' is currently inactive`,
      );
    }

    // 3. Validate owner if provided
    if (dto.ownerId) {
      const owner = await this.usersRepository.findOne({
        where: { id: dto.ownerId },
      });
      if (!owner) {
        throw new NotFoundException(`User with ID '${dto.ownerId}' not found`);
      }
    }

    // 4. Create and save lead
    const lead = this.leadsRepository.create({
      ...dto,
      email: normalizedEmail,
      status: LeadStatus.NEW,
    });

    try {
      const savedLead = await this.leadsRepository.save(lead);
      this.logger.log(`Created new lead ${savedLead.id} (${savedLead.email})`);

      // 5. Publish lead.created event to RabbitMQ
      await this.rabbitmqService.publishLeadCreated(savedLead.id);

      return savedLead;
    } catch (error: unknown) {
      if (
        error instanceof QueryFailedError &&
        ((error as unknown as { code?: string }).code === '23505' ||
          (error as unknown as { driverError?: { code?: string } }).driverError
            ?.code === '23505' ||
          error.message?.includes('duplicate key') ||
          error.message?.includes('violates unique constraint'))
      ) {
        throw new ConflictException(
          `Lead with email '${normalizedEmail}' already exists`,
        );
      }
      throw error;
    }
  }

  async findAll(query: QueryLeadDto): Promise<{
    data: Lead[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 10;
    const skip = (page - 1) * limit;

    const qb = this.leadsRepository
      .createQueryBuilder('lead')
      .leftJoinAndSelect('lead.source', 'source')
      .leftJoinAndSelect('lead.owner', 'owner');

    if (query.status) {
      qb.andWhere('lead.status = :status', { status: query.status });
    }

    if (query.sourceId) {
      qb.andWhere('lead.sourceId = :sourceId', { sourceId: query.sourceId });
    }

    if (query.ownerId) {
      qb.andWhere('lead.ownerId = :ownerId', { ownerId: query.ownerId });
    }

    if (query.search && query.search.trim()) {
      const search = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        "(LOWER(lead.firstName) LIKE :search OR LOWER(COALESCE(lead.lastName, '')) LIKE :search OR LOWER(lead.email) LIKE :search OR LOWER(COALESCE(lead.companyName, '')) LIKE :search)",
        { search },
      );
    }

    const allowedSortFields = [
      'createdAt',
      'updatedAt',
      'firstName',
      'lastName',
      'email',
      'companyName',
      'status',
    ];
    const sortBy = allowedSortFields.includes(query.sortBy || '')
      ? (query.sortBy as string)
      : 'createdAt';
    const sortOrder = query.sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    qb.orderBy(`lead.${sortBy}`, sortOrder);

    const [data, total] = await qb.skip(skip).take(limit).getManyAndCount();
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  async findOne(id: string): Promise<Lead> {
    const lead = await this.leadsRepository.findOne({
      where: { id },
      relations: {
        source: true,
        owner: true,
        qualifications: true,
        enrichments: true,
        scores: true,
        interactions: true,
      },
    });

    if (!lead) {
      throw new NotFoundException(`Lead with ID '${id}' not found`);
    }

    return lead;
  }

  async update(id: string, dto: UpdateLeadDto): Promise<Lead> {
    const lead = await this.findOne(id);

    // If updating email, check uniqueness
    if (dto.email) {
      const normalizedEmail = dto.email.trim().toLowerCase();
      if (normalizedEmail !== lead.email) {
        const existing = await this.leadsRepository.findOne({
          where: { email: normalizedEmail },
        });
        if (existing && existing.id !== id) {
          throw new ConflictException(
            `Email '${normalizedEmail}' is already taken by another lead`,
          );
        }
        lead.email = normalizedEmail;
      }
    }

    // If updating source, validate
    if (dto.sourceId && dto.sourceId !== lead.sourceId) {
      const source = await this.leadSourcesRepository.findOne({
        where: { id: dto.sourceId },
      });
      if (!source) {
        throw new NotFoundException(
          `LeadSource with ID '${dto.sourceId}' not found`,
        );
      }
      if (!source.isActive) {
        throw new BadRequestException(
          `LeadSource '${source.name}' is currently inactive`,
        );
      }
      lead.sourceId = dto.sourceId;
    }

    // If updating owner, validate
    if (dto.ownerId !== undefined) {
      if (dto.ownerId) {
        const owner = await this.usersRepository.findOne({
          where: { id: dto.ownerId },
        });
        if (!owner) {
          throw new NotFoundException(
            `User with ID '${dto.ownerId}' not found`,
          );
        }
        lead.ownerId = dto.ownerId;
      } else {
        lead.ownerId = null;
      }
    }

    if (dto.firstName !== undefined) lead.firstName = dto.firstName;
    if (dto.lastName !== undefined) lead.lastName = dto.lastName ?? null;
    if (dto.phone !== undefined) lead.phone = dto.phone ?? null;
    if (dto.companyName !== undefined)
      lead.companyName = dto.companyName ?? null;
    if (dto.companyWebsite !== undefined)
      lead.companyWebsite = dto.companyWebsite ?? null;
    if (dto.jobTitle !== undefined) lead.jobTitle = dto.jobTitle ?? null;
    if (dto.companySize !== undefined)
      lead.companySize = dto.companySize ?? null;
    if (dto.industry !== undefined) lead.industry = dto.industry ?? null;
    if (dto.status !== undefined) lead.status = dto.status;
    if (dto.notes !== undefined) lead.notes = dto.notes ?? null;

    const updated = await this.leadsRepository.save(lead);
    this.logger.log(`Updated lead ${updated.id}`);
    return updated;
  }

  async remove(id: string): Promise<{ success: boolean; message: string }> {
    const lead = await this.findOne(id);
    await this.leadsRepository.remove(lead);
    this.logger.log(`Deleted lead ${id}`);
    return {
      success: true,
      message: `Lead '${id}' has been removed successfully`,
    };
  }

  // --- Lead Conversion (UC08) ---

  async convert(id: string, dto: ConvertLeadDto): Promise<ConvertLeadResult> {
    const user = await this.usersRepository.findOne({
      where: { id: dto.userId },
    });
    if (!user) {
      throw new NotFoundException(`User with ID '${dto.userId}' not found`);
    }

    const result = await this.dataSource.transaction(async (manager) => {
      const leadRepository = manager.getRepository(Lead);
      const customerRepository = manager.getRepository(Customer);
      const auditLogRepository = manager.getRepository(AuditLog);

      const lead = await leadRepository.findOne({ where: { id } });
      if (!lead) {
        throw new NotFoundException(`Lead with ID '${id}' not found`);
      }

      if (
        lead.status === LeadStatus.CONVERTED ||
        lead.convertedCustomerId !== null
      ) {
        throw new ConflictException(
          `Lead with ID '${id}' has already been converted to customer '${lead.convertedCustomerId}'`,
        );
      }

      if (lead.status !== LeadStatus.QUALIFIED) {
        throw new BadRequestException(
          `Only ${LeadStatus.QUALIFIED} leads can be converted. Lead '${id}' is currently '${lead.status}'`,
        );
      }

      const normalizedEmail = lead.email.trim().toLowerCase();

      // Serialize concurrent conversions of leads sharing the same email so a
      // single customer row is created instead of duplicates.
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `customer-email:${normalizedEmail}`,
      ]);

      const duplicate = await this.findDuplicateCustomer(
        customerRepository,
        lead,
      );

      let customer = duplicate.customer;
      let customerCreated = false;

      if (customer) {
        this.logger.log(
          `Reusing existing customer ${customer.id} for lead ${lead.id} (matched by ${duplicate.matchedBy})`,
        );
      } else {
        customer = await customerRepository.save(
          customerRepository.create({
            name: this.buildCustomerName(lead),
            email: normalizedEmail,
            phone: lead.phone,
            companyName: lead.companyName,
            companyWebsite: lead.companyWebsite,
            jobTitle: lead.jobTitle,
            companySize: lead.companySize,
            industry: lead.industry,
            status: null,
            createdBy: user.id,
            updatedBy: null,
            notes: lead.notes,
          }),
        );
        customerCreated = true;
      }

      const oldValue = {
        status: lead.status,
        convertedCustomerId: lead.convertedCustomerId,
        convertedBy: lead.convertedBy,
        convertedAt: lead.convertedAt,
      };

      lead.convertedCustomerId = customer.id;
      lead.status = LeadStatus.CONVERTED;
      lead.convertedBy = user.id;
      lead.convertedAt = new Date();

      const savedLead = await leadRepository.save(lead);

      await auditLogRepository.save(
        auditLogRepository.create({
          userId: user.id,
          action: 'LEAD_CONVERTED',
          entityType: 'Lead',
          entityId: lead.id,
          oldValue,
          newValue: {
            status: savedLead.status,
            convertedCustomerId: savedLead.convertedCustomerId,
            convertedBy: savedLead.convertedBy,
            convertedAt: savedLead.convertedAt,
          },
          metadata: {
            customerId: customer.id,
            customerCreated,
            matchedBy: duplicate.matchedBy,
            customerName: customer.name,
            customerEmail: customer.email,
            leadEmail: lead.email,
            leadName: this.buildCustomerName(lead),
          },
          ipAddress: null,
          userAgent: null,
        }),
      );

      return {
        lead: savedLead,
        customer,
        customerCreated,
        matchedBy: duplicate.matchedBy,
      };
    });

    this.logger.log(
      `Converted lead ${id} to customer ${result.customer.id} (customer created: ${result.customerCreated})`,
    );

    return {
      ...result,
      message: result.customerCreated
        ? `Lead '${id}' has been converted to new customer '${result.customer.id}'`
        : `Lead '${id}' has been converted to existing customer '${result.customer.id}'`,
    };
  }

  private async findDuplicateCustomer(
    customerRepository: Repository<Customer>,
    lead: Lead,
  ): Promise<{
    customer: Customer | null;
    matchedBy: CustomerMatchSource | null;
  }> {
    const normalizedEmail = lead.email.trim().toLowerCase();

    const byEmail = await customerRepository.find({
      where: { email: normalizedEmail },
      order: { createdAt: 'ASC' },
      take: 2,
    });
    this.assertNoAmbiguousDuplicates(byEmail, `email '${normalizedEmail}'`);

    if (byEmail.length === 1) {
      return { customer: byEmail[0], matchedBy: 'EMAIL' };
    }

    const phone = lead.phone?.trim();
    if (phone) {
      const byPhone = await customerRepository.find({
        where: { phone },
        order: { createdAt: 'ASC' },
        take: 2,
      });
      this.assertNoAmbiguousDuplicates(byPhone, `phone '${phone}'`);

      if (byPhone.length === 1) {
        return { customer: byPhone[0], matchedBy: 'PHONE' };
      }
    }

    return { customer: null, matchedBy: null };
  }

  private assertNoAmbiguousDuplicates(
    customers: Customer[],
    criteria: string,
  ): void {
    if (customers.length > 1) {
      throw new ConflictException(
        `Duplicate customer data detected for ${criteria} (IDs: ${customers
          .map((customer) => customer.id)
          .join(
            ', ',
          )}). Resolve duplicate customers before converting the lead`,
      );
    }
  }

  private buildCustomerName(lead: Lead): string {
    const fullName = [lead.firstName, lead.lastName]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(' ')
      .trim();

    return fullName || lead.email.trim();
  }

  // --- Lead Sources Management ---

  async findAllSources(): Promise<LeadSource[]> {
    return this.leadSourcesRepository.find({
      order: { name: 'ASC' },
    });
  }

  async findSourceOne(id: string): Promise<LeadSource> {
    const source = await this.leadSourcesRepository.findOne({ where: { id } });
    if (!source) {
      throw new NotFoundException(`LeadSource with ID '${id}' not found`);
    }
    return source;
  }

  async createSource(dto: CreateLeadSourceDto): Promise<LeadSource> {
    const trimmedName = dto.name.trim();
    const existing = await this.leadSourcesRepository.findOne({
      where: { name: trimmedName },
    });
    if (existing) {
      throw new ConflictException(
        `LeadSource with name '${trimmedName}' already exists`,
      );
    }

    const source = this.leadSourcesRepository.create({
      name: trimmedName,
      description: dto.description ?? null,
      isActive: dto.isActive ?? true,
    });

    try {
      return await this.leadSourcesRepository.save(source);
    } catch (error: unknown) {
      if (
        error instanceof QueryFailedError &&
        ((error as unknown as { code?: string }).code === '23505' ||
          (error as unknown as { driverError?: { code?: string } }).driverError
            ?.code === '23505' ||
          error.message?.includes('duplicate key') ||
          error.message?.includes('violates unique constraint'))
      ) {
        throw new ConflictException(
          `LeadSource with name '${trimmedName}' already exists`,
        );
      }
      throw error;
    }
  }
}
