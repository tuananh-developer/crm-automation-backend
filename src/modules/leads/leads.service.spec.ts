import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { LeadsService } from './leads.service.js';
import { LeadStatus } from './enums/lead.enum.js';
import type { Repository, DataSource } from 'typeorm';
import type { Lead } from './entities/lead.entity.js';
import type { LeadSource } from './entities/lead-source.entity.js';
import type { User } from '../users/entities/user.entity.js';
import type { Customer } from '../customers/entities/customer.entity.js';
import type { AuditLog } from '../audit/entities/audit-log.entity.js';
import type { RabbitMQService } from '../../infrastructure/rabbitmq/rabbitmq.service.js';

describe('LeadsService', () => {
  let service: LeadsService;
  let leadsRepository: jest.Mocked<Partial<Repository<Lead>>>;
  let leadSourcesRepository: jest.Mocked<Partial<Repository<LeadSource>>>;
  let usersRepository: jest.Mocked<Partial<Repository<User>>>;
  let customersRepository: jest.Mocked<Partial<Repository<Customer>>>;
  let auditLogRepository: jest.Mocked<Partial<Repository<AuditLog>>>;
  let rabbitmqService: jest.Mocked<Partial<RabbitMQService>>;
  let dataSource: jest.Mocked<Partial<DataSource>>;

  const mockSource: LeadSource = {
    id: 'source-123',
    name: 'Website',
    description: 'Company website',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockUser: User = {
    id: 'user-123',
    name: 'Jane Smith',
    email: 'jane.smith@example.com',
    passwordHash: 'hashed',
    role: 'SALES' as any,
    status: 'ACTIVE' as any,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockCustomer: Customer = {
    id: 'customer-123',
    name: 'John Doe',
    email: 'john.doe@example.com',
    phone: '+1234567890',
    companyName: 'Acme Corp',
    companyWebsite: 'https://acme.com',
    jobTitle: 'VP Sales',
    companySize: 50,
    industry: 'Technology',
    status: 'ACTIVE',
    createdBy: 'user-123',
    updatedBy: null,
    notes: 'Initial contact',
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
    status: LeadStatus.QUALIFIED,
    sourceId: 'source-123',
    ownerId: null,
    convertedCustomerId: null,
    convertedBy: null,
    convertedAt: null,
    notes: 'Initial contact',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    leadsRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
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
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    auditLogRepository = {
      create: jest.fn(),
      save: jest.fn(),
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

    dataSource = {
      transaction: jest.fn().mockImplementation((callback) => {
        return callback({
          getRepository: jest.fn().mockImplementation((entity) => {
            const entityName =
              typeof entity === 'function' ? entity.name : String(entity);
            if (entityName === 'Lead') return leadsRepository;
            if (entityName === 'Customer') return customersRepository;
            if (entityName === 'User') return usersRepository;
            if (entityName === 'AuditLog') return auditLogRepository;
            return {};
          }),
        });
      }),
    };

    service = new LeadsService(
      leadsRepository as Repository<Lead>,
      leadSourcesRepository as Repository<LeadSource>,
      usersRepository as Repository<User>,
      customersRepository as Repository<Customer>,
      auditLogRepository as Repository<AuditLog>,
      rabbitmqService as RabbitMQService,
      dataSource as DataSource,
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

  describe('convertLead', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      (leadsRepository.findOne as jest.Mock).mockImplementation(() =>
        Promise.resolve({ ...mockLead }),
      );
      (usersRepository.findOne as jest.Mock).mockImplementation(() =>
        Promise.resolve({ ...mockUser }),
      );
      (customersRepository.findOne as jest.Mock).mockResolvedValue(null);
      (customersRepository.create as jest.Mock).mockImplementation(
        (data: Partial<Customer>) =>
          ({ id: 'customer-123', ...data }) as Customer,
      );
      (customersRepository.save as jest.Mock).mockImplementation(
        (customer: Customer) => Promise.resolve(customer),
      );
      (leadsRepository.save as jest.Mock).mockImplementation((lead: Lead) =>
        Promise.resolve(lead),
      );
      (auditLogRepository.create as jest.Mock).mockImplementation(
        (data: Partial<AuditLog>) => data as AuditLog,
      );
      (auditLogRepository.save as jest.Mock).mockImplementation(
        (auditLog: AuditLog) => Promise.resolve(auditLog),
      );
    });

    it('should convert qualified lead and create new customer', async () => {
      const result = await service.convertLead('lead-123', {
        userId: 'user-123',
        notes: 'Conversion notes',
      });

      expect(result.lead).toBeDefined();
      expect(result.lead.status).toBe(LeadStatus.CONVERTED);
      expect(result.lead.convertedCustomerId).toBe('customer-123');
      expect(result.lead.convertedBy).toBe('user-123');
      expect(result.lead.convertedAt).toBeInstanceOf(Date);
      expect(result.customer).toBeDefined();
      expect(result.customer.id).toBe('customer-123');
      expect(result.customerCreated).toBe(true);
      expect(customersRepository.save).toHaveBeenCalled();
      expect(leadsRepository.save).toHaveBeenCalled();
      expect(auditLogRepository.save).toHaveBeenCalled();
    });

    it('should convert qualified lead and reuse existing customer', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue(
        mockCustomer,
      );

      const result = await service.convertLead('lead-123', {
        userId: 'user-123',
      });

      expect(result.lead.status).toBe(LeadStatus.CONVERTED);
      expect(result.lead.convertedCustomerId).toBe('customer-123');
      expect(result.customer.id).toBe('customer-123');
      expect(result.customerCreated).toBe(false);
      expect(customersRepository.create).not.toHaveBeenCalled();
      expect(customersRepository.save).not.toHaveBeenCalled();
      expect(leadsRepository.save).toHaveBeenCalled();
      expect(auditLogRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException when lead does not exist', async () => {
      (leadsRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.convertLead('non-existent', { userId: 'user-123' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when lead is not QUALIFIED', async () => {
      const newLead = { ...mockLead, status: LeadStatus.NEW };
      (leadsRepository.findOne as jest.Mock).mockResolvedValue(newLead);

      await expect(
        service.convertLead('lead-123', { userId: 'user-123' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when lead is QUALIFYING', async () => {
      const qualifyingLead = { ...mockLead, status: LeadStatus.QUALIFYING };
      (leadsRepository.findOne as jest.Mock).mockResolvedValue(qualifyingLead);

      await expect(
        service.convertLead('lead-123', { userId: 'user-123' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when lead is NURTURING', async () => {
      const nurturingLead = { ...mockLead, status: LeadStatus.NURTURING };
      (leadsRepository.findOne as jest.Mock).mockResolvedValue(nurturingLead);

      await expect(
        service.convertLead('lead-123', { userId: 'user-123' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when lead is already CONVERTED', async () => {
      const convertedLead = {
        ...mockLead,
        status: LeadStatus.CONVERTED,
        convertedCustomerId: 'customer-123',
      };
      (leadsRepository.findOne as jest.Mock).mockResolvedValue(convertedLead);

      await expect(
        service.convertLead('lead-123', { userId: 'user-123' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when user does not exist', async () => {
      (usersRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.convertLead('lead-123', { userId: 'non-existent-user' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should set convertedBy to the provided userId', async () => {
      await service.convertLead('lead-123', { userId: 'user-123' });

      expect(leadsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ convertedBy: 'user-123' }),
      );
    });

    it('should set convertedAt when conversion succeeds', async () => {
      await service.convertLead('lead-123', { userId: 'user-123' });

      expect(leadsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          convertedAt: expect.any(Date),
        }),
      );
    });

    it('should create audit log with correct data', async () => {
      await service.convertLead('lead-123', { userId: 'user-123' });

      expect(auditLogRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'LEAD_CONVERTED',
          entityType: 'Lead',
          entityId: 'lead-123',
          userId: 'user-123',
          oldValue: { status: LeadStatus.QUALIFIED },
          newValue: { status: LeadStatus.CONVERTED },
          metadata: expect.objectContaining({
            leadId: 'lead-123',
            customerId: 'customer-123',
            convertedBy: 'user-123',
            customerCreated: true,
          }),
        }),
      );
    });

    it('should set customerCreated to false in audit log when reusing customer', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue(
        mockCustomer,
      );

      await service.convertLead('lead-123', { userId: 'user-123' });

      expect(auditLogRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            customerCreated: false,
          }),
        }),
      );
    });

    it('should not create customer or audit log when lead is not QUALIFIED', async () => {
      const newLead = { ...mockLead, status: LeadStatus.NEW };
      (leadsRepository.findOne as jest.Mock).mockResolvedValue(newLead);

      await expect(
        service.convertLead('lead-123', { userId: 'user-123' }),
      ).rejects.toThrow(BadRequestException);

      expect(customersRepository.create).not.toHaveBeenCalled();
      expect(customersRepository.save).not.toHaveBeenCalled();
      expect(auditLogRepository.save).not.toHaveBeenCalled();
    });
  });
});
