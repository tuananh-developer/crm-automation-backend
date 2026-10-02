import { LeadsController } from './leads.controller.js';
import type { LeadsService } from './leads.service.js';
import { LeadStatus } from './enums/lead.enum.js';
import type { Lead } from './entities/lead.entity.js';

describe('LeadsController', () => {
  let controller: LeadsController;
  let service: jest.Mocked<Partial<LeadsService>>;

  const mockLead: Lead = {
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
    ownerId: null,
    convertedCustomerId: null,
    convertedBy: null,
    convertedAt: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    service = {
      create: jest.fn().mockResolvedValue(mockLead),
      findAll: jest.fn().mockResolvedValue({
        data: [mockLead],
        meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
      }),
      findOne: jest.fn().mockResolvedValue(mockLead),
      update: jest.fn().mockResolvedValue({ ...mockLead, firstName: 'Jane' }),
      remove: jest
        .fn()
        .mockResolvedValue({ success: true, message: 'Removed' }),
    };

    controller = new LeadsController(service as LeadsService);
  });

  it('should call service.create with dto', async () => {
    const dto = {
      firstName: 'John',
      email: 'john.doe@example.com',
      sourceId: 'source-123',
    };
    const result = await controller.create(dto);

    expect(service.create).toHaveBeenCalledWith(dto);
    expect(result).toEqual(mockLead);
  });

  it('should call service.findAll with query', async () => {
    const query = { page: 1, limit: 10 };
    const result = await controller.findAll(query);

    expect(service.findAll).toHaveBeenCalledWith(query);
    expect(result.data).toHaveLength(1);
  });

  it('should call service.findOne with id', async () => {
    const result = await controller.findOne('lead-123');

    expect(service.findOne).toHaveBeenCalledWith('lead-123');
    expect(result).toEqual(mockLead);
  });

  it('should call service.update with id and dto', async () => {
    const dto = { firstName: 'Jane' };
    const result = await controller.update('lead-123', dto);

    expect(service.update).toHaveBeenCalledWith('lead-123', dto);
    expect(result.firstName).toBe('Jane');
  });

  it('should call service.remove with id', async () => {
    const result = await controller.remove('lead-123');

    expect(service.remove).toHaveBeenCalledWith('lead-123');
    expect(result.success).toBe(true);
  });
});
