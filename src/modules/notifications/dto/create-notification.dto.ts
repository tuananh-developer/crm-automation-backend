import { IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class CreateNotificationDto {
  @IsUUID()
  userId!: string;

  @IsString()
  @Length(1, 50)
  type!: string;

  @IsString()
  @Length(1, 255)
  title!: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsUUID()
  leadId?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  reviewTaskId?: string;
}

export class NotificationResponseDto {
  id!: string;
  userId!: string;
  type!: string;
  title!: string;
  content!: string | null;
  leadId!: string | null;
  customerId!: string | null;
  reviewTaskId!: string | null;
  isRead!: boolean;
  readAt!: Date | null;
  createdAt!: Date;
}
