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
import { Throttle } from '@nestjs/throttler';
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
  TriggerCustomer360ResponseDto,
} from './dto/index.js';
import { ApiPaginatedResponse } from '../../common/index.js';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto.js';
import { N8nAuthGuard } from '../lead-intelligence/guards/n8n-auth.guard.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { JwtOrN8nAuthGuard } from '../../common/guards/jwt-or-n8n-auth.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';

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
  @UseGuards(JwtOrN8nAuthGuard)
  @ApiOperation({
    summary: 'Get aggregated Customer 360 view (T12-WF05 / UC05)',
    description:
      'Aggregates CRM profile, converted leads, interaction timeline, lead intelligence, follow-up executions, segments, and AI 360 executive summary. Protected by JWT / service auth and scoped to customer access policy.',
  })
  @ApiParam({ name: 'id', description: 'UUID of the customer' })
  @ApiResponse({
    status: 200,
    description: 'Aggregated Customer 360 data returned successfully.',
    type: Customer360ResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized caller.',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden: Insufficient privileges for this customer.',
  })
  @ApiResponse({ status: 404, description: 'Customer not found.' })
  getCustomer360(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<Customer360ResponseDto> {
    return this.customersService.getCustomer360(id, user);
  }

  @Get(':id/interactions')
  @UseGuards(JwtOrN8nAuthGuard)
  @ApiOperation({
    summary: 'Get customer interactions for Customer 360 timeline',
  })
  @ApiParam({ name: 'id', description: 'UUID of the customer' })
  getCustomerInteractions(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.customersService.getCustomerInteractions(id, user);
  }

  @Get(':id/intelligence')
  @UseGuards(JwtOrN8nAuthGuard)
  @ApiOperation({ summary: 'Get lead intelligence history for Customer 360' })
  @ApiParam({ name: 'id', description: 'UUID of the customer' })
  getCustomerIntelligence(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.customersService.getCustomerIntelligence(id, user);
  }

  @Get(':id/follow-ups')
  @UseGuards(JwtOrN8nAuthGuard)
  @ApiOperation({ summary: 'Get follow-up campaign history for Customer 360' })
  @ApiParam({ name: 'id', description: 'UUID of the customer' })
  getCustomerFollowUps(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.customersService.getCustomerFollowUps(id, user);
  }

  @Get(':id/segments')
  @UseGuards(JwtOrN8nAuthGuard)
  @ApiOperation({ summary: 'Get segment memberships for Customer 360' })
  @ApiParam({ name: 'id', description: 'UUID of the customer' })
  getCustomerSegments(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.customersService.getCustomerSegments(id, user);
  }

  @Post(':id/360/trigger')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Trigger AI Customer 360 synthesis workflow (T12-WF05)',
    description:
      'Creates a WorkflowRun in PENDING state and dispatches an internal webhook to n8n. Requires authenticated user and rate limits triggers to avoid AI abuse.',
  })
  @ApiParam({ name: 'id', description: 'UUID of the customer' })
  @ApiResponse({
    status: 202,
    description: 'Customer 360 workflow request accepted and queued.',
    type: TriggerCustomer360ResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized caller.',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden: Insufficient privileges for this customer.',
  })
  @ApiResponse({ status: 404, description: 'Customer not found.' })
  triggerCustomer360(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TriggerCustomer360ResponseDto> {
    return this.customersService.triggerCustomer360(id, user);
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
  @ApiResponse({
    status: 400,
    description: 'Workflow run correlation mismatch.',
  })
  @ApiResponse({
    status: 404,
    description: 'Customer or workflow run not found.',
  })
  handleCustomer360Callback(
    @Body() dto: Customer360CallbackDto,
  ): Promise<Customer360CallbackResponseDto> {
    return this.customersService.handleCustomer360Callback(dto);
  }
}
