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

@Controller('lead-sources')
export class LeadSourcesController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get()
  findAll() {
    return this.leadsService.findAllSources();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.leadsService.findSourceOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateLeadSourceDto) {
    return this.leadsService.createSource(dto);
  }
}
