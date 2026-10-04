import { IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class EnrollLeadDto {
  @IsNotEmpty()
  @IsUUID()
  leadId!: string;

  @IsNotEmpty()
  @IsUUID()
  sequenceId!: string;

  @IsOptional()
  @IsUUID()
  assignedBy?: string;
}
