import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { CustomersService } from './customers.service.js';
import { QueryCustomerDto } from './dto/index.js';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  findAll(@Query() query: QueryCustomerDto) {
    return this.customersService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.customersService.findOne(id);
  }
}
