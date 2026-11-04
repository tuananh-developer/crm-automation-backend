import { LeadsController } from './leads.controller.js';
import type { LeadsService } from './leads.service.js';
import { LeadStatus } from './enums/lead.enum.js';
import type { LeadResponseDto } from './dto/index.js';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';
import { UserRole, UserStatus } from '../users/enums/user.enum.js';

describe('LeadsController', () => {
  let controller: LeadsController;
  let service: jest.Mocked<Partial<LeadsService>>;

  const mockLead: LeadResponseDto = {
    id: 'lead-123',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    phone: null,
    companyName: 'Acme',
    companyWebsite: null,
    jobTitle: null,
    companySize: null,
    industry: null,
    status: LeadStatus.NEW,
    sourceId: 'source-123',
    source: null,
    ownerId: null,
    owner: null,
    convertedCustomerId: null,
    convertedBy: null,
    convertedAt: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const actor: AuthenticatedUser = {
    id: 'user-123',
    name: 'Sales User',
    email: 'sales@example.com',
    role: UserRole.SALES,
    status: UserStatus.ACTIVE,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    service = {
      create: jest.fn().mockResolvedValue(mockLead),
      findAll: jest.fn().mockResolvedValue({
        data: [mockLead],
        meta: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      }),
      findOne: jest.fn().mockResolvedValue(mockLead),
      update: jest.fn().mockResolvedValue({ ...mockLead, firstName: 'Jane' }),
      remove: jest
        .fn()
        .mockResolvedValue({ success: true, message: 'Removed' }),
      convert: jest.fn(),
    };

    controller = new LeadsController(service as LeadsService);
  });

  it('should call service.create with dto', async () => {
    const dto = {
      firstName: 'John',
      email: 'john.doe@example.com',
      sourceId: 'source-123',
    };
    const result = await controller.create(dto, actor);

    expect(service.create).toHaveBeenCalledWith(dto, actor);
    expect(result).toEqual(mockLead);
  });

  it('should call service.findAll with query', async () => {
    const query = { page: 1, limit: 10 };
    const result = await controller.findAll(query, actor);

    expect(service.findAll).toHaveBeenCalledWith(query, actor);
    expect(result.data).toHaveLength(1);
  });

  it('should call service.findOne with id', async () => {
    const result = await controller.findOne('lead-123', actor);

    expect(service.findOne).toHaveBeenCalledWith('lead-123', actor);
    expect(result).toEqual(mockLead);
  });

  it('should call service.update with id and dto', async () => {
    const dto = { firstName: 'Jane' };
    const result = await controller.update('lead-123', dto, actor);

    expect(service.update).toHaveBeenCalledWith('lead-123', dto, actor);
    expect(result.firstName).toBe('Jane');
  });

  it('should call service.remove with id', async () => {
    const result = await controller.remove('lead-123', actor);

    expect(service.remove).toHaveBeenCalledWith('lead-123', actor);
    expect(result.success).toBe(true);
  });

  it('uses the authenticated actor for lead conversion', async () => {
    const result = {} as Awaited<ReturnType<LeadsService['convert']>>;
    (service.convert as jest.Mock).mockResolvedValue(result);

    await controller.convert('lead-123', actor);

    expect(service.convert).toHaveBeenCalledWith('lead-123', actor);
  });
});
