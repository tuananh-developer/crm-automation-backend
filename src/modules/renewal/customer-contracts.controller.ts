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
import { RenewalAuthGuard } from './guards/renewal-auth.guard.js';
import { RenewalService } from './renewal.service.js';
import {
  CreateContractDto,
  SaveRenewalDraftDto,
  UpdateContractDto,
} from './dto/renewal.dto.js';

@ApiTags('Customer Contracts & Renewal')
@ApiBearerAuth()
@Controller()
@UseGuards(RenewalAuthGuard)
export class CustomerContractsController {
  constructor(private readonly renewalService: RenewalService) {}

  @Get('customer-contracts')
  @ApiOperation({ summary: 'List customer contracts with optional filter' })
  @ApiQuery({ name: 'customerId', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Contracts list' })
  listContracts(
    @Query('customerId') customerId?: string,
    @Query('status') status?: string,
  ) {
    return this.renewalService.listContracts({ customerId, status });
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
  createContract(@Body() dto: CreateContractDto) {
    return this.renewalService.createContract(dto);
  }

  @Get('customer-contracts/due-for-renewal')
  @ApiOperation({
    summary: 'List active contracts due for renewal within window',
  })
  @ApiQuery({ name: 'days', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Contracts due for renewal' })
  getDueContracts(@Query('days') days?: string) {
    const d = days ? parseInt(days, 10) : 30;
    return this.renewalService.findRenewalContracts(d);
  }

  @Get('customer-contracts/:contractId')
  @ApiOperation({ summary: 'Get a customer contract by ID' })
  @ApiParam({ name: 'contractId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Contract found' })
  @ApiResponse({ status: 404, description: 'Contract not found' })
  getContract(@Param('contractId', ParseUUIDPipe) contractId: string) {
    return this.renewalService.getContract(contractId);
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
  ) {
    return this.renewalService.updateContract(contractId, dto);
  }

  @Get('customer-contracts/:contractId/renewal-attempts')
  @ApiOperation({ summary: 'List renewal attempts / drafts for a contract' })
  @ApiParam({ name: 'contractId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Renewal attempts list' })
  listRenewalAttempts(@Param('contractId', ParseUUIDPipe) contractId: string) {
    return this.renewalService.listDraftsForContract(contractId);
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
  ) {
    dto.contractId = contractId;
    return this.renewalService.saveDraft(dto);
  }

  @Get('renewal-attempts/:attemptId')
  @ApiOperation({ summary: 'Get renewal attempt / draft by ID' })
  @ApiParam({ name: 'attemptId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Renewal attempt found' })
  @ApiResponse({ status: 404, description: 'Renewal attempt not found' })
  getRenewalAttempt(@Param('attemptId', ParseUUIDPipe) attemptId: string) {
    return this.renewalService.getDraft(attemptId);
  }
}
