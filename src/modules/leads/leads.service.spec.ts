import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { LeadsService } from './leads.service.js';
import { LeadStatus } from './enums/lead.enum.js';
import type { DataSource, EntityManager, Repository } from 'typeorm';
import type { Lead } from './entities/lead.entity.js';
import type { LeadSource } from './entities/lead-source.entity.js';
import type { User } from '../users/entities/user.entity.js';
import { Customer } from '../customers/entities/customer.entity.js';
import { AuditLog } from '../audit/entities/audit-log.entity.js';
import type { RabbitMQService } from '../../infrastructure/rabbitmq/rabbitmq.service.js';

describe('LeadsService', () => {
  let service: LeadsService;
  let leadsRepository: jest.Mocked<Partial<Repository<Lead>>>;
  let leadSourcesRepository: jest.Mocked<Partial<Repository<LeadSource>>>;
  let usersRepository: jest.Mocked<Partial<Repository<User>>>;
  let customersRepository: jest.Mocked<Partial<Repository<Customer>>>;
  let auditLogRepository: jest.Mocked<Partial<Repository<AuditLog>>>;
  let dataSource: jest.Mocked<Partial<DataSource>>;
  let rabbitmqService: jest.Mocked<Partial<RabbitMQService>>;

  const mockSource: LeadSource = {
    id: 'source-123',
    name: 'Website',
    description: 'Company website',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockLead: Lead = {
    id: 'lead-123',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    phone: '+1234567890',
    companyName: 'Acme Corp',
    companyWebsite: 'https://acme.com',
    jobTitle: 'VP Sales',
    companySize: 50,
    industry: 'Technology',
    status: LeadStatus.NEW,
    sourceId: 'source-123',
    ownerId: null,
    convertedCustomerId: null,
    convertedBy: null,
    convertedAt: null,
    notes: 'Initial contact',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockUser: User = {
    id: 'user-123',
    name: 'Sales User',
    email: 'sales@example.com',
    passwordHash: 'hashed',
    role: 'SALES' as User['role'],
    status: 'ACTIVE' as User['status'],
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const buildLead = (overrides: Partial<Lead> = {}): Lead => ({
    ...mockLead,
    ...overrides,
  });

  const buildCustomer = (overrides: Partial<Customer> = {}): Customer => ({
    id: 'customer-123',
    name: 'John Doe',
    email: 'john.doe@example.com',
    phone: '+1234567890',
    companyName: 'Acme Corp',
    companyWebsite: 'https://acme.com',
    jobTitle: 'VP Sales',
    companySize: 50,
    industry: 'Technology',
    status: null,
    createdBy: 'user-123',
    updatedBy: null,
    notes: 'Initial contact',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    leadsRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
      find: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    leadSourcesRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    usersRepository = {
      findOne: jest.fn(),
    };

    customersRepository = {
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    auditLogRepository = {
      create: jest.fn(),
      save: jest.fn(),
    };

    const transactionManager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === Customer) {
          return customersRepository;
        }
        if (entity === AuditLog) {
          return auditLogRepository;
        }
        return leadsRepository;
      }),
      query: jest.fn().mockResolvedValue([]),
    };

    const transactionMock: jest.Mock = jest.fn(
      (runInTransaction: (manager: EntityManager) => Promise<unknown>) =>
        runInTransaction(transactionManager as unknown as EntityManager),
    );

    dataSource = {
      transaction: transactionMock,
    };

    rabbitmqService = {
      publishLeadCreated: jest.fn().mockResolvedValue({
        eventId: 'event-123',
        eventType: 'lead.created',
        version: 1,
        occurredAt: new Date().toISOString(),
        data: { leadId: 'lead-123' },
      }),
    };

    service = new LeadsService(
      leadsRepository as Repository<Lead>,
      leadSourcesRepository as Repository<LeadSource>,
      usersRepository as Repository<User>,
      customersRepository as Repository<Customer>,
      auditLogRepository as Repository<AuditLog>,
      dataSource as DataSource,
      rabbitmqService as RabbitMQService,
    );
  });

  describe('create', () => {
    it('should successfully create a lead and publish event', async () => {
      (leadsRepository.findOne as jest.Mock).mockResolvedValue(null);
      (leadSourcesRepository.findOne as jest.Mock).mockResolvedValue(
        mockSource,
      );
      (leadsRepository.create as jest.Mock).mockReturnValue(mockLead);
      (leadsRepository.save as jest.Mock).mockResolvedValue(mockLead);

      const result = await service.create({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        sourceId: 'source-123',
      });

      expect(result).toEqual(mockLead);
      expect(leadsRepository.findOne).toHaveBeenCalledWith({
        where: { email: 'john.doe@example.com' },
      });
      expect(leadSourcesRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'source-123' },
      });
      expect(rabbitmqService.publishLeadCreated).toHaveBeenCalledWith(
        'lead-123',
      );
    });

    it('should throw ConflictException if lead email already exists', async () => {
      (leadsRepository.findOne as jest.Mock).mockResolvedValue(mockLead);

      await expect(
        service.create({
          firstName: 'John',
          email: 'john.doe@example.com',
          sourceId: 'source-123',
        }),
      ).rejects.toThrow(ConflictException);

      expect(leadsRepository.save).not.toHaveBeenCalled();
      expect(rabbitmqService.publishLeadCreated).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if sourceId does not exist', async () => {
      (leadsRepository.findOne as jest.Mock).mockResolvedValue(null);
      (leadSourcesRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.create({
          firstName: 'John',
          email: 'john.doe@example.com',
          sourceId: 'non-existent-source',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if sourceId is inactive', async () => {
      (leadsRepository.findOne as jest.Mock).mockResolvedValue(null);
      (leadSourcesRepository.findOne as jest.Mock).mockResolvedValue({
        ...mockSource,
        isActive: false,
      });

      await expect(
        service.create({
          firstName: 'John',
          email: 'john.doe@example.com',
          sourceId: 'source-123',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if ownerId does not exist', async () => {
      (leadsRepository.findOne as jest.Mock).mockResolvedValue(null);
      (leadSourcesRepository.findOne as jest.Mock).mockResolvedValue(
        mockSource,
      );
      (usersRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.create({
          firstName: 'John',
          email: 'john.doe@example.com',
          sourceId: 'source-123',
          ownerId: 'non-existent-user',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findOne', () => {
    it('should return lead when found', async () => {
      (leadsRepository.findOne as jest.Mock).mockResolvedValue(mockLead);

      const result = await service.findOne('lead-123');
      expect(result).toEqual(mockLead);
    });

    it('should throw NotFoundException when lead is not found', async () => {
      (leadsRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.findOne('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('should remove lead successfully', async () => {
      (leadsRepository.findOne as jest.Mock).mockResolvedValue(mockLead);
      (leadsRepository.remove as jest.Mock).mockResolvedValue(mockLead);

      const result = await service.remove('lead-123');
      expect(result.success).toBe(true);
      expect(leadsRepository.remove).toHaveBeenCalledWith(mockLead);
    });
  });

  describe('convert', () => {
    const dto = { userId: 'user-123' };

    beforeEach(() => {
      (usersRepository.findOne as jest.Mock).mockResolvedValue(mockUser);
      (customersRepository.create as jest.Mock).mockImplementation(
        (data: Customer) => data,
      );
      (customersRepository.save as jest.Mock).mockImplementation(
        (data: Customer) => Promise.resolve({ ...data, id: 'customer-new' }),
      );
      (leadsRepository.save as jest.Mock).mockImplementation((lead: Lead) =>
        Promise.resolve(lead),
      );
      (auditLogRepository.create as jest.Mock).mockImplementation(
        (data: AuditLog) => data,
      );
      (auditLogRepository.save as jest.Mock).mockResolvedValue({});
    });

    it('should create a new customer and convert a QUALIFIED lead when no customer exists', async () => {
      const qualifiedLead = buildLead({ status: LeadStatus.QUALIFIED });
      (leadsRepository.findOne as jest.Mock).mockResolvedValue(qualifiedLead);
      (customersRepository.find as jest.Mock).mockResolvedValue([]);

      const result = await service.convert('lead-123', dto);

      expect(customersRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { email: 'john.doe@example.com' },
        }),
      );
      expect(customersRepository.create).toHaveBeenCalledWith({
        name: 'John Doe',
        email: 'john.doe@example.com',
        phone: '+1234567890',
        companyName: 'Acme Corp',
        companyWebsite: 'https://acme.com',
        jobTitle: 'VP Sales',
        companySize: 50,
        industry: 'Technology',
        status: null,
        createdBy: 'user-123',
        updatedBy: null,
        notes: 'Initial contact',
      });
      expect(result.customerCreated).toBe(true);
      expect(result.customer.id).toBe('customer-new');

      expect(qualifiedLead.status).toBe(LeadStatus.CONVERTED);
      expect(qualifiedLead.convertedCustomerId).toBe('customer-new');
      expect(qualifiedLead.convertedBy).toBe('user-123');
      expect(qualifiedLead.convertedAt).toBeInstanceOf(Date);
      expect(leadsRepository.save).toHaveBeenCalledWith(qualifiedLead);

      expect(auditLogRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          action: 'LEAD_CONVERTED',
          entityType: 'Lead',
          entityId: 'lead-123',
          oldValue: expect.objectContaining({ status: LeadStatus.QUALIFIED }),
          newValue: expect.objectContaining({
            status: LeadStatus.CONVERTED,
            convertedCustomerId: 'customer-new',
            convertedBy: 'user-123',
          }),
          metadata: expect.objectContaining({
            customerId: 'customer-new',
            customerCreated: true,
          }),
        }),
      );
    });

    it('should reuse the existing customer with the same email without creating a duplicate', async () => {
      const existingCustomer = buildCustomer({ id: 'customer-existing' });
      (leadsRepository.findOne as jest.Mock).mockResolvedValue(
        buildLead({ status: LeadStatus.QUALIFIED }),
      );
      (customersRepository.find as jest.Mock).mockResolvedValue([
        existingCustomer,
      ]);

      const result = await service.convert('lead-123', dto);

      expect(customersRepository.save).not.toHaveBeenCalled();
      expect(customersRepository.create).not.toHaveBeenCalled();
      expect(result.customerCreated).toBe(false);
      expect(result.matchedBy).toBe('EMAIL');
      expect(result.customer.id).toBe('customer-existing');
      expect(result.message).toContain('existing customer');

      expect(leadsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: LeadStatus.CONVERTED,
          convertedCustomerId: 'customer-existing',
          convertedBy: 'user-123',
        }),
      );
      expect(auditLogRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            customerId: 'customer-existing',
            customerCreated: false,
            matchedBy: 'EMAIL',
          }),
        }),
      );
    });

    it('should throw BadRequestException when the lead is not QUALIFIED', async () => {
      (leadsRepository.findOne as jest.Mock).mockResolvedValue(
        buildLead({ status: LeadStatus.NEW }),
      );

      await expect(service.convert('lead-123', dto)).rejects.toThrow(
        BadRequestException,
      );

      expect(customersRepository.save).not.toHaveBeenCalled();
      expect(leadsRepository.save).not.toHaveBeenCalled();
      expect(auditLogRepository.save).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when the lead does not exist', async () => {
      (leadsRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.convert('missing-lead', dto)).rejects.toThrow(
        NotFoundException,
      );

      expect(customersRepository.save).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when the acting user does not exist', async () => {
      (usersRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.convert('lead-123', dto)).rejects.toThrow(
        NotFoundException,
      );

      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('should throw ConflictException when the lead has already been converted', async () => {
      (leadsRepository.findOne as jest.Mock).mockResolvedValue(
        buildLead({
          status: LeadStatus.CONVERTED,
          convertedCustomerId: 'customer-existing',
        }),
      );

      await expect(service.convert('lead-123', dto)).rejects.toThrow(
        ConflictException,
      );

      expect(customersRepository.save).not.toHaveBeenCalled();
      expect(leadsRepository.save).not.toHaveBeenCalled();
    });

    it('should throw ConflictException when duplicate customers exist for the same email', async () => {
      (leadsRepository.findOne as jest.Mock).mockResolvedValue(
        buildLead({ status: LeadStatus.QUALIFIED }),
      );
      (customersRepository.find as jest.Mock).mockResolvedValue([
        buildCustomer({ id: 'customer-a' }),
        buildCustomer({ id: 'customer-b' }),
      ]);

      await expect(service.convert('lead-123', dto)).rejects.toThrow(
        ConflictException,
      );

      expect(customersRepository.save).not.toHaveBeenCalled();
    });
  });
});
