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

@Controller('review-tasks')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Post()
  create(@Body() dto: CreateReviewTaskDto) {
    return this.reviewService.create(dto);
  }

  @Get()
  findAll() {
    return this.reviewService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.reviewService.findOne(id);
  }

  @Patch(':id/assign')
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignReviewTaskDto,
  ) {
    return this.reviewService.assign(id, dto);
  }

  @Patch(':id/start')
  start(@Param('id', ParseUUIDPipe) id: string) {
    return this.reviewService.start(id);
  }

  @Patch(':id/resolve')
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveReviewTaskDto,
  ) {
    return this.reviewService.resolve(id, dto);
  }
}
