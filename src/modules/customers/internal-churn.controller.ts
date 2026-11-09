import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { N8nAuthGuard } from '../lead-intelligence/guards/n8n-auth.guard.js';
import { CustomersService } from './customers.service.js';
import { CreateChurnAssessmentDto } from './dto/create-churn-assessment.dto.js';
import { QueryCustomerTaskDto } from './dto/query-customer-task.dto.js';
import { CreateCustomerTaskDto } from './dto/create-customer-task.dto.js';
import { CustomerChurnAssessment } from './entities/customer-churn-assessment.entity.js';
import { CustomerTask } from './entities/customer-task.entity.js';
import { QueryCustomerDto } from './dto/query-customer.dto.js';

@ApiTags('Internal n8n - WF06 Churn Monitoring')
@Controller('internal/n8n')
@UseGuards(N8nAuthGuard)
export class InternalChurnController {
  constructor(private readonly customersService: CustomersService) {}

  @Get('customers')
  @ApiOperation({ summary: 'Get a bounded customer cohort for WF06' })
  getCohort(@Query() query: QueryCustomerDto) {
    return this.customersService.findChurnCustomerCohort(
      query.page,
      query.limit,
    );
  }

  @Get('customers/:customerId/churn-context')
  @ApiOperation({ summary: 'Get sourced CRM signals for a churn assessment' })
  getChurnContext(@Param('customerId', ParseUUIDPipe) customerId: string) {
    return this.customersService.getChurnContext(customerId);
  }

  @Post('customers/:customerId/churn-assessments')
  @ApiOperation({ summary: 'Create a backend-validated churn assessment' })
  createChurnAssessment(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() dto: CreateChurnAssessmentDto,
  ): Promise<CustomerChurnAssessment> {
    return this.customersService.createChurnAssessment(customerId, {
      score: dto.score ?? null,
      riskLevel: dto.riskLevel,
      evidence: dto.evidence,
      coverage: dto.coverage,
      metadata: dto.metadata,
      asOfDate: dto.asOfDate,
      workflowRunId: dto.workflowRunId ?? null,
      policyVersion: dto.policyVersion,
    });
  }
}

@ApiTags('Internal n8n - Customer Tasks')
@Controller('internal/n8n/customer-tasks')
@UseGuards(N8nAuthGuard)
export class InternalCustomerTasksController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @ApiOperation({ summary: 'List customer tasks for internal workflows' })
  findAll(@Query() query: QueryCustomerTaskDto): Promise<CustomerTask[]> {
    return this.customersService.findCustomerTasks(query);
  }

  @Post()
  @ApiOperation({ summary: 'Create or reuse an idempotent customer task' })
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
