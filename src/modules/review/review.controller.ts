import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ReviewService } from './review.service.js';
import {
  AssignReviewTaskDto,
  CreateReviewTaskDto,
  ResolveReviewTaskDto,
  ReviewTaskResponseDto,
} from './dto/index.js';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';
import { UserRole } from '../users/enums/user.enum.js';

@ApiTags('Review Tasks')
@ApiBearerAuth('JWT-auth')
@Controller('review-tasks')
@UseGuards(JwtAuthGuard)
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a review task',
    description: 'Creates a new human review task for a lead',
  })
  @ApiCreatedResponse({
    description: 'Review task created successfully',
    type: ReviewTaskResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid input data' })
  @ApiForbiddenResponse({ description: 'Workflow run does not belong to lead' })
  async create(
    @Body() dto: CreateReviewTaskDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ReviewTaskResponseDto> {
    return this.reviewService.create(dto, actor);
  }

  @Get()
  @ApiOperation({
    summary: 'List all review tasks',
    description: 'Returns a list of all review tasks',
  })
  @ApiOkResponse({
    description: 'Review tasks retrieved successfully',
    type: [ReviewTaskResponseDto],
  })
  async findAll(
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ReviewTaskResponseDto[]> {
    return this.reviewService.findAll(actor);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a review task by ID',
    description: 'Returns a single review task by its UUID',
  })
  @ApiOkResponse({
    description: 'Review task found',
    type: ReviewTaskResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Review task not found' })
  @ApiParam({
    name: 'id',
    type: String,
    format: 'uuid',
    description: 'Review task UUID',
  })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ReviewTaskResponseDto> {
    return this.reviewService.findOne(id, actor);
  }

  @Patch(':id/assign')
  @ApiOperation({
    summary: 'Assign a review task',
    description:
      'Assigns a review task to a reviewer (must be SALES role and ACTIVE status)',
  })
  @ApiOkResponse({
    description: 'Review task assigned successfully',
    type: ReviewTaskResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Review task or reviewer not found' })
  @ApiBadRequestResponse({
    description: 'Task not in PENDING status or reviewer not SALES/ACTIVE',
  })
  @ApiForbiddenResponse({
    description: 'Reviewer must have SALES role and ACTIVE status',
  })
  @ApiParam({
    name: 'id',
    type: String,
    format: 'uuid',
    description: 'Review task UUID',
  })
  async assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignReviewTaskDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ReviewTaskResponseDto> {
    if (actor.role !== UserRole.ADMIN && dto.reviewerId !== actor.id) {
      throw new ForbiddenException(
        'Sales users may only claim tasks for themselves',
      );
    }
    return this.reviewService.assign(id, dto, actor);
  }

  @Patch(':id/start')
  @ApiOperation({
    summary: 'Start a review task',
    description: 'Marks a review task as IN_REVIEW by the assigned reviewer',
  })
  @ApiOkResponse({
    description: 'Review task started successfully',
    type: ReviewTaskResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Review task not found' })
  @ApiBadRequestResponse({
    description: 'Task not in ASSIGNED status or not assigned to current user',
  })
  @ApiForbiddenResponse({
    description: 'Only assigned reviewer can start the task',
  })
  @ApiParam({
    name: 'id',
    type: String,
    format: 'uuid',
    description: 'Review task UUID',
  })
  async start(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ReviewTaskResponseDto> {
    return this.reviewService.start(id, actor);
  }

  @Patch(':id/resolve')
  @ApiOperation({
    summary: 'Resolve a review task',
    description:
      'Resolves a review task with APPROVE, REJECT, or MODIFY decision. MODIFY requires reviewComment.',
  })
  @ApiOkResponse({
    description: 'Review task resolved successfully',
    type: ReviewTaskResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Review task not found' })
  @ApiBadRequestResponse({
    description:
      'Task not in IN_REVIEW status, invalid decision, or missing reviewComment for MODIFY',
  })
  @ApiForbiddenResponse({
    description: 'Only assigned reviewer can resolve the task',
  })
  @ApiParam({
    name: 'id',
    type: String,
    format: 'uuid',
    description: 'Review task UUID',
  })
  async resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveReviewTaskDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ReviewTaskResponseDto> {
    return this.reviewService.resolve(id, dto, actor);
  }
}
