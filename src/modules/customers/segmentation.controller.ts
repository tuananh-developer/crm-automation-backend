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
import { SegmentationService } from './segmentation.service.js';
import {
  CreateSegmentDto,
  UpdateSegmentDto,
  QuerySegmentDto,
  EvaluateSegmentDto,
} from './dto/index.js';

@Controller('segments')
export class SegmentationController {
  constructor(private readonly segmentationService: SegmentationService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateSegmentDto) {
    return this.segmentationService.create(dto, 'system-user-id');
  }

  @Get()
  findAll(@Query() query: QuerySegmentDto) {
    return this.segmentationService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.segmentationService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSegmentDto,
  ) {
    return this.segmentationService.update(id, dto, 'system-user-id');
  }

  @Patch(':id/activate')
  @HttpCode(HttpStatus.OK)
  activate(@Param('id', ParseUUIDPipe) id: string) {
    return this.segmentationService.activate(id, 'system-user-id');
  }

  @Patch(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  deactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.segmentationService.deactivate(id, 'system-user-id');
  }

  @Post('evaluate')
  @HttpCode(HttpStatus.OK)
  evaluate(@Body() dto: EvaluateSegmentDto) {
    return this.segmentationService.evaluateCustomer(dto);
  }

  @Get('customers/:customerId')
  getCustomerSegments(@Param('customerId', ParseUUIDPipe) customerId: string) {
    return this.segmentationService.getCustomerSegments(customerId);
  }

  @Get(':id/customers')
  getSegmentCustomers(@Param('id', ParseUUIDPipe) id: string) {
    return this.segmentationService.getSegmentCustomers(id);
  }
}
