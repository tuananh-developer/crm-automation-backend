import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLeadDto {
  @ApiProperty({
    description: 'First name of the lead',
    example: 'Nguyen',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @ApiPropertyOptional({
    description: 'Last name of the lead',
    example: 'Van A',
    maxLength: 100,
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  lastName?: string;

  @ApiProperty({
    description: 'Work or personal email address',
    example: 'nguyenvana@fpt.com',
    maxLength: 320,
  })
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(320)
  email!: string;

  @ApiPropertyOptional({
    description: 'Phone number',
    example: '0912345678',
    maxLength: 30,
  })
  @IsString()
  @IsOptional()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({
    description: 'Company or organization name',
    example: 'FPT Software',
    maxLength: 255,
  })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  companyName?: string;

  @ApiPropertyOptional({
    description: 'Company website URL',
    example: 'https://fpt-software.com',
    maxLength: 500,
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  companyWebsite?: string;

  @ApiPropertyOptional({
    description: 'Job title or role of the lead',
    example: 'IT Manager',
    maxLength: 150,
  })
  @IsString()
  @IsOptional()
  @MaxLength(150)
  jobTitle?: string;

  @ApiPropertyOptional({
    description: 'Total number of employees in the company',
    example: 150,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  companySize?: number;

  @ApiPropertyOptional({
    description: 'Business industry',
    example: 'Information Technology',
    maxLength: 150,
  })
  @IsString()
  @IsOptional()
  @MaxLength(150)
  industry?: string;

  @ApiProperty({
    description: 'UUID of the Lead Source',
    example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  })
  @IsUUID()
  @IsNotEmpty()
  sourceId!: string;

  @ApiPropertyOptional({
    description: 'UUID of the assigned Sales Owner (User)',
    example: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
  })
  @IsUUID()
  @IsOptional()
  ownerId?: string;

  @ApiPropertyOptional({
    description: 'Internal initial notes or customer comments',
    example: 'Interested in AI CRM automation for enterprise workflow.',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}
