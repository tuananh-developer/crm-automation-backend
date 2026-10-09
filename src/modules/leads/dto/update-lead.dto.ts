import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LeadStatus } from '../enums/lead.enum.js';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateLeadDto {
  @ApiPropertyOptional({
    description: 'First name of the lead',
    example: 'John',
    maxLength: 100,
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({
    description: 'Last name of the lead',
    example: 'Doe',
    maxLength: 100,
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({
    description: 'Email address of the lead',
    example: 'john.doe@example.com',
    format: 'email',
    maxLength: 320,
  })
  @IsEmail()
  @IsOptional()
  @MaxLength(320)
  email?: string;

  @ApiPropertyOptional({
    description: 'Phone number of the lead',
    example: '+1-555-123-4567',
    maxLength: 30,
  })
  @IsString()
  @IsOptional()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({
    description: 'Company name',
    example: 'Acme Corporation',
    maxLength: 255,
  })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  companyName?: string;

  @ApiPropertyOptional({
    description: 'Company website URL',
    example: 'https://acme.com',
    maxLength: 500,
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  companyWebsite?: string;

  @ApiPropertyOptional({
    description: 'Job title of the lead',
    example: 'CTO',
    maxLength: 150,
  })
  @IsString()
  @IsOptional()
  @MaxLength(150)
  jobTitle?: string;

  @ApiPropertyOptional({
    description: 'Company size (number of employees)',
    example: 250,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  companySize?: number;

  @ApiPropertyOptional({
    description: 'Industry of the company',
    example: 'Technology',
    maxLength: 150,
  })
  @IsString()
  @IsOptional()
  @MaxLength(150)
  industry?: string;

  @ApiPropertyOptional({
    description: 'Lead status',
    example: 'QUALIFIED',
    enum: LeadStatus,
  })
  @IsEnum(LeadStatus)
  @IsOptional()
  status?: LeadStatus;

  @ApiPropertyOptional({
    description: 'Lead source UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  @IsUUID()
  @IsOptional()
  sourceId?: string;

  @ApiPropertyOptional({
    description: 'Owner user UUID (can be null to unassign)',
    example: '550e8400-e29b-41d4-a716-446655440001',
    format: 'uuid',
    nullable: true,
  })
  @IsUUID()
  @IsOptional()
  ownerId?: string | null;

  @ApiPropertyOptional({
    description: 'Additional notes about the lead',
    example: 'Follow up next week',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}
