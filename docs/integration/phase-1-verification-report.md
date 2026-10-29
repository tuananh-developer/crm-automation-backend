# Phase 1 Verification Report — WF04, WF06, WF07, WF13, WF15

> Date: 2026-10-29
> Phase 1: Survey, verify, prepare integration documentation only.
> No workflow built or activated. No business logic changed.

## 1. Verified Findings vs. Phase 1 Assumptions

### 1.1 API Verification

| API | Contract (07_API_CONTRACT.md) | Controller/Service | Status | Evidence |
|-----|------------------------------|-------------------|--------|----------|
| GET /api/v1/follow-ups/executions/:executionId | Not explicitly listed | `follow-up.controller.ts` — findExecutions (no getById) | **CONTRACT_MISMATCH** | Controller has no `GET /executions/:id` endpoint; only `GET /executions` with query filters |
| POST /api/v1/follow-ups/executions | Listed | `follow-up.controller.ts` — `execute()` | IMPLEMENTED_UNVERIFIED | Returns `ExecuteFollowUpResponseDto` |
| POST /api/v1/follow-ups/executions/:executionId/retry | Listed | `follow-up.controller.ts` — no retry endpoint found | **NOT_IMPLEMENTED** | No `@Post('executions/:id/retry')` in controller |
| POST /api/v1/internal/communication/send | Listed (section 10) | **NOT FOUND** | NOT_IMPLEMENTED | No controller, service, or entity for Communication API |
| GET /api/v1/customers | Listed | `customers.controller.ts` — `findAll()` | IMPLEMENTED_UNVERIFIED | Returns `PaginatedResponseDto<CustomerResponseDto>` |
| GET /api/v1/customers/:customerId | Listed | `customers.controller.ts` — `findOne()` | IMPLEMENTED_UNVERIFIED | Returns `CustomerResponseDto` |
| GET /api/v1/customers/:customerId/churn-assessments | Listed | **NOT FOUND** | NOT_IMPLEMENTED | No controller/service/entity |
| POST /api/v1/customers/:customerId/churn-assessments | Listed | **NOT FOUND** | NOT_IMPLEMENTED | No controller/service/entity |
| GET /api/v1/segments | Listed | `segments.controller.ts` — `@Get()` | IMPLEMENTED_UNVERIFIED | Returns `PaginatedResponseDto<SegmentResponseDto>` |
| GET /api/v1/segments/:segmentId | Listed | `segments.controller.ts` — `@Get(':id')` | IMPLEMENTED_UNVERIFIED | Returns `SegmentResponseDto` |
| POST /api/v1/segments/:segmentId/evaluate | Listed | `segments.controller.ts` — `@Post(':id/evaluate')` | IMPLEMENTED_UNVERIFIED | Returns `EvaluateSegmentResponseDto` |
| POST /api/v1/segments/evaluate-all | Listed | `segments.controller.ts` — `@Post('evaluate-all')` | IMPLEMENTED_UNVERIFIED | Returns `EvaluateSegmentBulkResponseDto` |
| GET /api/v1/segments/:segmentId/customers | Listed | `segments.controller.ts` — `@Get(':id/customers')` | IMPLEMENTED_UNVERIFIED | Returns `PaginatedResponseDto<CustomerResponseDto>` |
| GET /api/v1/customer-contracts/due-for-renewal | Listed | **NOT FOUND** | NOT_IMPLEMENTED | No controller/service/entity |
| GET /api/v1/customer-contracts/:contractId | Listed | **NOT FOUND** | NOT_IMPLEMENTED | No controller/service/entity |
| POST /api/v1/customer-contracts/:contractId/renewal-attempts | Listed | **NOT FOUND** | NOT_IMPLEMENTED | No controller/service/entity |
| GET /api/v1/renewal-attempts/:attemptId | Listed | **NOT FOUND** | NOT_IMPLEMENTED | No controller/service/entity |
| GET/PATCH /api/v1/customers/:customerId/strategic-status | Listed | **NOT FOUND** | NOT_IMPLEMENTED | No controller/service/entity |
| GET /api/v1/customers/:customerId/health-assessments | Listed | **NOT FOUND** | NOT_IMPLEMENTED | No controller/service/entity |
| POST /api/v1/customers/:customerId/health-assessments | Listed | **NOT FOUND** | NOT_IMPLEMENTED | No controller/service/entity |
| GET /api/v1/customers/:customerId/issues | Listed | **NOT FOUND** | NOT_IMPLEMENTED | No controller/service/entity |
| GET /api/v1/customers/:customerId/feedback | Listed | **NOT FOUND** | NOT_IMPLEMENTED | No controller/service/entity |
| GET /api/v1/customer-tasks | Listed | **NOT FOUND** | NOT_IMPLEMENTED | No controller/service/entity |
| POST /api/v1/customer-tasks | Listed | **NOT FOUND** | NOT_IMPLEMENTED | No controller/service/entity |

