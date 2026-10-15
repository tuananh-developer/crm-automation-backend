import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SegmentsService } from './segments.service.js';
import {
  CreateSegmentDto,
  EvaluateSegmentBulkDto,
  EvaluateSegmentDto,
  QuerySegmentDto,
  UpdateSegmentDto,
} from './dto/index.js';
import {
  ApiPaginatedResponse,
  PaginatedResponseDto,
} from '../../common/index.js';
import {
  EvaluateSegmentBulkResponseDto,
  EvaluateSegmentResponseDto,
  DeleteSegmentResponseDto,
  SegmentResponseDto,
} from './dto/segment-response.dto.js';
import { CustomerResponseDto } from './dto/customer-response.dto.js';

@ApiTags('Segments')
@Controller('segments')
export class SegmentsController {
  constructor(private readonly segmentsService: SegmentsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new segment',
    description: 'Creates a new customer segment with the specified criteria.',
  })
  @ApiBody({ type: CreateSegmentDto })
  @ApiResponse({
    status: 201,
    description: 'The segment has been successfully created.',
    type: SegmentResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed or missing required fields.',
  })
  @ApiResponse({
    status: 409,
    description: 'A segment with this name already exists.',
  })
  create(@Body() dto: CreateSegmentDto): Promise<SegmentResponseDto> {
    return this.segmentsService.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get paginated list of segments',
    description:
      'Retrieve segments with optional filtering by status, search, and pagination.',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search term for segment name or description',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'isActive',
    required: false,
    enum: [true, false],
    description: 'Filter segments by active status',
  })
  @ApiPaginatedResponse(SegmentResponseDto, 'Paginated list of segments.')
  findAll(
    @Query() query: QuerySegmentDto,
  ): Promise<PaginatedResponseDto<SegmentResponseDto>> {
    return this.segmentsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get segment details by ID' })
  @ApiParam({ name: 'id', description: 'UUID of the segment' })
  @ApiResponse({
    status: 200,
    description: 'Segment found.',
    type: SegmentResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Segment not found.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<SegmentResponseDto> {
    return this.segmentsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an existing segment' })
  @ApiParam({ name: 'id', description: 'UUID of the segment to update' })
  @ApiBody({ type: UpdateSegmentDto })
  @ApiResponse({
    status: 200,
    description: 'Segment updated successfully.',
    type: SegmentResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Segment not found.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSegmentDto,
  ): Promise<SegmentResponseDto> {
    return this.segmentsService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a segment' })
  @ApiParam({ name: 'id', description: 'UUID of the segment to delete' })
  @ApiResponse({
    status: 200,
    description: 'Segment deleted successfully.',
    type: DeleteSegmentResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Segment not found.' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DeleteSegmentResponseDto> {
    return this.segmentsService.remove(id);
  }

  @Get(':id/customers')
  @ApiOperation({
    summary: 'Get customers in a segment',
    description:
      'Retrieve customers that belong to a specific segment with optional search and pagination.',
  })
  @ApiParam({ name: 'id', description: 'UUID of the segment' })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search term for customer name, email, or company name',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiPaginatedResponse(
    CustomerResponseDto,
    'Paginated list of customers in the segment.',
  )
  getCustomers(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: QuerySegmentDto,
  ): Promise<PaginatedResponseDto<CustomerResponseDto>> {
    return this.segmentsService.getCustomers(id, query);
  }

  @Post(':id/evaluate')
  @ApiOperation({
    summary: 'Evaluate a customer against a segment',
    description:
      'Evaluates whether a specific customer matches the criteria of a segment.',
  })
  @ApiParam({ name: 'id', description: 'UUID of the segment' })
  @ApiBody({ type: EvaluateSegmentDto })
  @ApiResponse({
    status: 200,
    description: 'Evaluation result indicating match status and confidence.',
    type: EvaluateSegmentResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed or missing required fields.',
  })
  @ApiResponse({
    status: 404,
    description: 'Segment or customer not found.',
  })
  evaluateCustomer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EvaluateSegmentDto,
  ): Promise<EvaluateSegmentResponseDto> {
    return this.segmentsService.evaluateCustomer(id, dto);
  }

  @Post(':id/evaluate-all')
  @ApiOperation({
    summary: 'Evaluate all customers against a segment',
    description:
      'Evaluates all customers (or a specified subset) against the criteria of a segment.',
  })
  @ApiParam({ name: 'id', description: 'UUID of the segment' })
  @ApiBody({ type: EvaluateSegmentBulkDto })
  @ApiResponse({
    status: 200,
    description:
      'Batch evaluation results including counts of matched customers.',
    type: EvaluateSegmentBulkResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed or missing required fields.',
  })
  evaluateAll(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EvaluateSegmentBulkDto,
  ): Promise<EvaluateSegmentBulkResponseDto> {
    return this.segmentsService.evaluateAll(id, dto);
  }
}
