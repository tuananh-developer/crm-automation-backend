import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CustomerResponseDto } from './customer-response.dto.js';

export class SourceCoverageDto {
  @ApiProperty({ example: 'AVAILABLE' })
  crmProfile!: string;

  @ApiProperty({ example: 'AVAILABLE' })
  interactions!: string;

  @ApiProperty({ example: 'AVAILABLE' })
  leadIntelligence!: string;

  @ApiProperty({ example: 'AVAILABLE' })
  followUps!: string;

  @ApiProperty({ example: 'AVAILABLE' })
  segments!: string;

  @ApiProperty({ example: 'NOT_CONNECTED' })
  customerIssues!: string;

  @ApiProperty({ example: 'NOT_CONNECTED' })
  customerFeedback!: string;
}

export class Customer360AiSummaryDto {
  @ApiProperty({
    example:
      'Long-term enterprise customer with consistent high-value engagements and solid expansion potential.',
  })
  summary!: string;

  @ApiProperty({
    example: [
      'Strong C-level relationships',
      'Frequent follow-up cadence adherence',
    ],
  })
  keyStrengths!: string[];

  @ApiProperty({
    example: [
      'No support ticket integration connected yet',
      'Renewal due in 90 days',
    ],
  })
  potentialRisks!: string[];

  @ApiProperty({
    example: [
      'Upsell enterprise automation module',
      'Expand seat licenses for APAC team',
    ],
  })
  growthOpportunities!: string[];

  @ApiProperty({
    example: 'Schedule strategic quarterly business review with CTO.',
  })
  recommendedNextAction!: string;

  @ApiPropertyOptional({ example: 'gemini-3.5-flash-lite' })
  aiModel?: string;

  @ApiPropertyOptional({ example: '2026-10-28T23:50:00Z' })
  evaluatedAt?: string;
}

export class Customer360ResponseDto {
  @ApiProperty({ type: CustomerResponseDto })
  customer!: CustomerResponseDto;

  @ApiProperty({
    type: [Object],
    description: 'Leads converted into this customer',
  })
  convertedLeads!: any[];

  @ApiProperty({
    type: [Object],
    description: 'Chronological timeline of all customer interactions',
  })
  interactions!: any[];

  @ApiProperty({ description: 'Lead intelligence history prior to conversion' })
  intelligence!: {
    qualifications: any[];
    enrichments: any[];
    scores: any[];
  };

  @ApiProperty({
    description: 'Follow-up campaign cadence and execution records',
  })
  followUps!: {
    enrollments: any[];
    executions: any[];
  };

  @ApiProperty({ type: [Object], description: 'Assigned customer segments' })
  segments!: any[];

  @ApiProperty({
    type: SourceCoverageDto,
    description: 'Source coverage indicators with NOT_CONNECTED markers',
  })
  sourceCoverage!: SourceCoverageDto;

  @ApiPropertyOptional({
    type: Customer360AiSummaryDto,
    description: 'Latest AI-synthesized 360 analysis',
  })
  aiSummary!: Customer360AiSummaryDto | null;

  @ApiPropertyOptional({
    description: 'Correlation details for active or latest workflow run',
  })
  latestWorkflowRun!: {
    id: string;
    status: string;
    startedAt?: Date | null;
    completedAt?: Date | null;
  } | null;
}
