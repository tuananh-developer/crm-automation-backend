# API Dependency Matrix — WF04, WF06, WF07, WF13, WF15

> Phase 1: Survey & Contract Verification Only.

## Status Legend

| Status | Meaning |
|--------|---------|
| `IMPLEMENTED_UNVERIFIED` | Code exists but not verified by test or HTTP request |
| `VERIFIED` | Tested successfully with test or HTTP request |
| `PARTIALLY_IMPLEMENTED` | Only partially supports the contract |
| `CONTRACT_MISMATCH` | Code does not match contract |
| `NOT_IMPLEMENTED` | No implementation found |
| `NEEDS_BACKEND_CONFIRMATION` | Needs backend team confirmation |
| `MOCK_ONLY` | Only fixture/mock data available |

## WF04 — AI CRM Follow-up Agent

| Workflow | Function | Method | Endpoint | Request DTO | Response Schema | Auth | Error Codes | Impl Location | Status |
|----------|----------|--------|----------|-------------|-----------------|------|-------------|---------------|--------|
| WF04 | Get Follow-up Context | GET | `/api/v1/follow-ups/executions/:executionId` | Path param UUID | FollowUpExecutionResponseDto | JWT / Service | 404 | `follow-up.controller.ts` | IMPLEMENTED_UNVERIFIED |
| WF04 | Execute Follow-up Step | POST | `/api/v1/follow-ups/executions` | ExecuteFollowUpDto | ExecuteFollowUpResponseDto | JWT / Service | 400, 404 | `follow-up.controller.ts` | IMPLEMENTED_UNVERIFIED |
| WF04 | Backend Send Message | POST | `/api/v1/internal/communication/send` | (not defined) | (not defined) | Service-to-service | N/A | NOT FOUND | NOT_IMPLEMENTED |
| WF04 | Retry Execution | POST | `/api/v1/follow-ups/executions/:executionId/retry` | Path param UUID | (not defined) | JWT / Service | 400, 404 | `follow-up.controller.ts` | IMPLEMENTED_UNVERIFIED |

## WF06 — AI Churn Monitoring Agent

| Workflow | Function | Method | Endpoint | Request DTO | Response Schema | Auth | Error Codes | Impl Location | Status |
|----------|----------|--------|----------|-------------|-----------------|------|-------------|---------------|--------|
| WF06 | Get Customer Cohort | GET | `/api/v1/customers` | QueryCustomerDto (page, limit, search, status) | PaginatedResponseDto<CustomerResponseDto> | JWT | 401, 403 | `customers.controller.ts` | IMPLEMENTED_UNVERIFIED |
| WF06 | Get Customer Profile | GET | `/api/v1/customers/:customerId` | Path param UUID | CustomerResponseDto | JWT | 404 | `customers.controller.ts` | IMPLEMENTED_UNVERIFIED |
| WF06 | Churn Assessments (GET) | GET | `/api/v1/customers/:customerId/churn-assessments` | Path param UUID | (not defined) | JWT | N/A | NOT FOUND | NOT_IMPLEMENTED |
| WF06 | Churn Assessments (POST) | POST | `/api/v1/customers/:customerId/churn-assessments` | (not defined) | (not defined) | JWT | N/A | NOT FOUND | NOT_IMPLEMENTED |
| WF06 | Customer Tasks (GET) | GET | `/api/v1/customer-tasks` | (not defined) | (not defined) | JWT | N/A | NOT FOUND | NOT_IMPLEMENTED |
| WF06 | Customer Tasks (POST) | POST | `/api/v1/customer-tasks` | (not defined) | (not defined) | JWT | N/A | NOT FOUND | NOT_IMPLEMENTED |

## WF07 — AI Customer Segmentation Agent

| Workflow | Function | Method | Endpoint | Request DTO | Response Schema | Auth | Error Codes | Impl Location | Status |
|----------|----------|--------|----------|-------------|-----------------|------|-------------|---------------|--------|
| WF07 | Get Active Segments | GET | `/api/v1/segments` | QuerySegmentDto | PaginatedResponseDto<SegmentResponseDto> | JWT | 401, 403 | `segments.controller.ts` | IMPLEMENTED_UNVERIFIED |
| WF07 | Get Segment Detail | GET | `/api/v1/segments/:segmentId` | Path param UUID | SegmentResponseDto | JWT | 404 | `segments.controller.ts` | IMPLEMENTED_UNVERIFIED |
| WF07 | Evaluate Segment | POST | `/api/v1/segments/:segmentId/evaluate` | EvaluateSegmentDto | EvaluateSegmentResponseDto | JWT | 400, 404 | `segments.controller.ts` | IMPLEMENTED_UNVERIFIED |
| WF07 | Evaluate All Segments | POST | `/api/v1/segments/evaluate-all` | EvaluateSegmentBulkDto | EvaluateSegmentBulkResponseDto | JWT | 400 | `segments.controller.ts` | IMPLEMENTED_UNVERIFIED |
| WF07 | Get Segment Customers | GET | `/api/v1/segments/:segmentId/customers` | Path param UUID + Query | PaginatedResponseDto<CustomerResponseDto> | JWT | 404 | `segments.controller.ts` | IMPLEMENTED_UNVERIFIED |
| WF07 | Save Workflow Summary | (none) | (no endpoint found) | N/A | N/A | N/A | N/A | NOT FOUND | NOT_IMPLEMENTED |

