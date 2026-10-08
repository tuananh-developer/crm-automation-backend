import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { SegmentationService } from './segmentation.service.js';
import { SegmentAssignmentType } from '../customers/enums/customer.enum.js';
import type { Repository } from 'typeorm';
import type { Segment } from '../customers/entities/segment.entity.js';
import type { Customer } from '../customers/entities/customer.entity.js';
import type { CustomerSegment } from '../customers/entities/customer-segment.entity.js';
import type { User } from '../users/entities/user.entity.js';

describe('SegmentationService', () => {
  let service: SegmentationService;
  let segmentRepository: jest.Mocked<Partial<Repository<Segment>>>;
  let customerRepository: jest.Mocked<Partial<Repository<Customer>>>;
  let customerSegmentRepository: jest.Mocked<
    Partial<Repository<CustomerSegment>>
  >;
  let userRepository: jest.Mocked<Partial<Repository<User>>>;

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

  const baseSegment: Segment = {
    id: 'segment-123',
    name: 'HIGH_VALUE',
    description: 'High value customers',
    criteria: { companySize: { gte: 100 } },
    isActive: true,
    createdBy: 'user-123',
    updatedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    segmentRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    customerRepository = {
      findOne: jest.fn(),
    };

    customerSegmentRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
    };

    userRepository = {
      findOne: jest.fn(),
    };

    service = new SegmentationService(
      segmentRepository as Repository<Segment>,
      customerRepository as Repository<Customer>,
      customerSegmentRepository as Repository<CustomerSegment>,
      userRepository as Repository<User>,
    );
  });

  const getSegmentMock = (overrides: Partial<Segment> = {}) => ({
    ...baseSegment,
    ...overrides,
    criteria: overrides.criteria ?? baseSegment.criteria,
    isActive: overrides.isActive ?? true,
  });

  describe('create', () => {
    it('should create a segment successfully', async () => {
      (segmentRepository.findOne as jest.Mock).mockResolvedValue(null);
      (userRepository.findOne as jest.Mock).mockResolvedValue(mockUser);
      (segmentRepository.create as jest.Mock).mockImplementation(
        (data: Partial<Segment>) => ({ id: 'segment-123', ...data }) as Segment,
      );
      (segmentRepository.save as jest.Mock).mockImplementation(
        (segment: Segment) => Promise.resolve(segment),
      );

      const result = await service.create(
        { name: 'HIGH_VALUE', description: 'High value', isActive: true },
        'user-123',
      );

      expect(result).toBeDefined();
      expect(result.name).toBe('HIGH_VALUE');
      expect(result.isActive).toBe(true);
      expect(segmentRepository.save).toHaveBeenCalled();
    });

    it('should throw ConflictException if segment name already exists', async () => {
      (segmentRepository.findOne as jest.Mock).mockImplementation(() =>
        Promise.resolve(getSegmentMock()),
      );

      await expect(
        service.create({ name: 'HIGH_VALUE' }, 'user-123'),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException if user does not exist', async () => {
      (segmentRepository.findOne as jest.Mock).mockResolvedValue(null);
      (userRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.create({ name: 'NEW_SEGMENT' }, 'non-existent-user'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findOne', () => {
    it('should return segment when found', async () => {
      (segmentRepository.findOne as jest.Mock).mockImplementation(() =>
        Promise.resolve(getSegmentMock()),
      );

      const result = await service.findOne('segment-123');
      expect(result).toEqual(getSegmentMock());
    });

    it('should throw NotFoundException when segment is not found', async () => {
      (segmentRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.findOne('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update segment successfully', async () => {
      (segmentRepository.findOne as jest.Mock)
        .mockResolvedValueOnce(getSegmentMock())
        .mockResolvedValueOnce(null);
      (segmentRepository.save as jest.Mock).mockImplementation(
        (segment: Segment) => Promise.resolve(segment),
      );

      const result = await service.update(
        'segment-123',
        { name: 'UPDATED_SEGMENT' },
        'user-123',
      );

      expect(result.name).toBe('UPDATED_SEGMENT');
    });

    it('should throw ConflictException if new name already exists', async () => {
      (segmentRepository.findOne as jest.Mock)
        .mockResolvedValueOnce(getSegmentMock())
        .mockResolvedValueOnce({ ...getSegmentMock(), id: 'other-segment' });

      await expect(
        service.update('segment-123', { name: 'EXISTING' }, 'user-123'),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException when segment not found', async () => {
      (segmentRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.update('non-existent', { name: 'TEST' }, 'user-123'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('activate/deactivate', () => {
    it('should activate segment', async () => {
      const inactiveSegment = { ...getSegmentMock(), isActive: false };
      (segmentRepository.findOne as jest.Mock)
        .mockResolvedValueOnce(inactiveSegment)
        .mockResolvedValueOnce(null);
      (segmentRepository.save as jest.Mock).mockImplementation(
        (segment: Segment) => Promise.resolve(segment),
      );

      const result = await service.activate('segment-123', 'user-123');
      expect(result.isActive).toBe(true);
    });

    it('should deactivate segment', async () => {
      (segmentRepository.findOne as jest.Mock)
        .mockResolvedValueOnce(getSegmentMock())
        .mockResolvedValueOnce(null);
      (segmentRepository.save as jest.Mock).mockImplementation(
        (segment: Segment) => Promise.resolve(segment),
      );

      const result = await service.deactivate('segment-123', 'user-123');
      expect(result.isActive).toBe(false);
    });
  });

  describe('evaluateCustomer', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      (customerRepository.findOne as jest.Mock).mockResolvedValue(mockCustomer);
      (segmentRepository.findOne as jest.Mock).mockResolvedValue(
        getSegmentMock(),
      );
      (customerSegmentRepository.findOne as jest.Mock).mockResolvedValue(null);
      (customerSegmentRepository.create as jest.Mock).mockImplementation(
        (data: Partial<CustomerSegment>) =>
          ({ id: 'cs-123', ...data }) as CustomerSegment,
      );
      (customerSegmentRepository.save as jest.Mock).mockImplementation(
        (cs: CustomerSegment) => Promise.resolve(cs),
      );
    });

    it('should match customer with criteria and create assignment', async () => {
      const segmentWithCriteria = {
        ...getSegmentMock(),
        criteria: { companySize: { gte: 10 } },
      };
      (segmentRepository.findOne as jest.Mock).mockResolvedValue(
        segmentWithCriteria,
      );

      const result = await service.evaluateCustomer({
        customerId: 'customer-123',
        segmentId: 'segment-123',
        userId: 'user-123',
      });

      expect(result.matched).toBe(true);
      expect(result.assignment).toBeDefined();
      expect(result.assignmentType).toBe(SegmentAssignmentType.RULE);
      expect(result.confidence).toBe(1.0);
      expect(result.reason).toContain('matched all criteria');
      expect(customerSegmentRepository.save).toHaveBeenCalled();
    });

    it('should not match customer with criteria', async () => {
      const segmentWithCriteria = {
        ...getSegmentMock(),
        criteria: { companySize: { gte: 1000 } },
      };
      (segmentRepository.findOne as jest.Mock).mockResolvedValue(
        segmentWithCriteria,
      );

      const result = await service.evaluateCustomer({
        customerId: 'customer-123',
        segmentId: 'segment-123',
      });

      expect(result.matched).toBe(false);
      expect(result.assignment).toBeUndefined();
      expect(result.assignmentType).toBe(SegmentAssignmentType.RULE);
      expect(result.confidence).toBe(0);
      expect(customerSegmentRepository.save).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when customer not found', async () => {
      (customerRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.evaluateCustomer({
          customerId: 'non-existent',
          segmentId: 'segment-123',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when segment not found', async () => {
      (segmentRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.evaluateCustomer({
          customerId: 'customer-123',
          segmentId: 'non-existent',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return not matched when segment is inactive', async () => {
      (segmentRepository.findOne as jest.Mock).mockResolvedValue({
        ...getSegmentMock(),
        isActive: false,
      });

      const result = await service.evaluateCustomer({
        customerId: 'customer-123',
        segmentId: 'segment-123',
      });

      expect(result.matched).toBe(false);
      expect(result.reason).toBe('Segment is inactive');
      expect(customerSegmentRepository.save).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when segment has no criteria', async () => {
      (segmentRepository.findOne as jest.Mock).mockResolvedValue({
        ...getSegmentMock(),
        criteria: null,
      });

      await expect(
        service.evaluateCustomer({
          customerId: 'customer-123',
          segmentId: 'segment-123',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reuse existing assignment when customer already in segment', async () => {
      const existingAssignment: CustomerSegment = {
        customerId: 'customer-123',
        segmentId: 'segment-123',
        assignmentType: SegmentAssignmentType.RULE,
        confidence: 0.5,
        assignedReason: 'Old reason',
        assignedAt: new Date('2024-01-01'),
        assignedBy: 'old-user',
      };
      (customerSegmentRepository.findOne as jest.Mock).mockResolvedValue(
        existingAssignment,
      );

      const segmentWithMatchingCriteria = {
        ...getSegmentMock(),
        criteria: { companySize: { gte: 10 } },
      };
      (segmentRepository.findOne as jest.Mock).mockResolvedValue(
        segmentWithMatchingCriteria,
      );

      const result = await service.evaluateCustomer({
        customerId: 'customer-123',
        segmentId: 'segment-123',
        userId: 'user-123',
      });

      expect(result.matched).toBe(true);
      expect(result.assignment).toBeDefined();
      expect(customerSegmentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          confidence: 1.0,
          assignedReason: expect.stringContaining('matched all criteria'),
        }),
      );
    });

    it('should evaluate multiple criteria with AND logic', async () => {
      const segmentWithMultiCriteria = {
        ...getSegmentMock(),
        criteria: {
          companySize: { gte: 10 },
          industry: { eq: 'Technology' },
        },
      };
      (segmentRepository.findOne as jest.Mock).mockResolvedValue(
        segmentWithMultiCriteria,
      );

      const result = await service.evaluateCustomer({
        customerId: 'customer-123',
        segmentId: 'segment-123',
      });

      expect(result.matched).toBe(true);
      expect(result.reason).toContain('companySize');
      expect(result.reason).toContain('industry');
    });

    it('should evaluate in condition', async () => {
      const segmentWithIn = {
        ...getSegmentMock(),
        criteria: { industry: { in: ['Technology', 'Finance'] } },
      };
      (segmentRepository.findOne as jest.Mock).mockResolvedValue(segmentWithIn);

      const result = await service.evaluateCustomer({
        customerId: 'customer-123',
        segmentId: 'segment-123',
      });

      expect(result.matched).toBe(true);
    });

    it('should evaluate contains condition', async () => {
      const segmentWithContains = {
        ...getSegmentMock(),
        criteria: { email: { contains: 'example' } },
      };
      (segmentRepository.findOne as jest.Mock).mockResolvedValue(
        segmentWithContains,
      );

      const result = await service.evaluateCustomer({
        customerId: 'customer-123',
        segmentId: 'segment-123',
      });

      expect(result.matched).toBe(true);
    });
  });

  describe('getCustomerSegments', () => {
    it('should return customer segments', async () => {
      const assignments: CustomerSegment[] = [
        {
          customerId: 'customer-123',
          segmentId: 'segment-123',
          segment: getSegmentMock(),
        } as any,
      ];
      (customerSegmentRepository.find as jest.Mock).mockResolvedValue(
        assignments,
      );

      const result = await service.getCustomerSegments('customer-123');
      expect(result).toEqual(assignments);
    });
  });

  describe('getSegmentCustomers', () => {
    it('should return segment customers', async () => {
      const assignments: CustomerSegment[] = [
        {
          customerId: 'customer-123',
          segmentId: 'segment-123',
          customer: mockCustomer,
        } as any,
      ];
      (customerSegmentRepository.find as jest.Mock).mockResolvedValue(
        assignments,
      );

      const result = await service.getSegmentCustomers('segment-123');
      expect(result).toEqual(assignments);
    });
  });
});
