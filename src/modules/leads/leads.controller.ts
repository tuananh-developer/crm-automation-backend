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
import { LeadsService } from './leads.service.js';
import {
  CreateLeadDto,
  QueryLeadDto,
  UpdateLeadDto,
  ConvertLeadDto,
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

@ApiTags('Leads')
@ApiBearerAuth('JWT-auth')
@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new lead',
    description: 'Creates a new lead with the provided information',
  })
  @ApiCreatedResponse({ description: 'Lead created successfully' })
  @ApiBadRequestResponse({ description: 'Invalid input data' })
  create(@Body() createLeadDto: CreateLeadDto) {
    return this.leadsService.create(createLeadDto);
  }

  @Get()
  @ApiOperation({
    summary: 'List all leads',
    description:
      'Returns a paginated list of leads with optional filtering, sorting, and search',
  })
  @ApiOkResponse({ description: 'List of leads retrieved successfully' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'search', required: false, type: String, example: 'john' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'CONVERTED', 'LOST'],
  })
  @ApiQuery({ name: 'sourceId', required: false, type: String, format: 'uuid' })
  @ApiQuery({ name: 'ownerId', required: false, type: String, format: 'uuid' })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    type: String,
    example: 'createdAt',
  })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    enum: ['ASC', 'DESC', 'asc', 'desc'],
  })
  findAll(@Query() query: QueryLeadDto) {
    return this.leadsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a lead by ID',
    description: 'Returns a single lead by its UUID',
  })
  @ApiOkResponse({ description: 'Lead found' })
  @ApiNotFoundResponse({ description: 'Lead not found' })
  @ApiParam({
    name: 'id',
    type: String,
    format: 'uuid',
    description: 'Lead UUID',
  })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.leadsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a lead',
    description: 'Updates an existing lead with the provided information',
  })
  @ApiOkResponse({ description: 'Lead updated successfully' })
  @ApiNotFoundResponse({ description: 'Lead not found' })
  @ApiBadRequestResponse({ description: 'Invalid input data' })
  @ApiParam({
    name: 'id',
    type: String,
    format: 'uuid',
    description: 'Lead UUID',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateLeadDto: UpdateLeadDto,
  ) {
    return this.leadsService.update(id, updateLeadDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete a lead',
    description: 'Deletes a lead by its UUID',
  })
  @ApiOkResponse({ description: 'Lead deleted successfully' })
  @ApiNotFoundResponse({ description: 'Lead not found' })
  @ApiParam({
    name: 'id',
    type: String,
    format: 'uuid',
    description: 'Lead UUID',
  })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.leadsService.remove(id);
  }

  @Post(':id/convert')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Convert a lead to a customer',
    description: 'Converts a qualified lead into a customer',
  })
  @ApiOkResponse({ description: 'Lead converted successfully' })
  @ApiNotFoundResponse({ description: 'Lead not found' })
  @ApiBadRequestResponse({
    description: 'Lead cannot be converted or invalid input',
  })
  @ApiParam({
    name: 'id',
    type: String,
    format: 'uuid',
    description: 'Lead UUID',
  })
  convert(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ConvertLeadDto) {
    return this.leadsService.convertLead(id, dto);
  }
}
