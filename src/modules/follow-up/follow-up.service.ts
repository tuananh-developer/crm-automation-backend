import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeadFollowUpEnrollment } from './entities/lead-follow-up-enrollment.entity.js';
import { FollowUpExecution } from './entities/follow-up-execution.entity.js';
import { EnrollmentStatus } from './enums/follow-up.enum.js';

@Injectable()
export class FollowUpService {
  constructor(
    @InjectRepository(LeadFollowUpEnrollment)
    private readonly enrollmentRepository: Repository<LeadFollowUpEnrollment>,

    @InjectRepository(FollowUpExecution)
    private readonly executionRepository: Repository<FollowUpExecution>,
  ) {}

  async getEnrollmentsByLeadId(
    leadId: string,
  ): Promise<LeadFollowUpEnrollment[]> {
    const enrollments = await this.enrollmentRepository.find({
      where: { leadId },
      relations: {
        sequence: true,
        currentStep: true,
      },
      order: { createdAt: 'DESC' },
    });

    return enrollments;
  }

  async getActiveEnrollmentByLeadId(
    leadId: string,
  ): Promise<LeadFollowUpEnrollment | null> {
    const enrollment = await this.enrollmentRepository.findOne({
      where: { leadId, status: EnrollmentStatus.ACTIVE },
      relations: {
        sequence: true,
        currentStep: true,
      },
      order: { createdAt: 'DESC' },
    });

    return enrollment ?? null;
  }

  async getEnrollmentById(id: string): Promise<LeadFollowUpEnrollment | null> {
    const enrollment = await this.enrollmentRepository.findOne({
      where: { id },
      relations: {
        sequence: true,
        currentStep: true,
        lead: true,
      },
    });

    return enrollment ?? null;
  }

  async getExecutionsByEnrollmentId(
    enrollmentId: string,
  ): Promise<FollowUpExecution[]> {
    const executions = await this.executionRepository.find({
      where: { enrollmentId },
      order: { createdAt: 'ASC' },
    });

    return executions;
  }
}
