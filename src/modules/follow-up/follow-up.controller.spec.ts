import { FollowUpController } from './follow-up.controller.js';
import type { FollowUpService } from './follow-up.service.js';
import {
  EnrollmentStatus,
  FollowUpSequenceStatus,
} from './enums/follow-up.enum.js';

describe('FollowUpController', () => {
  let controller: FollowUpController;
  let service: jest.Mocked<Partial<FollowUpService>>;

  const mockSequence = {
    id: 'seq-123',
    name: 'Sample Sequence',
    status: FollowUpSequenceStatus.ACTIVE,
  } as any;

  const mockEnrollment = {
    id: 'enroll-123',
    leadId: 'lead-123',
    sequenceId: 'seq-123',
    status: EnrollmentStatus.ACTIVE,
  } as any;

  beforeEach(() => {
    service = {
      createSequence: jest.fn().mockResolvedValue(mockSequence),
      findAllSequences: jest.fn().mockResolvedValue([mockSequence]),
      findSequenceById: jest.fn().mockResolvedValue(mockSequence),
      updateSequence: jest.fn().mockResolvedValue(mockSequence),
      createStep: jest.fn().mockResolvedValue({ id: 'step-1' } as any),
      findStepsBySequence: jest
        .fn()
        .mockResolvedValue([{ id: 'step-1' }] as any),
      updateStep: jest.fn().mockResolvedValue({ id: 'step-1' } as any),
      enrollLead: jest.fn().mockResolvedValue({
        message: 'Lead successfully enrolled',
        enrollment: mockEnrollment,
        firstStep: { id: 'step-1' },
      } as any),
      findAllEnrollments: jest.fn().mockResolvedValue([mockEnrollment]),
      findEnrollmentById: jest.fn().mockResolvedValue(mockEnrollment),
      cancelEnrollment: jest.fn().mockResolvedValue({
        ...mockEnrollment,
        status: EnrollmentStatus.CANCELLED,
      }),
      findEnrollmentsByLead: jest.fn().mockResolvedValue([mockEnrollment]),
    };

    controller = new FollowUpController(service as FollowUpService);
  });

  it('should create sequence via service', async () => {
    const dto = { name: 'Sample Sequence' };
    const res = await controller.createSequence(dto);

    expect(service.createSequence).toHaveBeenCalledWith(dto);
    expect(res.id).toBe('seq-123');
  });

  it('should find all sequences via service', async () => {
    const res = await controller.findAllSequences(
      FollowUpSequenceStatus.ACTIVE,
    );

    expect(service.findAllSequences).toHaveBeenCalledWith(
      FollowUpSequenceStatus.ACTIVE,
    );
    expect(res).toHaveLength(1);
  });

  it('should enroll lead via service', async () => {
    const dto = { leadId: 'lead-123', sequenceId: 'seq-123' };
    const res = await controller.enrollLead(dto);

    expect(service.enrollLead).toHaveBeenCalledWith(dto);
    expect(res.enrollment.id).toBe('enroll-123');
  });

  it('should cancel enrollment via service', async () => {
    const dto = { cancellationReason: 'Not interested' };
    const res = await controller.cancelEnrollment('enroll-123', dto);

    expect(service.cancelEnrollment).toHaveBeenCalledWith('enroll-123', dto);
    expect(res.status).toBe(EnrollmentStatus.CANCELLED);
  });

  it('should get enrollments for lead via service', async () => {
    const res = await controller.findEnrollmentsByLead('lead-123');

    expect(service.findEnrollmentsByLead).toHaveBeenCalledWith('lead-123');
    expect(res).toHaveLength(1);
  });
});
