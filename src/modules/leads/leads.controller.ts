import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { LeadsService } from './leads.service.js';
import { PaginatedResponseDto } from '../../common/index.js';
import {
  ConvertLeadDto,
  ConvertLeadResponseDto,
  CreateLeadDto,
  LeadResponseDto,
  QueryLeadDto,
  UpdateLeadDto,
} from './dto/index.js';

@ApiTags('Leads')
@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new Lead (UC01)',
    description:
      'Creates a new lead in status NEW, associates it with a lead source, and dispatches a lead.created event to RabbitMQ.',
  })
  @ApiBody({ type: CreateLeadDto })
  @ApiResponse({
    status: 201,
    description: 'The lead has been successfully created.',
    type: LeadResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed or missing required fields.',
  })
  @ApiResponse({
    status: 409,
    description: 'A lead with this email address already exists.',
  })
  @ApiResponse({
    status: 429,
    description:
      'Too many requests. Rate limit exceeded (maximum 10 requests per minute).',
  })
  async create(@Body() createLeadDto: CreateLeadDto): Promise<LeadResponseDto> {
    return this.leadsService.create(createLeadDto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get paginated list of leads',
    description:
      'Retrieve leads with optional filtering by status, search, and pagination.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of leads.',
    type: PaginatedResponseDto,
  })
  async findAll(
    @Query() query: QueryLeadDto,
  ): Promise<PaginatedResponseDto<LeadResponseDto>> {
    return this.leadsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get lead details by ID' })
  @ApiParam({ name: 'id', description: 'UUID of the lead' })
  @ApiResponse({
    status: 200,
    description: 'Lead found.',
    type: LeadResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Lead not found.' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<LeadResponseDto> {
    return this.leadsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an existing lead' })
  @ApiParam({ name: 'id', description: 'UUID of the lead' })
  @ApiBody({ type: UpdateLeadDto })
  @ApiResponse({
    status: 200,
    description: 'Lead updated successfully.',
    type: LeadResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Lead not found.' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateLeadDto: UpdateLeadDto,
  ): Promise<LeadResponseDto> {
    return this.leadsService.update(id, updateLeadDto);
  }

  @Post(':id/convert')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Convert a qualified lead into a customer (UC08)',
    description:
      'Chuyển đổi lead đạt chuẩn (QUALIFIED) thành Customer, chống trùng lặp và ghi nhận audit log.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID của lead cần convert',
    format: 'uuid',
  })
  @ApiBody({ type: ConvertLeadDto })
  @ApiResponse({
    status: 201,
    description: 'Chuyển đổi lead thành công.',
    type: ConvertLeadResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Lead không ở trạng thái QUALIFIED.',
  })
  @ApiResponse({ status: 404, description: 'Lead hoặc User không tồn tại.' })
  @ApiResponse({
    status: 409,
    description:
      'Lead đã được chuyển đổi trước đó hoặc trùng lặp khách hàng mơ hồ.',
  })
  async convert(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() convertLeadDto: ConvertLeadDto,
  ): Promise<ConvertLeadResponseDto> {
    return this.leadsService.convert(id, convertLeadDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a lead' })
  @ApiParam({ name: 'id', description: 'UUID of the lead' })
  @ApiResponse({ status: 200, description: 'Lead removed successfully.' })
  @ApiResponse({ status: 404, description: 'Lead not found.' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.leadsService.remove(id);
  }
}
