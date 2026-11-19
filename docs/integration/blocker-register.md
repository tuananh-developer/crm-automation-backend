# Blocker Register — WF04, WF06, WF07, WF13, WF15

> Phase 1/2 preparation: Survey and verify only. No workflow built or activated.

## B1. Tracing Mechanism Verification

### Current State

| Item | Status | Evidence |
|------|--------|----------|
| `workflowRunId` created by NestJS | ✅ IMPLEMENTED | `WorkflowRun.id` (UUID primary key) in `src/modules/workflow/entities/workflow-run.entity.ts` |
| `workflowRunId` passed to n8n | ⚠️ PARTIAL | RabbitMQ event envelope includes `workflowRunId` in data (per `08_RABBITMQ_CONTRACT.md`). HTTP calls to n8n may not include it. |
| `correlationId` field in WorkflowRun | ❌ NOT IMPLEMENTED | No `correlationId` column in `WorkflowRun` entity |
| `X-Correlation-ID` header handling | ❌ NOT IMPLEMENTED | No middleware/interceptor. CORS `allowedHeaders` in `main.ts` only includes `Content-Type, Authorization, Accept` — does NOT include `X-Correlation-ID` or `X-Workflow-Run-ID` |
| Correlation across n8n ↔ NestJS | ❌ NOT IMPLEMENTED | No correlation ID propagation mechanism found in code |
| Logs linked between n8n and NestJS | ❌ NOT IMPLEMENTED | No structured correlation logging found |

### Proposed Minimal Solution

1. **Add `correlationId` column to WorkflowRun entity** (UUID, nullable, indexed) — requires DB migration (out of scope for Phase 1, propose for Phase 2)
2. **Add correlation ID middleware** in `main.ts` (read `X-Correlation-ID` from request, generate if missing, set response header)
3. **Update CORS allowedHeaders** to include `X-Correlation-ID`, `X-Workflow-Run-ID`, `X-Idempotency-Key`
4. **Propagate in RabbitMQ events:** Add `correlationId` to event envelope `data` field
5. **n8n:** Pass `X-Correlation-ID` header in all HTTP Request nodes

### Classification

| Component | Status |
|-----------|--------|
| workflowRunId creation | IMPLEMENTED |
| workflowRunId in RabbitMQ events | IMPLEMENTED (for lead.qualification, enrichment, scoring, follow-up, data-cleaning) |
| correlationId field | NOT_IMPLEMENTED |
| correlationId middleware | NOT_IMPLEMENTED |
| correlationId propagation in HTTP | NOT_IMPLEMENTED |
| correlationId in n8n workflows | NOT_IMPLEMENTED |

---

## B2. Idempotency Verification

### Current State

| Module | Idempotency Mechanism | Evidence |
|--------|----------------------|----------|
| lead-intelligence | ReviewTask idempotency guard | `lead-intelligence.service.ts` line 205: "Check if a pending ReviewTask already exists for this lead" |
| lead-intelligence | Score idempotency check | `lead-intelligence.service.ts` line 920: "Perform idempotency check to avoid duplicate score creation" |
| data-cleaning | Idempotency check in apply | `data-cleaning.service.ts` line 642: "Idempotency check: Skip if already applied" |
| follow-up | Execution dedup via advisory lock + status check | `follow-up.service.ts` line 124: "Serialize concurrent executions of the same step to avoid duplicates"; line 154: "Reuse the existing record when retrying" |
| follow-up | Enrollment duplicate check | `follow-up.service.ts` line 461: "Lead is already actively enrolled" (ConflictException) |
| customers/segments | ❌ None | No idempotency check found in segments.service.ts |
| review | ❌ None | No idempotency check found |

### Idempotency Key Proposal

