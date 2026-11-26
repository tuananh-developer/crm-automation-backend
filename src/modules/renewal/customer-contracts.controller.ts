import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';
import { RenewalService } from './renewal.service.js';
import {
  ApproveRenewalDraftDto,
  CreateContractDto,
  SaveRenewalDraftDto,
  UpdateContractDto,
} from './dto/renewal.dto.js';

@ApiTags('Customer Contracts & Renewal')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard)
export class CustomerContractsController {
  constructor(private readonly renewalService: RenewalService) {}

  @Get('customer-contracts')
  @ApiOperation({ summary: 'List customer contracts with optional filter' })
  @ApiQuery({ name: 'customerId', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Contracts list' })
  listContracts(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('customerId') customerId?: string,
    @Query('status') status?: string,
  ) {
    return this.renewalService.listContracts({ customerId, status }, actor);
  }

  @Post('customer-contracts')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new customer contract' })
  @ApiBody({ type: CreateContractDto })
  @ApiResponse({ status: 201, description: 'Contract created successfully' })
  @ApiResponse({
    status: 400,
    description: 'Validation failed or start date after end date',
  })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  @ApiResponse({ status: 409, description: 'Contract number already exists' })
  createContract(
    @Body() dto: CreateContractDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.renewalService.createContract(dto, actor);
  }

  @Get('customer-contracts/due-for-renewal')
  @ApiOperation({
    summary: 'List active contracts due for renewal within window',
  })
  @ApiQuery({ name: 'days', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Contracts due for renewal' })
  getDueContracts(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('days') days?: string,
  ) {
    const d = days ? parseInt(days, 10) : 30;
    return this.renewalService.findRenewalContracts(d, actor);
  }

  @Get('customer-contracts/:contractId')
  @ApiOperation({ summary: 'Get a customer contract by ID' })
  @ApiParam({ name: 'contractId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Contract found' })
  @ApiResponse({ status: 404, description: 'Contract not found' })
  getContract(
    @Param('contractId', ParseUUIDPipe) contractId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.renewalService.getContract(contractId, actor);
  }

  @Patch('customer-contracts/:contractId')
  @ApiOperation({ summary: 'Update a customer contract' })
  @ApiParam({ name: 'contractId', format: 'uuid' })
  @ApiBody({ type: UpdateContractDto })
  @ApiResponse({ status: 200, description: 'Contract updated successfully' })
  @ApiResponse({ status: 404, description: 'Contract not found' })
  updateContract(
    @Param('contractId', ParseUUIDPipe) contractId: string,
    @Body() dto: UpdateContractDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.renewalService.updateContract(contractId, dto, actor);
  }

  @Get('customer-contracts/:contractId/renewal-attempts')
  @ApiOperation({ summary: 'List renewal attempts / drafts for a contract' })
  @ApiParam({ name: 'contractId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Renewal attempts list' })
  listRenewalAttempts(
    @Param('contractId', ParseUUIDPipe) contractId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.renewalService.listDraftsForContract(contractId, actor);
  }

  @Post('customer-contracts/:contractId/renewal-attempts')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create or record a renewal attempt for a contract',
  })
  @ApiParam({ name: 'contractId', format: 'uuid' })
  @ApiBody({ type: SaveRenewalDraftDto })
  @ApiResponse({ status: 201, description: 'Renewal attempt recorded' })
  createRenewalAttempt(
    @Param('contractId', ParseUUIDPipe) contractId: string,
    @Body() dto: SaveRenewalDraftDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    dto.contractId = contractId;
    return this.renewalService.saveDraft(dto, actor);
  }

  @Get('customer-contracts/:contractId/approval-tasks')
  @ApiOperation({
    summary: 'List human approval tasks for a customer contract',
  })
  @ApiParam({ name: 'contractId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Approval tasks list' })
  listApprovalTasks(
    @Param('contractId', ParseUUIDPipe) contractId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.renewalService.listApprovalTasksForContract(contractId, actor);
  }

  @Get('renewal-attempts/:attemptId')
  @ApiOperation({ summary: 'Get renewal attempt / draft by ID' })
  @ApiParam({ name: 'attemptId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Renewal attempt found' })
  @ApiResponse({ status: 404, description: 'Renewal attempt not found' })
  getRenewalAttempt(
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.renewalService.getDraft(attemptId, actor);
  }

  @Post('renewal-attempts/:attemptId/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Explicitly approve a renewal draft with audited consent, template, and policy flags',
  })
  @ApiParam({ name: 'attemptId', format: 'uuid' })
  @ApiBody({ type: ApproveRenewalDraftDto })
  @ApiResponse({ status: 200, description: 'Renewal draft approved' })
  approveRenewalAttempt(
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Body() dto: ApproveRenewalDraftDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.renewalService.approveDraft(attemptId, dto, actor);
  }
}
