import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { FollowUpSequenceStatus } from '../enums/follow-up.enum.js';

export class CreateSequenceDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(150)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(FollowUpSequenceStatus)
  status?: FollowUpSequenceStatus = FollowUpSequenceStatus.ACTIVE;

  @IsOptional()
  @IsUUID()
  createdBy?: string;
}
