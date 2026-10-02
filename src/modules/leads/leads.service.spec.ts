import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { LeadsService } from './leads.service.js';
import { LeadStatus } from './enums/lead.enum.js';
import type { Repository } from 'typeorm';
import type { Lead } from './entities/lead.entity.js';
import type { LeadSource } from './entities/lead-source.entity.js';
import type { User } from '../users/entities/user.entity.js';
import type { RabbitMQService } from '../../infrastructure/rabbitmq/rabbitmq.service.js';

describe('LeadsService', () => {
  let service: LeadsService;
  let leadsRepository: jest.Mocked<Partial<Repository<Lead>>>;
  let leadSourcesRepository: jest.Mocked<Partial<Repository<LeadSource>>>;
  let usersRepository: jest.Mocked<Partial<Repository<User>>>;
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
});
