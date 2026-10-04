import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { FollowUpSequenceStatus } from '../enums/follow-up.enum.js';

export class UpdateSequenceDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(FollowUpSequenceStatus)
  status?: FollowUpSequenceStatus;

  @IsOptional()
  @IsUUID()
  updatedBy?: string;
}
