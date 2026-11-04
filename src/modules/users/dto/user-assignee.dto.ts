import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../enums/user.enum.js';

export class UserAssigneeDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: UserRole })
  role!: UserRole;
}
