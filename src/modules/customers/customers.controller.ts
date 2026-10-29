import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CustomersService } from './customers.service.js';
import {
  CreateChurnAssessmentDto,
  CreateCustomerTaskDto,
  QueryCustomerDto,
  QueryCustomerTaskDto,
} from './dto/index.js';
import { CustomerResponseDto } from './dto/customer-response.dto.js';
import { ApiPaginatedResponse } from '../../common/index.js';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto.js';
import { CustomerChurnAssessment } from './entities/customer-churn-assessment.entity.js';
import { CustomerTask } from './entities/customer-task.entity.js';

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
  @ApiResponse({ status: 200, type: CustomerResponseDto })
  @ApiResponse({ status: 404, description: 'Customer not found.' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CustomerResponseDto> {
    return this.customersService.findOne(id);
  }

  @Get(':customerId/churn-assessments')
  @ApiOperation({ summary: 'Get churn assessments for a customer' })
  async findChurnAssessments(
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ): Promise<CustomerChurnAssessment[]> {
    return this.customersService.findChurnAssessments(customerId);
  }

  @Post(':customerId/churn-assessments')
  @ApiOperation({ summary: 'Create a churn assessment for a customer' })
  async createChurnAssessment(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() dto: CreateChurnAssessmentDto,
  ): Promise<CustomerChurnAssessment> {
    return this.customersService.createChurnAssessment(customerId, {
      score: dto.score,
      riskLevel: dto.riskLevel,
      evidence: dto.evidence,
      coverage: dto.coverage,
      metadata: dto.metadata,
      asOfDate: dto.asOfDate,
      workflowRunId: null,
      policyVersion: dto.policyVersion,
    });
  }
}

@Controller('customer-tasks')
@ApiTags('Customer Tasks')
export class CustomerTasksController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @ApiOperation({ summary: 'List customer tasks' })
  findAll(@Query() query: QueryCustomerTaskDto): Promise<CustomerTask[]> {
    void query;
    return this.customersService.findCustomerTasks();
  }

  @Post()
  @ApiOperation({ summary: 'Create or reuse a retention task' })
  create(@Body() dto: CreateCustomerTaskDto): Promise<CustomerTask | null> {
    return this.customersService.createCustomerTask({
      customerId: dto.customerId,
      assessmentId: dto.assessmentId ?? null,
      taskType: dto.taskType,
      priority: dto.priority,
      notes: dto.notes,
      idempotencyKey: dto.idempotencyKey,
      dueAt: dto.dueAt,
      metadata: dto.metadata,
    });
  }
}