| Workflow | Idempotency Key | Scope | Backend Responsibility |
|----------|----------------|-------|----------------------|
| WF04 | `executionId` (FollowUpExecution.id) | Per execution | Backend checks execution status before processing |
| WF06 | `customerId` + `asOfDate` | Per customer per day | Backend checks existing ChurnAssessment for same day |
| WF07 | `segmentId` + `asOfDate` | Per segment per run | Backend checks existing evaluation result |
| WF13 | `contractId` + `renewalWindow` | Per contract per renewal cycle | Backend checks existing RenewalAttempt |
| WF15 | `customerId` + `weekNumber` | Per customer per week | Backend checks existing HealthAssessment |

### Risk Assessment

- **WF04:** Low risk — execution status check prevents duplicate processing. Advisory lock prevents concurrent duplicates.
- **WF06/WF07/WF13/WF15:** High risk — no idempotency mechanism exists. Need backend implementation.
- **workflowRunId as idempotency key:** NOT recommended — different runs can represent the same business event.

### Status: PROPOSED (needs backend confirmation)

---

## B3. Email Sending (n8n SMTP) Verification

### Current n8n Workflow: `uc06-follow-up-execution.json`

| Node | Type | Details |
|------|------|---------|
| Webhook | `n8n-nodes-base.webhook` | POST `/follow-up-execute`, responseMode: responseNode |
| Validate Input | `n8n-nodes-base.if` | Checks `enrollmentId` not empty |
| Build Message | `n8n-nodes-base.code` | Builds email HTML from body fields |
| Send an Email | `n8n-nodes-base.emailSend` | SMTP via `SMTP_FROM_EMAIL` env var, sends to `recipientEmail` |
| Respond Success | `n8n-nodes-base.respondToWebhook` | Returns success JSON |
| Respond Error | `n8n-nodes-base.respondToWebhook` | Returns error JSON with retryable flag |

### Boundary Violation

⚠️ **The existing n8n workflow sends email directly via SMTP (`n8n-nodes-base.emailSend`)**, which violates the boundary principle:

> "n8n should not send SMTP/email directly. Actual email/SMTP delivery stays in backend (NestJS Communication API)."

### Consequences of Direct SMTP in n8n

1. **No audit trail:** Email delivery is not recorded in NestJS AuditLog
2. **No idempotency:** Retry could send duplicate emails
3. **No delivery status tracking:** No providerMessageId stored in FollowUpExecution
4. **Credential exposure:** SMTP credentials in n8n (not in backend secret management)
5. **No authorization:** Backend cannot enforce email sending policies

### Proposed Solution

1. **Implement Communication API** (`POST /api/v1/internal/communication/send`) in NestJS
2. **Replace SMTP node** in n8n with HTTP Request to Communication API
3. **Backend handles:** SMTP delivery, audit logging, idempotency, delivery status tracking
4. **n8n handles:** Orchestration, message rendering, retry logic (calling backend API)

### Status: NEEDS_BACKEND_IMPLEMENTATION + n8n workflow update

---

## B4. Missing API Standardization

### Classification Matrix

