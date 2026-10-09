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
import { LeadsService } from './leads.service.js';
import { CreateLeadSourceDto } from './dto/index.js';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';

@ApiTags('Lead Sources')
@ApiBearerAuth('JWT-auth')
@Controller('lead-sources')
export class LeadSourcesController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get()
  @ApiOperation({
    summary: 'List all lead sources',
    description: 'Returns a list of all lead sources',
  })
  @ApiOkResponse({ description: 'List of lead sources retrieved successfully' })
  findAll() {
    return this.leadsService.findAllSources();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a lead source by ID',
    description: 'Returns a single lead source by its UUID',
  })
  @ApiOkResponse({ description: 'Lead source found' })
  @ApiNotFoundResponse({ description: 'Lead source not found' })
  @ApiParam({
    name: 'id',
    type: String,
    format: 'uuid',
    description: 'Lead source UUID',
  })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.leadsService.findSourceOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new lead source',
    description: 'Creates a new lead source with the provided information',
  })
  @ApiCreatedResponse({ description: 'Lead source created successfully' })
  @ApiBadRequestResponse({ description: 'Invalid input data' })
  create(@Body() dto: CreateLeadSourceDto) {
    return this.leadsService.createSource(dto);
  }
}
