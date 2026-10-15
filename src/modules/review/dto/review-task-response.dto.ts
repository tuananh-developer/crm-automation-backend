import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReviewDecision, ReviewStatus } from '../enums/review.enum.js';
import { UserRole, UserStatus } from '../../users/enums/user.enum.js';

export class ReviewAssigneeResponseDto {
  @ApiProperty({ description: 'ID người được giao duyệt' })
  id!: string;

  @ApiProperty({ description: 'Họ tên người duyệt' })
  name!: string;

  @ApiProperty({ description: 'Email người duyệt' })
  email!: string;

  @ApiProperty({ enum: UserRole, description: 'Vai trò người dùng' })
  role!: UserRole;

  @ApiProperty({ enum: UserStatus, description: 'Trạng thái hoạt động' })
  status!: UserStatus;
}

export class ReviewTaskResponseDto {
  @ApiProperty({ description: 'ID định danh của review task' })
  id!: string;

  @ApiProperty({ description: 'ID định danh của lead' })
  leadId!: string;

  @ApiPropertyOptional({ description: 'ID của workflow run liên quan' })
  workflowRunId!: string | null;

  @ApiPropertyOptional({
    description: 'Loại tác vụ duyệt (Task Type)',
    example: 'AI_QUALIFICATION_REVIEW',
  })
  taskType!: string | null;

  @ApiProperty({
    enum: ReviewStatus,
    description: 'Trạng thái của review task',
    example: ReviewStatus.PENDING,
  })
  status!: ReviewStatus;

  @ApiPropertyOptional({
    description: 'Mức độ ưu tiên của tác vụ duyệt (HIGH, MEDIUM, LOW)',
    example: 'HIGH',
  })
  priority!: string | null;

  @ApiPropertyOptional({ description: 'Lý do kích hoạt tác vụ duyệt thủ công' })
  reason!: string | null;

  @ApiPropertyOptional({
    enum: ReviewDecision,
    description: 'Quyết định duyệt (APPROVE, REJECT, MODIFY)',
  })
  decision!: ReviewDecision | null;

  @ApiPropertyOptional({ description: 'Nhận xét/ghi chú của người duyệt' })
  reviewComment!: string | null;

  @ApiPropertyOptional({
    description: 'Ghi chú giải quyết tác vụ (alias resolutionNotes)',
  })
  resolutionNotes!: string | null;

  @ApiPropertyOptional({ description: 'ID người được phân công xử lý' })
  assignedTo!: string | null;

  @ApiPropertyOptional({
    type: () => ReviewAssigneeResponseDto,
    description: 'Thông tin an toàn của người duyệt (không lộ passwordHash)',
  })
  assignee?: ReviewAssigneeResponseDto | null;

  @ApiPropertyOptional({ description: 'Thời điểm bắt đầu xử lý review' })
  startedAt!: Date | null;

  @ApiPropertyOptional({ description: 'Thời điểm hoàn tất xử lý review' })
  resolvedAt!: Date | null;

  @ApiProperty({ description: 'Thời điểm tạo task' })
  createdAt!: Date;
}
