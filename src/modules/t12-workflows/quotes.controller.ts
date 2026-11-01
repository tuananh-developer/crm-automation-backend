import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';
import {
  CreateCatalogItemDto,
  DecideQuoteApprovalDto,
  StartQuoteDraftDto,
  UpdateCatalogItemDto,
} from './dto/index.js';
import { QuotesService } from './quotes.service.js';

@ApiTags('Quotes and Catalog')
@Controller()
@UseGuards(JwtAuthGuard)
export class QuotesController {
  constructor(private readonly service: QuotesService) {}

  @Get('catalog/items')
  @ApiOperation({ summary: 'List active product catalog items' })
  listCatalog() {
    return this.service.listCatalog();
  }

  @Post('catalog/items')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a catalog item (Admin only)' })
  createCatalog(
    @Body() dto: CreateCatalogItemDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.createCatalogItem(dto, actor);
  }

  @Patch('catalog/items/:id')
  @ApiOperation({
    summary: 'Update catalog item pricing or availability (Admin only)',
  })
  updateCatalog(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCatalogItemDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.updateCatalogItem(id, dto, actor);
  }

  @Get('quotes/:quoteId')
  @ApiOperation({
    summary:
      'Read a quote and its backend-calculated line items/approval state',
  })
  getQuote(
    @Param('quoteId', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.getQuote(id, actor);
  }

  @Get('quotes')
  @ApiOperation({ summary: 'List quotes visible to the current user' })
  listQuotes(@CurrentUser() actor: AuthenticatedUser) {
    return this.service.listQuotes(actor);
  }

  @Post('quotes/requests')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Request a quote draft from the AI proposal workflow',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  requestDraft(
    @Body() dto: StartQuoteDraftDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.requestDraft(dto, actor, key);
  }

  @Post('quotes/:quoteId/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a pending quote (Admin only)' })
  decideApproval(
    @Param('quoteId', ParseUUIDPipe) id: string,
    @Body() dto: DecideQuoteApprovalDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.decideApproval(id, dto, actor, true);
  }

  @Post('quotes/:quoteId/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a pending quote (Admin only)' })
  rejectApproval(
    @Param('quoteId', ParseUUIDPipe) id: string,
    @Body() dto: DecideQuoteApprovalDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.decideApproval(id, dto, actor, false);
  }
}