| API/Function | Workflow | Contract Status | Implementation | Reusable? | Action Needed | Owner |
|-------------|----------|----------------|----------------|-----------|---------------|-------|
| Communication API (`POST /api/v1/internal/communication/send`) | WF04, WF13 | Defined in contract (section 10) | NOT_IMPLEMENTED | No | Backend must implement | Backend |
| Churn Assessment (GET/POST) | WF06 | Defined in contract (section 6) | NOT_IMPLEMENTED | No | Backend must implement entity + controller + service | Backend |
| CustomerTask (GET/POST/PATCH/complete) | WF06, WF13, WF15 | Defined in contract (section 5) | NOT_IMPLEMENTED | No | Backend must implement entity + controller + service | Backend |
| Save Workflow Summary | WF07 | Not explicitly defined | PARTIALLY (WorkflowRun.output_payload exists) | Yes — reuse WorkflowRun.output_payload | Confirm with backend if dedicated endpoint needed | Backend |
| CustomerContract (GET/POST/PATCH) | WF13 | Defined in contract (section 9) | NOT_IMPLEMENTED | No | Backend must implement entity + controller + service | Backend |
| RenewalAttempt (GET/POST) | WF13 | Defined in contract (section 9) | NOT_IMPLEMENTED | No | Backend must implement entity + controller + service | Backend |
| Strategic Status (GET/PATCH) | WF15 | Defined in contract (section 6) | NOT_IMPLEMENTED | No | Backend must implement | Backend |
| Health Assessments (GET/POST) | WF15 | Defined in contract (section 6) | NOT_IMPLEMENTED | No | Backend must implement entity + controller + service | Backend |
| Customer Issues (GET/POST) | WF15 | Defined in contract (section 6) | NOT_IMPLEMENTED | No | Backend must implement entity + controller + service | Backend |
| Customer Feedback (GET) | WF15 | Defined in contract (section 8) | NOT_IMPLEMENTED | No | Backend must implement entity + controller + service | Backend |
| Follow-up execution detail (GET by ID) | WF04 | Listed in contract | NOT_IMPLEMENTED (only list with filters) | Partially — can filter by executionId via query | Backend should add GET by ID or document workaround | Backend |
| Follow-up execution retry | WF04 | Listed in contract | NOT_IMPLEMENTED | No | Backend should implement or document alternative | Backend |
| Customer list/detail | WF06, WF15 | Listed in contract | IMPLEMENTED_UNVERIFIED | Yes | Verify with HTTP test | Backend |
| Segment CRUD + evaluate | WF07 | Listed in contract | IMPLEMENTED_UNVERIFIED | Yes | Verify with HTTP test | Backend |
| Review task CRUD | WF07 (indirect) | Listed in contract | IMPLEMENTED_UNVERIFIED | Yes | Verify with HTTP test | Backend |

### Reusable APIs (already implemented, unverified)

| API | Used By | Status |
|-----|---------|--------|
| GET /api/v1/customers | WF06, WF15 | IMPLEMENTED_UNVERIFIED |
| GET /api/v1/customers/:id | WF06, WF15 | IMPLEMENTED_UNVERIFIED |
| GET /api/v1/segments | WF07 | IMPLEMENTED_UNVERIFIED |
| GET /api/v1/segments/:id | WF07 | IMPLEMENTED_UNVERIFIED |
| POST /api/v1/segments/:id/evaluate | WF07 | IMPLEMENTED_UNVERIFIED |
| POST /api/v1/segments/evaluate-all | WF07 | IMPLEMENTED_UNVERIFIED |
| GET /api/v1/segments/:id/customers | WF07 | IMPLEMENTED_UNVERIFIED |
| GET/POST /api/v1/review-tasks | WF07 (indirect) | IMPLEMENTED_UNVERIFIED |
| GET/POST /api/v1/follow-ups/executions | WF04 | IMPLEMENTED_UNVERIFIED |
| GET/POST /api/v1/follow-ups/enrollments | WF04 | IMPLEMENTED_UNVERIFIED |

---

## Blocker Register

