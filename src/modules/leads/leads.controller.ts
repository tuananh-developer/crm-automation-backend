import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { LeadsService } from './leads.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { N8nAuthGuard } from '../lead-intelligence/guards/n8n-auth.guard.js';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';
import { PaginatedResponseDto } from '../../common/index.js';
import {
  ConvertLeadResponseDto,
  CreateLeadDto,
  LeadResponseDto,
  QueryLeadDto,
  UpdateLeadDto,
} from './dto/index.js';

@ApiTags('Leads')
@Controller('leads')
@UseGuards(JwtAuthGuard)
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
  async create(
    @Body() createLeadDto: CreateLeadDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<LeadResponseDto> {
    return this.leadsService.create(createLeadDto, actor);
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
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<PaginatedResponseDto<LeadResponseDto>> {
    return this.leadsService.findAll(query, actor);
  }

  @Get(':id/internal')
  @Public()
  @UseGuards(N8nAuthGuard)
  @ApiOperation({
    summary: 'Internal endpoint to get lead profile for n8n workflows',
  })
  @ApiParam({ name: 'id', description: 'UUID of the lead' })
  @ApiResponse({
    status: 200,
    description: 'Lead profile returned successfully.',
    type: LeadResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized n8n request.' })
  @ApiResponse({ status: 404, description: 'Lead not found.' })
  async findOneInternal(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<LeadResponseDto> {
    return this.leadsService.findOneInternal(id);
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
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<LeadResponseDto> {
    return this.leadsService.findOne(id, actor);
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
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<LeadResponseDto> {
    return this.leadsService.update(id, updateLeadDto, actor);
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
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ConvertLeadResponseDto> {
    return this.leadsService.convert(id, actor);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a lead' })
  @ApiParam({ name: 'id', description: 'UUID of the lead' })
  @ApiResponse({ status: 200, description: 'Lead removed successfully.' })
  @ApiResponse({ status: 404, description: 'Lead not found.' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<{ success: boolean; message: string }> {
    return this.leadsService.remove(id, actor);
  }

  @Get(':id/interactions')
  @ApiOperation({
    summary: 'List interactions for a lead',
    description:
      'Returns the latest interactions and profile signals for a lead. Used by n8n workflows to build AI context.',
  })
  @ApiParam({ name: 'id', description: 'UUID of the lead' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'List of interactions.' })
  @ApiResponse({ status: 404, description: 'Lead not found.' })
  async findInteractions(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit', new ParseIntPipe({ optional: true }))
    limit: number | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.leadsService.findInteractions(id, limit ?? 20, actor);
  }
}
