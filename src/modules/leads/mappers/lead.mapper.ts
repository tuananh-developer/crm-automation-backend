import type { Lead } from '../entities/lead.entity.js';
import type { LeadSource } from '../entities/lead-source.entity.js';
import type { Customer } from '../../customers/entities/customer.entity.js';
import {
  ConvertedCustomerResponseDto,
  ConvertLeadResponseDto,
} from '../dto/convert-lead-response.dto.js';
import {
  LeadOwnerResponseDto,
  LeadResponseDto,
} from '../dto/lead-response.dto.js';
import { LeadSourceResponseDto } from '../dto/lead-source-response.dto.js';
import type { ConvertLeadResult } from '../interfaces/index.js';

export class LeadMapper {
  static toSourceResponseDto(source: LeadSource): LeadSourceResponseDto {
    return {
      id: source.id,
      name: source.name,
      description: source.description ?? null,
      isActive: source.isActive,
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
    };
  }

  static toSourceResponseDtoList(
    sources: LeadSource[],
  ): LeadSourceResponseDto[] {
    return sources.map((source) => this.toSourceResponseDto(source));
  }

  static toResponseDto(lead: Lead): LeadResponseDto {
    const dto: LeadResponseDto = {
      id: lead.id,
      firstName: lead.firstName,
      lastName: lead.lastName ?? null,
      email: lead.email,
      phone: lead.phone ?? null,
      companyName: lead.companyName ?? null,
      companyWebsite: lead.companyWebsite ?? null,
      jobTitle: lead.jobTitle ?? null,
      companySize: lead.companySize ?? null,
      industry: lead.industry ?? null,
      status: lead.status,
      sourceId: lead.sourceId,
      ownerId: lead.ownerId ?? null,
      convertedCustomerId: lead.convertedCustomerId ?? null,
      convertedBy: lead.convertedBy ?? null,
      convertedAt: lead.convertedAt ?? null,
      notes: lead.notes ?? null,
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
    };

    if (lead.source) {
      dto.source = this.toSourceResponseDto(lead.source);
    }

    if (lead.owner) {
      const ownerDto: LeadOwnerResponseDto = {
        id: lead.owner.id,
        name: lead.owner.name,
        email: lead.owner.email,
      };
      dto.owner = ownerDto;
    }

    return dto;
  }

  static toResponseDtoList(leads: Lead[]): LeadResponseDto[] {
    return leads.map((lead) => this.toResponseDto(lead));
  }

  static toCustomerResponseDto(
    customer: Customer,
  ): ConvertedCustomerResponseDto {
    return {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone ?? null,
      companyName: customer.companyName ?? null,
      companyWebsite: customer.companyWebsite ?? null,
      jobTitle: customer.jobTitle ?? null,
      companySize: customer.companySize ?? null,
      industry: customer.industry ?? null,
      status: customer.status ?? null,
      createdBy: customer.createdBy,
      updatedBy: customer.updatedBy ?? null,
      notes: customer.notes ?? null,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
    };
  }

  static toConvertResponseDto(
    result: ConvertLeadResult,
  ): ConvertLeadResponseDto {
    return {
      lead: this.toResponseDto(result.lead),
      customer: this.toCustomerResponseDto(result.customer),
      customerCreated: result.customerCreated,
      matchedBy: result.matchedBy,
      message: result.message,
    };
  }
}
