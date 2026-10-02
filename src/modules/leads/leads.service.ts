import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lead } from './entities/lead.entity.js';
import { LeadSource } from './entities/lead-source.entity.js';
import { User } from '../users/entities/user.entity.js';
import { LeadStatus } from './enums/lead.enum.js';
import { RabbitMQService } from '../../infrastructure/rabbitmq/rabbitmq.service.js';
import {
  CreateLeadDto,
  CreateLeadSourceDto,
  QueryLeadDto,
  UpdateLeadDto,
} from './dto/index.js';

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

    const savedLead = await this.leadsRepository.save(lead);
    this.logger.log(`Created new lead ${savedLead.id} (${savedLead.email})`);

    // 5. Publish lead.created event to RabbitMQ
    await this.rabbitmqService.publishLeadCreated(savedLead.id);

    return savedLead;
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

    return this.leadSourcesRepository.save(source);
  }
}
