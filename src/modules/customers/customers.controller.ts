import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
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
import {
  Customer360CallbackDto,
  Customer360CallbackResponseDto,
  Customer360ResponseDto,
  CustomerResponseDto,
  QueryCustomerDto,
  TriggerCustomer360Dto,
  TriggerCustomer360ResponseDto,
} from './dto/index.js';
import { ApiPaginatedResponse } from '../../common/index.js';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto.js';
import { N8nAuthGuard } from '../lead-intelligence/guards/n8n-auth.guard.js';

@ApiTags('Customers')
@Controller('customers')
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
  ): Promise<PaginatedResponseDto<CustomerResponseDto>> {
    return this.customersService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get customer details by ID' })
  @ApiParam({ name: 'id', description: 'UUID of the customer' })
  @ApiResponse({ status: 200, type: CustomerResponseDto })
  @ApiResponse({ status: 404, description: 'Customer not found.' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CustomerResponseDto> {
    return this.customersService.findOne(id);
  }

  @Get(':id/360')
  @ApiOperation({
    summary: 'Get aggregated Customer 360 view (T12-WF05 / UC05)',
    description:
      'Aggregates CRM profile, converted leads, interaction timeline, lead intelligence, follow-up executions, segments, and AI 360 executive summary.',
  })
  @ApiParam({ name: 'id', description: 'UUID of the customer' })
  @ApiResponse({
    status: 200,
    description: 'Aggregated Customer 360 data returned successfully.',
    type: Customer360ResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Customer not found.' })
  getCustomer360(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Customer360ResponseDto> {
    return this.customersService.getCustomer360(id);
  }

  @Post(':id/360/trigger')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Trigger AI Customer 360 synthesis workflow (T12-WF05)',
    description:
      'Creates a WorkflowRun in PENDING state and dispatches an internal webhook to n8n to aggregate timeline and generate Gemini AI insights.',
  })
  @ApiParam({ name: 'id', description: 'UUID of the customer' })
  @ApiResponse({
    status: 202,
    description: 'Customer 360 workflow request accepted and queued.',
    type: TriggerCustomer360ResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Customer not found.' })
  triggerCustomer360(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto?: TriggerCustomer360Dto,
  ): Promise<TriggerCustomer360ResponseDto> {
    return this.customersService.triggerCustomer360(id, dto);
  }

  @Post([
    ':id/360/callback',
    '360/callback',
    '/internal/n8n/customer-360/callback',
  ])
  @UseGuards(N8nAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Receive AI Customer 360 Callback from n8n (T12-WF05)',
    description:
      'Receives synthesized Customer 360 executive summary, opportunities, and risks from Gemini AI in n8n, saving to WorkflowRun outputPayload.',
  })
  @ApiResponse({
    status: 200,
    description: 'Customer 360 callback processed successfully.',
    type: Customer360CallbackResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized n8n webhook request.',
  })
  @ApiResponse({ status: 404, description: 'Customer not found.' })
  handleCustomer360Callback(
    @Body() dto: Customer360CallbackDto,
  ): Promise<Customer360CallbackResponseDto> {
    return this.customersService.handleCustomer360Callback(dto);
  }
}
