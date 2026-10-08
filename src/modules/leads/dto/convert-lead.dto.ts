import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class ConvertLeadDto {
  @IsUUID()
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
