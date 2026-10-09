import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { SequencesService } from './sequences.service.js';
import {
  CreateSequenceDto,
  CreateStepDto,
  EnrollLeadDto,
  UpdateSequenceDto,
  UpdateStepDto,
} from './dto/index.js';
import { FollowUpSequenceStatus } from './enums/follow-up.enum.js';

@Controller('sequences')
export class SequencesController {
  constructor(private readonly sequencesService: SequencesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createSequence(@Body() dto: CreateSequenceDto) {
    return this.sequencesService.createSequence(dto);
  }

  @Get()
  findAllSequences(@Query('status') status?: FollowUpSequenceStatus) {
    return this.sequencesService.findAllSequences(status);
  }

  @Get(':id')
  findSequenceById(@Param('id', ParseUUIDPipe) id: string) {
    return this.sequencesService.findSequenceById(id);
  }

  @Patch(':id')
  updateSequence(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSequenceDto,
  ) {
    return this.sequencesService.updateSequence(id, dto);
  }

  @Post(':id/steps')
  @HttpCode(HttpStatus.CREATED)
  createStep(
    @Param('id', ParseUUIDPipe) sequenceId: string,
    @Body() dto: CreateStepDto,
  ) {
    return this.sequencesService.createStep(sequenceId, dto);
  }

  @Get(':id/steps')
  findStepsBySequence(@Param('id', ParseUUIDPipe) sequenceId: string) {
    return this.sequencesService.findStepsBySequence(sequenceId);
  }

  @Patch(':sequenceId/steps/:stepId')
  updateStep(
    @Param('stepId', ParseUUIDPipe) stepId: string,
    @Body() dto: UpdateStepDto,
  ) {
    return this.sequencesService.updateStep(stepId, dto);
  }

  @Patch('steps/:stepId')
  updateStepDirect(
    @Param('stepId', ParseUUIDPipe) stepId: string,
    @Body() dto: UpdateStepDto,
  ) {
    return this.sequencesService.updateStep(stepId, dto);
  }

  @Post(':id/enroll')
  @HttpCode(HttpStatus.CREATED)
  enrollLead(
    @Param('id', ParseUUIDPipe) sequenceId: string,
    @Body() dto: EnrollLeadDto,
  ) {
    return this.sequencesService.enrollLead({
      ...dto,
      sequenceId,
    });
  }
}