### 1.2 Correction: API Contract Mismatches

1. **Follow-up execution detail:** Contract says `GET /api/v1/follow-ups/executions/:executionId` but controller only has `GET /api/v1/follow-ups/executions` (list with query filters). No single-execution GET endpoint exists.
2. **Retry endpoint:** Contract lists `POST /api/v1/follow-ups/executions/:executionId/retry` but no such endpoint in controller.
3. **Communication API:** Listed in contract (section 10) but no implementation found anywhere in codebase.

### 1.3 Entities Not Implemented

The following entities are referenced in API contract and workflow design but **do not exist** in the codebase:

- `CustomerTask`
- `CustomerChurnAssessment`
- `CustomerHealthAssessment`
- `CustomerContract`
- `RenewalAttempt`
- `CustomerIssue`
- `CustomerFeedback` (may exist in seed data but no entity/controller)

### 1.4 Correlation ID / Idempotency Verification

| Item | Status | Evidence |
|------|--------|----------|
| `workflowRunId` field in WorkflowRun entity | ✅ EXISTS | `WorkflowRun.id` (UUID, primary key) |
| `correlationId` field in WorkflowRun entity | ❌ NOT EXISTS | No `correlationId` column in WorkflowRun entity |
| `X-Correlation-ID` header handling | ❌ NOT IMPLEMENTED | No middleware/interceptor; CORS allowedHeaders doesn't include it |
| Idempotency in follow-up module | ❌ NOT IMPLEMENTED | No idempotency key check in service |
| Idempotency in lead-intelligence module | ✅ EXISTS | `ReviewTask` idempotency guard in `lead-intelligence.service.ts` |
| Idempotency in data-cleaning module | ✅ EXISTS | Idempotency check in `data-cleaning.service.ts` line 642 |

**Conclusion:** Correlation ID propagation and idempotency are NOT implemented for WF04/WF06/WF07/WF13/WF15. The proposed convention is PROPOSED only.

### 1.5 n8n Workflow Verification

| Workflow | File | Nodes | Status |
|----------|------|-------|--------|
| UC06 Follow-up | `integrations/n8n/workflows/uc06-follow-up-execution.json` | 6 nodes (Webhook, IF, Code, EmailSend, 2x RespondToWebhook) | INCOMPLETE — design requires 12 nodes; direct SMTP in n8n violates boundary (should use backend Communication API) |

**Note:** The existing n8n workflow sends email directly via SMTP, which violates the boundary principle that "n8n should not send SMTP directly." This needs to be addressed.

## 2. Corrections to Phase 1 Assumptions

1. **WF04 Communication API:** Assumed it might exist. Verified: **NOT IMPLEMENTED** — no controller, service, or entity found anywhere in codebase.
2. **WF06 Churn APIs:** Assumed they might exist. Verified: **NOT IMPLEMENTED** — no entity, controller, or service.
3. **WF13 Renewal APIs:** Assumed they might exist. Verified: **NOT IMPLEMENTED** — no entity, controller, or service.
4. **WF15 Health/Strategic/Issues/Feedback/CustomerTask APIs:** Assumed they might exist. Verified: **NOT IMPLEMENTED**.
5. **WF07 "Save Workflow Summary":** Assumed might use WorkflowRun.output_payload. Verified: WorkflowRun entity HAS `output_payload` (jsonb, nullable) — can be reused. But no dedicated endpoint to save summary.
6. **Correlation ID:** Assumed might be implemented. Verified: **NOT IMPLEMENTED** — no middleware, no field in WorkflowRun.
7. **Idempotency:** Assumed might be implemented. Verified: Only in lead-intelligence and data-cleaning. Not in follow-up, customers, review.

## 3. API Reusability Assessment

| API Group | Reusable? | Notes |
|-----------|-----------|-------|
| Follow-up execution (GET/POST) | Yes | Implemented but unverified by HTTP test |
| Customer list/detail | Yes | Implemented, basic CRUD |
| Segment CRUD + evaluate | Yes | Implemented, unverified |
| Review task CRUD | Yes | Implemented, unverified |
| Data cleaning | Yes | Implemented, unverified |
| Communication API | No | Not implemented — critical blocker for WF04, WF13 |
| Churn assessment | No | Not implemented |
| Customer task | No | Not implemented |
| Contract/renewal | No | Not implemented |
| Strategic status | No | Not implemented |
| Health assessment | No | Not implemented |
| Customer issues | No | Not implemented |
| Customer feedback | No | Not implemented |

## 4. Fixtures Verification

