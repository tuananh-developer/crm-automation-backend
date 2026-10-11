import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ReviewService } from './review.service.js';
import {
  AssignReviewTaskDto,
  CreateReviewTaskDto,
  ResolveReviewTaskDto,
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

@ApiTags('Review Tasks')
@ApiBearerAuth('JWT-auth')
@Controller('review-tasks')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a review task',
    description: 'Creates a new human review task for a lead',
  })
  @ApiCreatedResponse({ description: 'Review task created successfully' })
  @ApiBadRequestResponse({ description: 'Invalid input data' })
  @ApiForbiddenResponse({ description: 'Workflow run does not belong to lead' })
  create(@Body() dto: CreateReviewTaskDto) {
    return this.reviewService.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List all review tasks',
    description: 'Returns a list of all review tasks',
  })
  @ApiOkResponse({ description: 'Review tasks retrieved successfully' })
  findAll() {
    return this.reviewService.findAll();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a review task by ID',
    description: 'Returns a single review task by its UUID',
  })
  @ApiOkResponse({ description: 'Review task found' })
  @ApiNotFoundResponse({ description: 'Review task not found' })
  @ApiParam({
    name: 'id',
    type: String,
    format: 'uuid',
    description: 'Review task UUID',
  })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.reviewService.findOne(id);
  }

  @Patch(':id/assign')
  @ApiOperation({
    summary: 'Assign a review task',
    description:
      'Assigns a review task to a reviewer (must be SALES role and ACTIVE status)',
  })
  @ApiOkResponse({ description: 'Review task assigned successfully' })
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
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignReviewTaskDto,
  ) {
    return this.reviewService.assign(id, dto);
  }

  @Patch(':id/start')
  @ApiOperation({
    summary: 'Start a review task',
    description: 'Marks a review task as IN_REVIEW by the assigned reviewer',
  })
  @ApiOkResponse({ description: 'Review task started successfully' })
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
  start(@Param('id', ParseUUIDPipe) id: string) {
    return this.reviewService.start(id);
  }

  @Patch(':id/resolve')
  @ApiOperation({
    summary: 'Resolve a review task',
    description:
      'Resolves a review task with APPROVE, REJECT, or MODIFY decision. MODIFY requires reviewComment.',
  })
  @ApiOkResponse({ description: 'Review task resolved successfully' })
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
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveReviewTaskDto,
  ) {
    return this.reviewService.resolve(id, dto);
  }
}
