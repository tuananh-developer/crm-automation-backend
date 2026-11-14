import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CustomersService } from './customers.service.js';
import { QueryCustomerDto } from './dto/index.js';
import { CustomerResponseDto } from './dto/customer-response.dto.js';
import { ApiPaginatedResponse } from '../../common/index.js';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { N8nAuthGuard } from '../lead-intelligence/guards/n8n-auth.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';

@ApiTags('Customers')
@Controller('customers')
@UseGuards(JwtAuthGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @ApiOperation({ summary: 'Get paginated customers' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiPaginatedResponse(CustomerResponseDto)
  findAll(
    @Query() query: QueryCustomerDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<PaginatedResponseDto<CustomerResponseDto>> {
    return this.customersService.findAll(query, actor);
  }

  @Get(':id/internal')
  @Public()
  @UseGuards(N8nAuthGuard)
  @ApiOperation({
    summary: 'Internal service read of customer details for n8n workflows',
  })
  @ApiParam({ name: 'id', description: 'UUID of the customer' })
  @ApiResponse({ status: 200, type: CustomerResponseDto })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized internal service request.',
  })
  @ApiResponse({ status: 404, description: 'Customer not found.' })
  findOneInternal(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CustomerResponseDto> {
    return this.customersService.findOneInternal(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get customer details by ID' })
  @ApiResponse({ status: 200, type: CustomerResponseDto })
  @ApiResponse({ status: 404, description: 'Customer not found.' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<CustomerResponseDto> {
    return this.customersService.findOne(id, actor);
  }
}
