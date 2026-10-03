import { IsNotEmpty, IsUUID } from 'class-validator';

export class ConvertLeadDto {
  @IsUUID()
  @IsNotEmpty()
  userId!: string;
}