| Fixture | JSON Valid | Labeled MOCK | Has _mock field | Secrets | Status |
|---------|-----------|--------------|-----------------|---------|--------|
| wf04-success.mock.json | ✅ | ✅ | ✅ | None | OK |
| wf04-validation-error.mock.json | ✅ | ✅ | ✅ | None | OK |
| wf04-unauthorized.mock.json | ✅ | ✅ | ✅ | None | OK |
| wf04-timeout.mock.json | ✅ | ✅ | ✅ | None | OK |
| wf06-success.mock.json | ✅ | ✅ | ✅ | None | OK |
| wf06-insufficient-data.mock.json | ✅ | ✅ | ✅ | None | OK |
| wf07-success.mock.json | ✅ | ✅ | ✅ | None | OK |
| wf07-anomaly.mock.json | ✅ | ✅ | ✅ | None | OK |
| wf13-success.mock.json | ✅ | ✅ | ✅ | None | OK |
| wf13-policy-denied.mock.json | ✅ | ✅ | ✅ | None | OK |
| wf15-success.mock.json | ✅ | ✅ | ✅ | None | OK |
| wf15-insufficient-data.mock.json | ✅ | ✅ | ✅ | None | OK |

All fixtures are valid JSON, labeled `_mock: true`, no secrets, no production data. ✅

## 5. Node-Level Responsibility Check

### WF04 — Nodes that violate boundaries:
- Node 6 (Backend Send Message): Calls Communication API which is NOT_IMPLEMENTED. n8n cannot send email directly (violates boundary). **BLOCKER.**
- Existing n8n workflow sends SMTP directly — violates "n8n should not send SMTP directly" principle.

### WF13 — Nodes that violate boundaries:
- Node 10 (Backend Send Message): Same Communication API blocker.
- Node 11 (Create/Ensure Renewal Approval Task): CustomerTask API not implemented.

### WF15 — Nodes that violate boundaries:
- Node 12 (Ensure CustomerTask/Notify Owner): CustomerTask API not implemented.

### WF06 — Nodes that violate boundaries:
- Node 8 (Evaluate Backend Churn Policy): Churn assessment API not implemented.
- Node 12 (Ensure CustomerTask): CustomerTask API not implemented.

## 6. Updated Blocker List

| # | Blocker | Workflow(s) | Severity | Owner Needed |
|---|---------|-------------|----------|--------------|
| 1 | Communication API not implemented | WF04, WF13 | CRITICAL | Backend |
| 2 | CustomerTask entity/API not implemented | WF06, WF13, WF15 | CRITICAL | Backend |
| 3 | ChurnAssessment entity/API not implemented | WF06 | CRITICAL | Backend |
| 4 | HealthAssessment entity/API not implemented | WF15 | CRITICAL | Backend |
| 5 | CustomerContract/RenewalAttempt entity/API not implemented | WF13 | CRITICAL | Backend |
| 6 | Strategic status endpoint not implemented | WF15 | HIGH | Backend |
| 7 | Customer issues/feedback endpoints not implemented | WF15 | HIGH | Backend |
| 8 | Save Workflow Summary endpoint not found | WF07 | MEDIUM | Backend (can reuse WorkflowRun.output_payload) |
| 9 | Correlation ID not implemented (no middleware, no field) | All | HIGH | Backend |
| 10 | Idempotency not implemented for follow-up/segmentation | WF04, WF07 | HIGH | Backend |
| 11 | n8n existing workflow sends SMTP directly | WF04 | HIGH | Integration team |
| 12 | No test environment available | All | MEDIUM | DevOps/Backend |

## 7. Conditions to Proceed to Phase 2

Before starting workflow construction, the following must be confirmed:

1. ✅ API contract survey completed (this document)
2. ❌ Communication API implemented or approved alternative
3. ❌ CustomerTask entity and API implemented
4. ❌ ChurnAssessment entity and API implemented
5. ❌ HealthAssessment entity and API implemented
6. ❌ CustomerContract and RenewalAttempt entity and API implemented
7. ❌ Strategic status endpoint implemented
8. ❌ Customer issues and feedback endpoints implemented
9. ❌ Correlation ID middleware implemented
10. ❌ Idempotency mechanism implemented
11. ❌ Test environment available
12. ❌ Backend team confirmation received for all APIs

**Phase 2 (workflow construction) should NOT begin until items 2-12 are resolved.**

## 8. Files Created/Updated in Phase 1

### Created:
- `docs/integration/workflow-contracts.md` (updated with responsibility boundary + credential rules + idempotency convention)
- `docs/integration/phase-1-checklist.md`
- `docs/integration/api-dependency-matrix.md`
- `docs/integration/backend-confirmation.md`
- `docs/integration/test-plan.md`
- `docs/integration/phase-1-verification-report.md`
- `test/fixtures/integration/wf04-*.mock.json` (4 files)
- `test/fixtures/integration/wf06-*.mock.json` (2 files)
- `test/fixtures/integration/wf07-*.mock.json` (2 files)
- `test/fixtures/integration/wf13-*.mock.json` (2 files)
- `test/fixtures/integration/wf15-*.mock.json` (2 files)

### No code changes made. No workflows built or activated. No commits or pushes.