## WF13 — AI Renewal Management Agent

| Workflow | Function | Method | Endpoint | Request DTO | Response Schema | Auth | Error Codes | Impl Location | Status |
|----------|----------|--------|----------|-------------|-----------------|------|-------------|---------------|--------|
| WF13 | Get Due Contracts | GET | `/api/v1/customer-contracts/due-for-renewal` | (not defined) | (not defined) | JWT | N/A | NOT FOUND | NOT_IMPLEMENTED |
| WF13 | Get Contract Detail | GET | `/api/v1/customer-contracts/:contractId` | (not defined) | (not defined) | JWT | N/A | NOT FOUND | NOT_IMPLEMENTED |
| WF13 | Create Renewal Attempt | POST | `/api/v1/customer-contracts/:contractId/renewal-attempts` | (not defined) | (not defined) | JWT | N/A | NOT FOUND | NOT_IMPLEMENTED |
| WF13 | Get Renewal Attempt | GET | `/api/v1/renewal-attempts/:attemptId` | (not defined) | (not defined) | JWT | N/A | NOT FOUND | NOT_IMPLEMENTED |
| WF13 | Backend Send Message | POST | `/api/v1/internal/communication/send` | (not defined) | (not defined) | Service-to-service | N/A | NOT FOUND | NOT_IMPLEMENTED |

## WF15 — AI Account Management Agent

| Workflow | Function | Method | Endpoint | Request DTO | Response Schema | Auth | Error Codes | Impl Location | Status |
|----------|----------|--------|----------|-------------|-----------------|------|-------------|---------------|--------|
| WF15 | Get/Patch Strategic Status | GET/PATCH | `/api/v1/customers/:customerId/strategic-status` | (not defined) | (not defined) | JWT (Admin/Sales) | N/A | NOT FOUND | NOT_IMPLEMENTED |
| WF15 | Get Customer Detail | GET | `/api/v1/customers/:customerId` | Path param UUID | CustomerResponseDto | JWT | 404 | `customers.controller.ts` | IMPLEMENTED_UNVERIFIED |
| WF15 | Health Assessments (GET) | GET | `/api/v1/customers/:customerId/health-assessments` | (not defined) | (not defined) | JWT | N/A | NOT FOUND | NOT_IMPLEMENTED |
| WF15 | Health Assessments (POST) | POST | `/api/v1/customers/:customerId/health-assessments` | (not defined) | (not defined) | JWT | N/A | NOT FOUND | NOT_IMPLEMENTED |
| WF15 | Customer Issues | GET | `/api/v1/customers/:customerId/issues` | (not defined) | (not defined) | JWT | N/A | NOT FOUND | NOT_IMPLEMENTED |
| WF15 | Customer Feedback | GET | `/api/v1/customers/:customerId/feedback` | (not defined) | (not defined) | JWT | N/A | NOT FOUND | NOT_IMPLEMENTED |
| WF15 | Customer Tasks (GET) | GET | `/api/v1/customer-tasks` | (not defined) | (not defined) | JWT | N/A | NOT FOUND | NOT_IMPLEMENTED |
| WF15 | Customer Tasks (POST) | POST | `/api/v1/customer-tasks` | (not defined) | (not defined) | JWT | N/A | NOT FOUND | NOT_IMPLEMENTED |

## Cross-Workflow Dependencies

| Dependency | Used By | Status |
|------------|---------|--------|
| Customer entity | WF06, WF13, WF15 | IMPLEMENTED (basic CRUD) |
| FollowUpExecution entity | WF04 | IMPLEMENTED |
| Segment entity | WF07 | IMPLEMENTED |
| CustomerTask entity | WF06, WF13, WF15 | NOT_IMPLEMENTED |
| CustomerChurnAssessment entity | WF06 | NOT_IMPLEMENTED |
| CustomerHealthAssessment entity | WF15 | NOT_IMPLEMENTED |
| CustomerContract entity | WF13 | NOT_IMPLEMENTED |
| RenewalAttempt entity | WF13 | NOT_IMPLEMENTED |
| Communication API (internal) | WF04, WF13 | NOT_IMPLEMENTED |
| RabbitMQ event `lead.follow_up.triggered` | WF04 | IMPLEMENTED (constant defined) |
