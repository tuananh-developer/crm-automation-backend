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

export class UpdateLeadDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  firstName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  lastName?: string;

  @IsEmail()
  @IsOptional()
  @MaxLength(320)
  email?: string;

  @IsString()
  @IsOptional()
  @MaxLength(30)
  phone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  companyName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  companyWebsite?: string;

  @IsString()
  @IsOptional()
  @MaxLength(150)
  jobTitle?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  companySize?: number;

  @IsString()
  @IsOptional()
  @MaxLength(150)
  industry?: string;

  @IsEnum(LeadStatus)
  @IsOptional()
  status?: LeadStatus;

  @IsUUID()
  @IsOptional()
  sourceId?: string;

  @IsUUID()
  @IsOptional()
  ownerId?: string | null;

  @IsString()
  @IsOptional()
  notes?: string;
}