| ID | Workflow | Blocker | Evidence | Proposed Solution | Dependency | Owner | Acceptance Criteria | Status |
|----|----------|---------|----------|-------------------|------------|-------|---------------------|--------|
| B1 | WF04, WF13 | Communication API not implemented | No controller/service/entity found in codebase; listed in API contract section 10 | Implement `POST /api/v1/internal/communication/send` in NestJS | None | Backend | API exists, tested, returns delivery result | PENDING_BACKEND |
| B2 | WF06, WF13, WF15 | CustomerTask entity/API not implemented | No CustomerTask entity, controller, or service found | Implement CustomerTask entity, controller, service with CRUD + complete | None | Backend | API exists, tested, supports idempotency | PENDING_BACKEND |
| B3 | WF06 | ChurnAssessment entity/API not implemented | No ChurnAssessment entity, controller, or service found | Implement CustomerChurnAssessment entity, controller, service | CustomerTask (B2) | Backend | API exists, tested, returns score/level | PENDING_BACKEND |
| B4 | WF15 | HealthAssessment entity/API not implemented | No HealthAssessment entity, controller, or service found | Implement CustomerHealthAssessment entity, controller, service | CustomerTask (B2) | Backend | API exists, tested, returns score/level | PENDING_BACKEND |
| B5 | WF13 | CustomerContract/RenewalAttempt not implemented | No Contract or RenewalAttempt entity, controller, or service found | Implement CustomerContract and RenewalAttempt entities, controllers, services | Communication API (B1) | Backend | API exists, tested, supports renewal workflow | PENDING_BACKEND |
| B6 | WF15 | Strategic status endpoint not implemented | No strategic-status endpoint in customers controller | Implement `GET/PATCH /api/v1/customers/:customerId/strategic-status` | None | Backend | API exists, tested | PENDING_BACKEND |
| B7 | WF15 | Customer issues/feedback endpoints not implemented | No issues or feedback endpoints in customers controller | Implement `GET /api/v1/customers/:customerId/issues` and `/feedback` | None | Backend | API exists, tested | PENDING_BACKEND |
| B8 | WF07 | Save Workflow Summary endpoint not found | No dedicated endpoint; WorkflowRun has `output_payload` (jsonb, nullable) | Confirm: reuse `WorkflowRun.output_payload` or create dedicated endpoint | None | Backend | Decision documented | PENDING_BACKEND |
| B9 | All | Correlation ID not implemented | No middleware, no field in WorkflowRun, CORS headers don't include X-Correlation-ID | Add correlationId field to WorkflowRun, add middleware, update CORS | None | Backend | Correlation ID propagates through all HTTP/RabbitMQ calls | PENDING_BACKEND |
| B10 | WF04, WF07 | Idempotency not implemented | Only in lead-intelligence and data-cleaning; not in follow-up or customers | Implement idempotency checks in follow-up and segmentation services | None | Backend | Duplicate requests return existing result, no side effects | PENDING_BACKEND |
| B11 | WF04 | n8n sends SMTP directly | `uc06-follow-up-execution.json` has `n8n-nodes-base.emailSend` node | Replace SMTP node with HTTP Request to Communication API (once B1 resolved) | B1 | Integration | n8n calls backend API, no direct SMTP | PENDING_BACKEND |
| B12 | All | No test environment | No running server or test DB available | Set up test environment with seeded data | None | DevOps/Backend | Test environment accessible | NEEDS_CONFIRMATION |

## Updated Phase 1 Completion Status

| Checklist Item | Status |
|----------------|--------|
| Checklist for WF04, WF06, WF07, WF13, WF15 created | ✅ Done |
| API/dependency matrix created | ✅ Done |
| API verified against controller, DTO, contract | ✅ Done (this report) |
| Implementation vs test status distinguished | ✅ Done |
| Backend confirmation questions created | ✅ Done |
| workflowRunId/correlationId/idempotencyKey convention proposed | ✅ Done (PROPOSED) |
| n8n/NestJS responsibility boundary documented | ✅ Done |
| Mock fixture rules documented | ✅ Done |
| Credential management rules documented | ✅ Done |
| Test plan for each workflow created | ✅ Done |
| Blocker list and integration conditions documented | ✅ Done |
| No workflow built or activated | ✅ Confirmed |

**Phase 1 complete. Phase 2 (workflow construction) should NOT begin until blockers B1-B12 are resolved.**

## Files Updated

- `docs/integration/phase-1-verification-report.md` — updated with verified findings
- `docs/integration/blocker-register.md` — new: blocker register with evidence and proposed solutions
- `docs/integration/workflow-contracts.md` — already contains responsibility boundary, credential rules, idempotency convention
- `docs/integration/backend-confirmation.md` — already contains 29 confirmation questions
- `docs/integration/api-dependency-matrix.md` — already contains API status matrix
- `docs/integration/test-plan.md` — already contains test plan and fixture rules
- `docs/integration/phase-1-checklist.md` — already contains per-workflow checklists
