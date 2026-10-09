import { SequencesController } from './sequences.controller.js';
import type { SequencesService } from './sequences.service.js';
import {
  EnrollmentStatus,
  FollowUpSequenceStatus,
} from './enums/follow-up.enum.js';
import type { FollowUpSequence } from './entities/follow-up-sequence.entity.js';
import type { FollowUpStep } from './entities/follow-up-step.entity.js';
import type { LeadFollowUpEnrollment } from './entities/lead-follow-up-enrollment.entity.js';
import type { EnrollLeadDto } from './dto/enroll-lead.dto.js';
import type { CancelEnrollmentDto } from './dto/cancel-enrollment.dto.js';

describe('SequencesController', () => {
  let controller: SequencesController;
  let service: jest.Mocked<Partial<SequencesService>>;

  const mockSequence: FollowUpSequence = {
    id: 'seq-123',
    name: 'Sample Sequence',
    description: 'Test description',
    status: FollowUpSequenceStatus.ACTIVE,
    createdBy: 'user-123',
    updatedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    get isActive() {
      return true;
    },
  };

  const mockStep: FollowUpStep = {
    id: 'step-1',
    sequenceId: 'seq-123',
    stepOrder: 1,
    delayMinutes: 0,
    channel: 'EMAIL',
    actionType: 'EMAIL',
    subjectTemplate: 'Welcome',
    contentTemplate: 'Hello',
    conditions: null,
    metadata: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    get actionConfig() {
      return null;
    },
  };

  const mockEnrollment: LeadFollowUpEnrollment = {
    id: 'enroll-123',
    leadId: 'lead-123',
    sequenceId: 'seq-123',
    currentStepId: 'step-1',
    status: EnrollmentStatus.ACTIVE,
    startedAt: new Date(),
    pausedAt: null,
    completedAt: null,
    cancelledAt: null,
    assignedBy: 'user-123',
    cancellationReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    service = {
      createSequence: jest.fn().mockResolvedValue(mockSequence),
      findAllSequences: jest.fn().mockResolvedValue([mockSequence]),
      findSequenceById: jest.fn().mockResolvedValue(mockSequence),
      updateSequence: jest.fn().mockResolvedValue(mockSequence),
      createStep: jest.fn().mockResolvedValue(mockStep),
      findStepsBySequence: jest.fn().mockResolvedValue([mockStep]),
      updateStep: jest.fn().mockResolvedValue(mockStep),
      enrollLead: jest.fn().mockResolvedValue({
        message: 'Lead successfully enrolled into follow-up sequence',
        enrollment: mockEnrollment,
        firstStep: mockStep,
      }),
      findAllEnrollments: jest.fn().mockResolvedValue([mockEnrollment]),
      findEnrollmentsByLead: jest.fn().mockResolvedValue([mockEnrollment]),
      findEnrollmentById: jest.fn().mockResolvedValue(mockEnrollment),
      cancelEnrollment: jest.fn().mockResolvedValue({
        ...mockEnrollment,
        status: EnrollmentStatus.CANCELLED,
        cancelledAt: new Date(),
      }),
      pauseEnrollment: jest.fn().mockResolvedValue({
        ...mockEnrollment,
        status: EnrollmentStatus.PAUSED,
        pausedAt: new Date(),
      }),
      resumeEnrollment: jest.fn().mockResolvedValue({
        ...mockEnrollment,
        status: EnrollmentStatus.ACTIVE,
        pausedAt: null,
      }),
    };

    controller = new SequencesController(service as SequencesService);
  });

  // ── Sequence CRUD Tests ───────────────────────────────────────────────────

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

  it('should find sequence by id via service', async () => {
    const res = await controller.findSequenceById('seq-123');

    expect(service.findSequenceById).toHaveBeenCalledWith('seq-123');
    expect(res.id).toBe('seq-123');
  });

  it('should update sequence via service', async () => {
    const dto = { name: 'Updated Sequence' };
    const res = await controller.updateSequence('seq-123', dto);

    expect(service.updateSequence).toHaveBeenCalledWith('seq-123', dto);
    expect(res.id).toBe('seq-123');
  });

  // ── Step CRUD Tests ───────────────────────────────────────────────────────

  it('should create step for sequence via service', async () => {
    const dto = { stepOrder: 1, actionType: 'EMAIL', channel: 'EMAIL' };
    const res = await controller.createStep('seq-123', dto);

    expect(service.createStep).toHaveBeenCalledWith('seq-123', dto);
    expect(res.id).toBe('step-1');
  });

  it('should find steps for sequence via service', async () => {
    const res = await controller.findStepsBySequence('seq-123');

    expect(service.findStepsBySequence).toHaveBeenCalledWith('seq-123');
    expect(res).toHaveLength(1);
  });

  it('should update step via service', async () => {
    const dto = { delayMinutes: 60 };
    const res = await controller.updateStep('step-1', dto);

    expect(service.updateStep).toHaveBeenCalledWith('step-1', dto);
    expect(res.id).toBe('step-1');
  });

  it('should update step directly via service', async () => {
    const dto = { delayMinutes: 90 };
    const res = await controller.updateStepDirect('step-1', dto);

    expect(service.updateStep).toHaveBeenCalledWith('step-1', dto);
    expect(res.id).toBe('step-1');
  });

  // ── Enrollment Management Tests ───────────────────────────────────────────

  it('should enroll lead into sequence via service (POST /sequences/:id/enroll)', async () => {
    const dto: EnrollLeadDto = { leadId: 'lead-123' };
    const res = await controller.enrollLead('seq-123', dto);

    expect(service.enrollLead).toHaveBeenCalledWith({
      leadId: 'lead-123',
      sequenceId: 'seq-123',
    });
    expect(res.enrollment.id).toBe('enroll-123');
  });

  it('should enroll lead directly via service (POST /sequences/enroll)', async () => {
    const dto: EnrollLeadDto = { leadId: 'lead-123', sequenceId: 'seq-123' };
    const res = await controller.enrollLeadDirect(dto);

    expect(service.enrollLead).toHaveBeenCalledWith(dto);
    expect(res.enrollment.id).toBe('enroll-123');
  });

  it('should list all enrollments via service (GET /sequences/enrollments)', async () => {
    const res = await controller.findAllEnrollments(
      'lead-123',
      'seq-123',
      EnrollmentStatus.ACTIVE,
    );

    expect(service.findAllEnrollments).toHaveBeenCalledWith({
      leadId: 'lead-123',
      sequenceId: 'seq-123',
      status: EnrollmentStatus.ACTIVE,
    });
    expect(res).toHaveLength(1);
  });

  it('should get enrollments by lead via service (GET /sequences/enrollments/lead/:leadId)', async () => {
    const res = await controller.findEnrollmentsByLead('lead-123');

    expect(service.findEnrollmentsByLead).toHaveBeenCalledWith('lead-123');
    expect(res).toHaveLength(1);
  });

  it('should get enrollment by id via service (GET /sequences/enrollments/:id)', async () => {
    const res = await controller.findEnrollmentById('enroll-123');

    expect(service.findEnrollmentById).toHaveBeenCalledWith('enroll-123');
    expect(res.id).toBe('enroll-123');
  });

  it('should cancel enrollment via service (PATCH /sequences/enrollments/:id/cancel)', async () => {
    const dto: CancelEnrollmentDto = {
      cancellationReason: 'Lead not interested',
    };
    const res = await controller.cancelEnrollment('enroll-123', dto);

    expect(service.cancelEnrollment).toHaveBeenCalledWith('enroll-123', dto);
    expect(res.status).toBe(EnrollmentStatus.CANCELLED);
  });

  it('should pause enrollment via service (PATCH /sequences/enrollments/:id/pause)', async () => {
    const res = await controller.pauseEnrollment('enroll-123');

    expect(service.pauseEnrollment).toHaveBeenCalledWith('enroll-123');
    expect(res.status).toBe(EnrollmentStatus.PAUSED);
  });

  it('should resume enrollment via service (PATCH /sequences/enrollments/:id/resume)', async () => {
    const res = await controller.resumeEnrollment('enroll-123');

    expect(service.resumeEnrollment).toHaveBeenCalledWith('enroll-123');
    expect(res.status).toBe(EnrollmentStatus.ACTIVE);
  });
});
