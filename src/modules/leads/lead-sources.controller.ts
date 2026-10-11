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
import { CreateLeadSourceDto } from './dto/index.js';

@ApiTags('Lead Sources')
@Controller('lead-sources')
export class LeadSourcesController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all lead sources' })
  @ApiResponse({ status: 200, description: 'List of all active lead sources.' })
  findAll() {
    return this.leadsService.findAllSources();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get lead source by ID' })
  @ApiParam({ name: 'id', description: 'UUID of the lead source' })
  @ApiResponse({ status: 200, description: 'Lead source details.' })
  @ApiResponse({ status: 404, description: 'Lead source not found.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.leadsService.findSourceOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new lead source' })
  @ApiBody({ type: CreateLeadSourceDto })
  @ApiResponse({
    status: 201,
    description: 'Lead source created successfully.',
  })
  @ApiResponse({ status: 409, description: 'Lead source name already exists.' })
  create(@Body() dto: CreateLeadSourceDto) {
    return this.leadsService.createSource(dto);
  }
}
