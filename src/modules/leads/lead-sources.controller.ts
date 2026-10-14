import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { LeadsService } from './leads.service.js';
import { CreateLeadSourceDto, LeadSourceResponseDto } from './dto/index.js';

@ApiTags('Lead Sources')
@Controller('lead-sources')
export class LeadSourcesController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all lead sources' })
  @ApiResponse({
    status: 200,
    description: 'List of all active lead sources.',
    type: [LeadSourceResponseDto],
  })
  async findAll(): Promise<LeadSourceResponseDto[]> {
    return this.leadsService.findAllSources();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get lead source by ID' })
  @ApiParam({ name: 'id', description: 'UUID of the lead source' })
  @ApiResponse({
    status: 200,
    description: 'Lead source details.',
    type: LeadSourceResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Lead source not found.' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<LeadSourceResponseDto> {
    return this.leadsService.findSourceOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new lead source' })
  @ApiBody({ type: CreateLeadSourceDto })
  @ApiResponse({
    status: 201,
    description: 'Lead source created successfully.',
    type: LeadSourceResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'Lead source name already exists.',
  })
  async create(
    @Body() dto: CreateLeadSourceDto,
  ): Promise<LeadSourceResponseDto> {
    return this.leadsService.createSource(dto);
  }
}
