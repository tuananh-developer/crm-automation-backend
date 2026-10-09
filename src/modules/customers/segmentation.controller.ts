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
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';

@ApiTags('Segments')
@ApiBearerAuth('JWT-auth')
@Controller('segments')
export class SegmentationController {
  constructor(private readonly segmentationService: SegmentationService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new segment',
    description: 'Creates a new customer segment with optional criteria',
  })
  @ApiCreatedResponse({ description: 'Segment created successfully' })
  @ApiBadRequestResponse({ description: 'Invalid input data' })
  create(@Body() dto: CreateSegmentDto) {
    return this.segmentationService.create(dto, 'system-user-id');
  }

  @Get()
  @ApiOperation({
    summary: 'List all segments',
    description:
      'Returns a paginated list of segments with optional filtering, search, and status filter',
  })
  @ApiOkResponse({ description: 'Segments retrieved successfully' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'search', required: false, type: String, example: 'vip' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean, example: true })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    type: String,
    example: 'createdAt',
  })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    type: String,
    example: 'DESC',
  })
  findAll(@Query() query: QuerySegmentDto) {
    return this.segmentationService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a segment by ID',
    description: 'Returns a single segment by its UUID',
  })
  @ApiOkResponse({ description: 'Segment found' })
  @ApiNotFoundResponse({ description: 'Segment not found' })
  @ApiParam({
    name: 'id',
    type: String,
    format: 'uuid',
    description: 'Segment UUID',
  })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.segmentationService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a segment',
    description: 'Updates an existing segment with the provided information',
  })
  @ApiOkResponse({ description: 'Segment updated successfully' })
  @ApiNotFoundResponse({ description: 'Segment not found' })
  @ApiBadRequestResponse({ description: 'Invalid input data' })
  @ApiParam({
    name: 'id',
    type: String,
    format: 'uuid',
    description: 'Segment UUID',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSegmentDto,
  ) {
    return this.segmentationService.update(id, dto, 'system-user-id');
  }

  @Patch(':id/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Activate a segment',
    description: 'Activates a deactivated segment',
  })
  @ApiOkResponse({ description: 'Segment activated successfully' })
  @ApiNotFoundResponse({ description: 'Segment not found' })
  @ApiParam({
    name: 'id',
    type: String,
    format: 'uuid',
    description: 'Segment UUID',
  })
  activate(@Param('id', ParseUUIDPipe) id: string) {
    return this.segmentationService.activate(id, 'system-user-id');
  }

  @Patch(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Deactivate a segment',
    description: 'Deactivates an active segment',
  })
  @ApiOkResponse({ description: 'Segment deactivated successfully' })
  @ApiNotFoundResponse({ description: 'Segment not found' })
  @ApiParam({
    name: 'id',
    type: String,
    format: 'uuid',
    description: 'Segment UUID',
  })
  deactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.segmentationService.deactivate(id, 'system-user-id');
  }

  @Post('evaluate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Evaluate customer for segment',
    description: 'Evaluates if a customer matches a segment criteria',
  })
  @ApiOkResponse({ description: 'Evaluation completed successfully' })
  @ApiBadRequestResponse({ description: 'Invalid input data' })
  @ApiNotFoundResponse({ description: 'Customer or segment not found' })
  evaluate(@Body() dto: EvaluateSegmentDto) {
    return this.segmentationService.evaluateCustomer(dto);
  }

  @Get('customers/:customerId')
  @ApiOperation({
    summary: 'Get segments for a customer',
    description: 'Returns all segments a customer belongs to',
  })
  @ApiOkResponse({ description: 'Customer segments retrieved successfully' })
  @ApiNotFoundResponse({ description: 'Customer not found' })
  @ApiParam({
    name: 'customerId',
    type: String,
    format: 'uuid',
    description: 'Customer UUID',
  })
  getCustomerSegments(@Param('customerId', ParseUUIDPipe) customerId: string) {
    return this.segmentationService.getCustomerSegments(customerId);
  }

  @Get(':id/customers')
  @ApiOperation({
    summary: 'Get customers in a segment',
    description: 'Returns all customers assigned to a specific segment',
  })
  @ApiOkResponse({ description: 'Segment customers retrieved successfully' })
  @ApiNotFoundResponse({ description: 'Segment not found' })
  @ApiParam({
    name: 'id',
    type: String,
    format: 'uuid',
    description: 'Segment UUID',
  })
  getSegmentCustomers(@Param('id', ParseUUIDPipe) id: string) {
    return this.segmentationService.getSegmentCustomers(id);
  }
}
