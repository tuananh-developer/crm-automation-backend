import { IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class EnrollLeadDto {
  @IsNotEmpty()
  @IsUUID()
  leadId!: string;

  @IsOptional()
  @IsUUID()
  sequenceId?: string;

  @IsOptional()
  @IsUUID()
  assignedBy?: string;
}
