# Workflow Contracts — WF04, WF06, WF07, WF13, WF15

> Phase 1: Survey & Contract Verification Only. No workflow built or activated.

## 1. Common Contract

### 1.1 Trigger Types

| Workflow | Trigger | Source |
|----------|---------|--------|
| WF04 | RabbitMQ `lead.follow_up.triggered` | NestJS publishes after scheduling execution |
| WF06 | Schedule Trigger (daily) | n8n Schedule node |
| WF07 | Schedule Trigger (periodic) or authorized request | n8n Schedule / NestJS command |
| WF13 | Schedule Trigger (daily) | n8n Schedule node |
| WF15 | Schedule Trigger (weekly) | n8n Schedule node |

### 1.2 RabbitMQ Events (from `rabbitmq.constants.ts`)

| Event | Routing Key | Queue | Required Data Fields |
|-------|-------------|-------|---------------------|
| Follow-up triggered | `lead.follow_up.triggered` | `n8n.follow-up-execution.q` | `executionId`, `enrollmentId`, `leadId`, `sequenceId`, `stepId`, `scheduledAt` |
| Qualification | `lead.qualification.requested` | `n8n.lead-qualification.q` | `leadId`, `workflowRunId` |
| Enrichment | `lead.enrichment.requested` | `n8n.lead-enrichment.q` | `leadId`, `workflowRunId`, `provider` |
| Scoring | `lead.scoring.requested` | `n8n.lead-scoring.q` | `leadId`, `workflowRunId` |
| Data Cleaning | `data.cleaning.requested` | `n8n.data-cleaning.q` | `workflowRunId`, `scope`, `timestamp` |

### 1.3 Event Envelope (from `08_RABBITMQ_CONTRACT.md`)

```json
{
  "eventId": "uuid",
  "eventType": "string",
  "version": 1,
  "occurredAt": "ISO-8601 UTC",
  "data": {}
}
```

## 2. WF04 — AI CRM Follow-up Agent

**Owner:** Trọng | **Related UCs:** UC05, UC06

### 2.1 Input Contract

| Field | Type | Required | Source |
|-------|------|----------|--------|
| `executionId` | UUID | Yes | Persisted FollowUpExecution |
| `enrollmentId` | UUID | Yes | LeadFollowUpEnrollment |
| `leadId` | UUID | Yes | Lead |
| `sequenceId` | UUID | Yes | FollowUpSequence |
| `stepId` | UUID | Yes | FollowUpStep |
| `scheduledAt` | ISO-8601 | Yes | FollowUpExecution.scheduledAt |
| `correlationId` | UUID | Proposed | n8n-generated or passed from BE |

### 2.2 API Dependencies (from controller)

| # | Method | Endpoint | Status | Notes |
|---|--------|----------|--------|-------|
| 1 | GET | `/api/v1/follow-ups/executions/:executionId` | IMPLEMENTED_UNVERIFIED | Read execution detail |
| 2 | POST | `/api/v1/follow-ups/executions` | IMPLEMENTED_UNVERIFIED | Execute follow-up step (callback from n8n) |
| 3 | POST | `/api/v1/internal/communication/send` | NOT_IMPLEMENTED | Communication API — no controller found |
| 4 | POST | `/api/v1/follow-ups/executions/:executionId/retry` | IMPLEMENTED_UNVERIFIED | Retry after failure |

### 2.3 12-Node Design (from `03_T12_15_WORKFLOWS_DESIGN.md`)

| # | Node | Type | Input | Processing | Output | Error Branch | Status |
|---|------|------|-------|------------|--------|--------------|--------|
| 1 | RabbitMQ Trigger | Trigger | Event envelope | Consume `lead.follow_up.triggered` | Execution event | — | Existing (6-node workflow) |
| 2 | Validate Execution Request | Code | Event data | Validate executionId, enrollmentId, stepId, correlationId | Validated payload | Error response | NEEDS_IMPLEMENTATION |
| 3 | Get Follow-up Context | HTTP Request | executionId | GET `/api/v1/follow-ups/executions/:executionId` | Enrollment, Lead, Step | Error response | NEEDS_IMPLEMENTATION |
| 4 | Check Eligibility | Code | Context data | Verify active enrollment, due time, step, duplicate safeguards | Eligible/Not eligible | Skip execution | NEEDS_IMPLEMENTATION |
| 5 | Render Message Payload | Code | Step/Lead context | Prepare recipient, subject, content from approved templates | Message payload | Error response | NEEDS_IMPLEMENTATION |
| 6 | Backend Send Message | HTTP Request | Message payload | POST `/api/v1/internal/communication/send` | Delivery result | Retry/terminal failure | NOT_IMPLEMENTED (no backend API) |
| 7 | Normalize Delivery Result | Code | Delivery response | Map success/retryable/permanent failure | Normalized result | Error response | NEEDS_IMPLEMENTATION |
| 8 | Execution Callback | HTTP Request | Normalized result | POST `/api/v1/follow-ups/executions` (update status) | Callback response | Error response | NEEDS_IMPLEMENTATION |
| 9 | Prepare Execution Outcome | Code | Callback response | Retain delivery status, correlationId, idempotency key | Outcome data | Error response | NEEDS_IMPLEMENTATION |
| 10 | IF: Delivery Succeeded? | IF | Outcome data | Branch on authoritative delivery outcome | Success/Failure | — | NEEDS_IMPLEMENTATION |
| 11 | Advance/Complete (success) | HTTP Request | Outcome data | Backend advances step or completes enrollment | Success response | Error response | NEEDS_IMPLEMENTATION |
| 12 | Handle Delivery Failure (failure) | HTTP Request | Outcome data | Backend applies retry or records terminal failure | Failure response | Terminal error | NEEDS_IMPLEMENTATION |

**Note:** Existing n8n workflow (`uc06-follow-up-execution.json`) only has 6 nodes. Needs full 12-node rebuild per design spec.

## 3. WF06 — AI Churn Monitoring Agent

**Owner:** Trọng | **Related UCs:** UC06 (churn monitoring)

### 3.1 Input Contract

| Field | Type | Required | Source |
|-------|------|----------|--------|
| `customerId` | UUID | Yes (per customer) | Customer cohort from NestJS |
| `correlationId` | UUID | Proposed | n8n-generated |
| `asOfDate` | ISO-8601 date | Yes | Schedule trigger date |

### 3.2 API Dependencies

| # | Method | Endpoint | Status | Notes |
|---|--------|----------|--------|-------|
| 1 | GET | `/api/v1/customers` | IMPLEMENTED_UNVERIFIED | List active customers (cohort) |
| 2 | GET | `/api/v1/customers/:customerId` | IMPLEMENTED_UNVERIFIED | Customer detail |
| 3 | GET | `/api/v1/customers/:customerId/churn-assessments` | NOT_IMPLEMENTED | No controller/service/entity found |
| 4 | POST | `/api/v1/customers/:customerId/churn-assessments` | NOT_IMPLEMENTED | No controller/service/entity found |
| 5 | GET | `/api/v1/customer-tasks` | NOT_IMPLEMENTED | No controller/service/entity found |
| 6 | POST | `/api/v1/customer-tasks` | NOT_IMPLEMENTED | No controller/service/entity found |

### 3.3 12-Node Design

| # | Node | Type | Input | Processing | Output | Error Branch | Status |
|---|------|------|-------|------------|--------|--------------|--------|
| 1 | Schedule Trigger | Trigger | Configured daily schedule | Run daily | Trigger event | — | NEEDS_IMPLEMENTATION |
| 2 | Get Customer Cohort | HTTP Request | — | GET `/api/v1/customers` (active) | Customer list | Error response | IMPLEMENTED_UNVERIFIED (API exists) |
| 3 | Split Out: Customer Items | Split Out | Customer list | Process individually/batches | Per-customer items | Error response | NEEDS_IMPLEMENTATION |
| 4 | Get Customer Profile | HTTP Request | customerId | GET `/api/v1/customers/:customerId` | Customer detail | Error response | IMPLEMENTED_UNVERIFIED (API exists) |
| 5 | Get Engagement History | HTTP Request | customerId | GET interactions (via customer 360 or leads) | Engagement data | Error response | NEEDS_IMPLEMENTATION (no direct endpoint) |
| 6 | Get Follow-up/Feedback History | HTTP Request | customerId | Fetch follow-up failures + feedback | History data | Error response | PARTIALLY_IMPLEMENTED (follow-up exists, feedback not) |
| 7 | Normalize Feature Snapshot | Code | Feature data | Normalize evidence/data coverage | Normalized snapshot | Error response | NEEDS_IMPLEMENTATION |
| 8 | Evaluate Backend Churn Policy | HTTP Request | Normalized snapshot | POST churn assessment (backend applies policy) | Score/level or INSUFFICIENT_DATA | Error response | NOT_IMPLEMENTED (no backend API) |
| 9 | AI Risk Explanation | HTTP Request | Score/evidence | AI explains risk (does not set official level) | Explanation | Error response | NEEDS_IMPLEMENTATION |
| 10 | Save Validated Explanation | HTTP Request | Explanation | Send to NestJS for validation + association | Saved record | Error response | NOT_IMPLEMENTED |
| 11 | IF: High Risk & Sufficient Evidence | IF | Assessment result | Route canonical high-risk customers | Yes/No branches | — | NEEDS_IMPLEMENTATION |
| 12 | Ensure CustomerTask | HTTP Request | High-risk customer | POST `/api/v1/customer-tasks` (create/reuse retention task) | Task created/reused | Error response | NOT_IMPLEMENTED (no backend API) |

## 4. WF07 — AI Customer Segmentation Agent

**Owner:** Trọng | **Related UC:** UC09

### 4.1 Input Contract

| Field | Type | Required | Source |
|-------|------|----------|--------|
| `segmentId` | UUID | Yes (per segment) | Active segments from NestJS |
| `correlationId` | UUID | Proposed | n8n-generated |
| `asOfDate` | ISO-8601 date | Yes | Schedule trigger date |

### 4.2 API Dependencies

| # | Method | Endpoint | Status | Notes |
|---|--------|----------|--------|-------|
| 1 | GET | `/api/v1/segments` | IMPLEMENTED_UNVERIFIED | List active segments |
| 2 | GET | `/api/v1/segments/:segmentId` | IMPLEMENTED_UNVERIFIED | Segment detail |
| 3 | POST | `/api/v1/segments/:segmentId/evaluate` | IMPLEMENTED_UNVERIFIED | Evaluate one segment via backend Rule Engine |
| 4 | POST | `/api/v1/segments/evaluate-all` | IMPLEMENTED_UNVERIFIED | Evaluate all eligible active segments |
| 5 | GET | `/api/v1/segments/:segmentId/customers` | IMPLEMENTED_UNVERIFIED | List membership and summary |
| 6 | POST | `/api/v1/segments/:segmentId/evaluate` (reused) | IMPLEMENTED_UNVERIFIED | Called per segment in loop |

### 4.3 12-Node Design

| # | Node | Type | Input | Processing | Output | Error Branch | Status |
|---|------|------|-------|------------|--------|--------------|--------|
| 1 | Schedule Trigger | Trigger | Configured periodic schedule | Run periodically | Trigger event | — | NEEDS_IMPLEMENTATION |
| 2 | Get Active Segments | HTTP Request | — | GET `/api/v1/segments` (active) | Segment list | Error response | IMPLEMENTED_UNVERIFIED (API exists) |
| 3 | Split Out: Segment Items | Split Out | Segment list | Process each segment | Per-segment items | Error response | NEEDS_IMPLEMENTATION |
| 4 | Get Customer Cohort | HTTP Request | segmentId | GET `/api/v1/segments/:segmentId/customers` | Customer list | Error response | IMPLEMENTED_UNVERIFIED (API exists) |
| 5 | Prepare Rule Engine Request | Code | Segment + cohort | Shape and validate request payload only | Request payload | Error response | NEEDS_IMPLEMENTATION |
| 6 | Evaluate Segment via Backend Rule Engine | HTTP Request | Request payload | POST `/api/v1/segments/:segmentId/evaluate` | Assignment result | Error response | IMPLEMENTED_UNVERIFIED (API exists) |
| 7 | Get Assignment Statistics | HTTP Request | segmentId | GET `/api/v1/segments/:segmentId/customers` (post-evaluate) | Assignment counts | Error response | IMPLEMENTED_UNVERIFIED (API exists) |
| 8 | Normalize Backend Results | Code | Assignment stats | Normalize for reporting (no business rules) | Normalized stats | Error response | NEEDS_IMPLEMENTATION |
| 9 | AI Segment Insights | HTTP Request | Normalized stats | AI generates trend summary | Insights | Error response | NEEDS_IMPLEMENTATION |
| 10 | Validate Insights | Code | AI response | Validate schema, no unsupported claims | Validated insights | Error response | NEEDS_IMPLEMENTATION |
| 11 | Save Workflow Summary | HTTP Request | Validated insights | POST workflow run result / save summary | Saved record | Error response | NEEDS_IMPLEMENTATION (no dedicated save endpoint) |
| 12 | Notify on Anomaly | HTTP Request | Anomaly threshold | Report unexpected changes via backend notifications | Notification sent | Error response | IMPLEMENTED_UNVERIFIED (notifications API exists) |

## 5. WF13 — AI Renewal Management Agent

**Owner:** Trọng | **Related UC:** UC12 (contracts/renewals)

### 5.1 Input Contract

| Field | Type | Required | Source |
|-------|------|----------|--------|
| `contractId` | UUID | Yes (per contract) | Due contracts from NestJS |
| `correlationId` | UUID | Proposed | n8n-generated |
| `asOfDate` | ISO-8601 date | Yes | Schedule trigger date |

### 5.2 API Dependencies

| # | Method | Endpoint | Status | Notes |
|---|--------|----------|--------|-------|
| 1 | GET | `/api/v1/customer-contracts/due-for-renewal` | NOT_IMPLEMENTED | No controller/service/entity found |
| 2 | GET | `/api/v1/customer-contracts/:contractId` | NOT_IMPLEMENTED | No controller/service/entity found |
| 3 | POST | `/api/v1/customer-contracts/:contractId/renewal-attempts` | NOT_IMPLEMENTED | No controller/service/entity found |
| 4 | GET | `/api/v1/renewal-attempts/:attemptId` | NOT_IMPLEMENTED | No controller/service/entity found |
| 5 | POST | `/api/v1/internal/communication/send` | NOT_IMPLEMENTED | No Communication API controller found |

### 5.3 12-Node Design

| # | Node | Type | Input | Processing | Output | Error Branch | Status |
|---|------|------|-------|------------|--------|--------------|--------|
| 1 | Schedule Trigger | Trigger | Configured daily schedule | Run daily | Trigger event | — | NEEDS_IMPLEMENTATION |
| 2 | Get Contracts Due | HTTP Request | — | GET `/api/v1/customer-contracts/due-for-renewal` | Due contract list | Error response | NOT_IMPLEMENTED (no backend API) |
| 3 | Split Out: Contract Items | Split Out | Contract list | Process each contract | Per-contract items | Error response | NEEDS_IMPLEMENTATION |
| 4 | Get Contract/Customer Details | HTTP Request | contractId | GET contract + customer detail | Contract/customer data | Error response | NOT_IMPLEMENTED (no backend API) |
| 5 | Calculate Renewal Urgency | Code | Contract dates | Calculate days to renewal from actual dates | Urgency score | Error response | NEEDS_IMPLEMENTATION |
| 6 | AI Renewal Recommendation | HTTP Request | Contract + urgency | AI prepares recommendation + draft message | Recommendation + draft | Error response | NEEDS_IMPLEMENTATION |
| 7 | Validate Draft | Code | AI response | Ensure contract/customer/date details are grounded | Validated draft | Error response | NEEDS_IMPLEMENTATION |
| 8 | Save Renewal Draft | HTTP Request | Validated draft | POST renewal attempt (persist draft + provenance) | Saved record | Error response | NOT_IMPLEMENTED (no backend API) |
| 9 | IF: Auto-send Explicitly Allowed? | IF | Policy/consent/approval gates | Require explicit policy permission, approved template, valid consent, human approval | Yes/No branches | — | NEEDS_IMPLEMENTATION |
| 10 | Backend Send Message (yes branch) | HTTP Request | Draft + gates passed | POST `/api/v1/internal/communication/send` (only if all gates pass) | Delivery result | Error response | NOT_IMPLEMENTED (no backend API) |
| 11 | Create/Ensure Renewal Approval Task (no branch) | HTTP Request | Draft + no gates | POST `/api/v1/customer-tasks` (create/reuse owner task) | Task created/reused | Error response | NOT_IMPLEMENTED (no backend API) |
| 12 | Record Renewal Attempt | HTTP Request | Attempt result | Persist SENT/FAILED/PENDING_APPROVAL idempotently | Attempt recorded | Error response | NOT_IMPLEMENTED (no backend API) |

## 6. WF15 — AI Account Management Agent

**Owner:** Trọng | **Related UC:** UC12 (strategic accounts)

### 6.1 Input Contract

| Field | Type | Required | Source |
|-------|------|----------|--------|
| `customerId` | UUID | Yes (per strategic account) | Strategic accounts from NestJS |
| `correlationId` | UUID | Proposed | n8n-generated |
| `asOfDate` | ISO-8601 date | Yes | Schedule trigger date |

### 6.2 API Dependencies

| # | Method | Endpoint | Status | Notes |
|---|--------|----------|--------|-------|
| 1 | GET/PATCH | `/api/v1/customers/:customerId/strategic-status` | NOT_IMPLEMENTED | No controller found |
| 2 | GET | `/api/v1/customers/:customerId` | IMPLEMENTED_UNVERIFIED | Customer detail |
| 3 | GET | `/api/v1/customers/:customerId/health-assessments` | NOT_IMPLEMENTED | No controller/service/entity found |
| 4 | POST | `/api/v1/customers/:customerId/health-assessments` | NOT_IMPLEMENTED | No controller/service/entity found |
| 5 | GET | `/api/v1/customers/:customerId/issues` | NOT_IMPLEMENTED | No controller/service/entity found |
| 6 | GET | `/api/v1/customers/:customerId/feedback` | NOT_IMPLEMENTED | No controller/service/entity found |
| 7 | GET | `/api/v1/customer-tasks` | NOT_IMPLEMENTED | No controller/service/entity found |
| 8 | POST | `/api/v1/customer-tasks` | NOT_IMPLEMENTED | No controller/service/entity found |

### 6.3 12-Node Design

| # | Node | Type | Input | Processing | Output | Error Branch | Status |
|---|------|------|-------|------------|--------|--------------|--------|
| 1 | Schedule Trigger | Trigger | Configured weekly schedule | Run weekly | Trigger event | — | NEEDS_IMPLEMENTATION |
| 2 | Get Strategic Accounts | HTTP Request | — | GET customers marked STRATEGIC | Account list | Error response | NOT_IMPLEMENTED (no backend API) |
| 3 | Split Out: Account Items | Split Out | Account list | Process each account | Per-account items | Error response | NEEDS_IMPLEMENTATION |
| 4 | Get Account Profile | HTTP Request | customerId | GET `/api/v1/customers/:customerId` | Customer detail | Error response | IMPLEMENTED_UNVERIFIED (API exists) |
| 5 | Get Interaction Metrics | HTTP Request | customerId | GET interactions/engagement | Engagement data | Error response | NEEDS_IMPLEMENTATION (no direct endpoint) |
| 6 | Get Open Follow-ups/Feedback/Renewals | HTTP Request | customerId | Fetch follow-up, feedback, renewal status | Combined data | Error response | PARTIALLY_IMPLEMENTED (follow-up exists) |
| 7 | Calculate Account Health | HTTP Request | Feature data | Backend applies versioned policy (engagement 30%, feedback 25%, issues 25%, follow-up 20%) | Score/level or INSUFFICIENT_DATA | Error response | NOT_IMPLEMENTED (no backend API) |
| 8 | AI Account Review | HTTP Request | Score/evidence | AI explains risks/opportunities (does not calculate official score) | Explanation | Error response | NEEDS_IMPLEMENTATION |
| 9 | Validate Recommendations | Code | AI response | Require evidence references, allowed action categories, handle INSUFFICIENT_DATA | Validated recommendations | Error response | NEEDS_IMPLEMENTATION |
| 10 | Save Account Snapshot | HTTP Request | Health result + AI explanation | Persist health result + explanation through NestJS | Saved record | Error response | NOT_IMPLEMENTED (no backend API) |
| 11 | IF: Critical Risk/Opportunity | IF | Health assessment | Identify accounts requiring prompt human action | Yes/No branches | — | NEEDS_IMPLEMENTATION |
| 12 | Ensure CustomerTask/Notify Owner | HTTP Request | Critical account | POST `/api/v1/customer-tasks` + notification via NestJS | Task + notification | Error response | NOT_IMPLEMENTED (no backend API) |

## 7. Summary of Backend API Status

### WF04 (Follow-up Execution)

| API | Status |
|-----|--------|
| GET `/api/v1/follow-ups/executions/:executionId` | IMPLEMENTED_UNVERIFIED |
| POST `/api/v1/follow-ups/executions` | IMPLEMENTED_UNVERIFIED |
| POST `/api/v1/internal/communication/send` | NOT_IMPLEMENTED |
| POST `/api/v1/follow-ups/executions/:executionId/retry` | IMPLEMENTED_UNVERIFIED |

### WF06 (Churn Monitoring)

| API | Status |
|-----|--------|
| GET `/api/v1/customers` | IMPLEMENTED_UNVERIFIED |
| GET `/api/v1/customers/:customerId` | IMPLEMENTED_UNVERIFIED |
| GET `/api/v1/customers/:customerId/churn-assessments` | NOT_IMPLEMENTED |
| POST `/api/v1/customers/:customerId/churn-assessments` | NOT_IMPLEMENTED |
| GET `/api/v1/customer-tasks` | NOT_IMPLEMENTED |
| POST `/api/v1/customer-tasks` | NOT_IMPLEMENTED |

### WF07 (Customer Segmentation)

| API | Status |
|-----|--------|
| GET `/api/v1/segments` | IMPLEMENTED_UNVERIFIED |
| GET `/api/v1/segments/:segmentId` | IMPLEMENTED_UNVERIFIED |
| POST `/api/v1/segments/:segmentId/evaluate` | IMPLEMENTED_UNVERIFIED |
| POST `/api/v1/segments/evaluate-all` | IMPLEMENTED_UNVERIFIED |
| GET `/api/v1/segments/:segmentId/customers` | IMPLEMENTED_UNVERIFIED |

### WF13 (Renewal Management)

| API | Status |
|-----|--------|
| GET `/api/v1/customer-contracts/due-for-renewal` | NOT_IMPLEMENTED |
| GET `/api/v1/customer-contracts/:contractId` | NOT_IMPLEMENTED |
| POST `/api/v1/customer-contracts/:contractId/renewal-attempts` | NOT_IMPLEMENTED |
| GET `/api/v1/renewal-attempts/:attemptId` | NOT_IMPLEMENTED |
| POST `/api/v1/internal/communication/send` | NOT_IMPLEMENTED |

### WF15 (Account Management)

| API | Status |
|-----|--------|
| GET/PATCH `/api/v1/customers/:customerId/strategic-status` | NOT_IMPLEMENTED |
| GET `/api/v1/customers/:customerId` | IMPLEMENTED_UNVERIFIED |
| GET `/api/v1/customers/:customerId/health-assessments` | NOT_IMPLEMENTED |
| POST `/api/v1/customers/:customerId/health-assessments` | NOT_IMPLEMENTED |
| GET `/api/v1/customers/:customerId/issues` | NOT_IMPLEMENTED |
| GET `/api/v1/customers/:customerId/feedback` | NOT_IMPLEMENTED |
| GET `/api/v1/customer-tasks` | NOT_IMPLEMENTED |
| POST `/api/v1/customer-tasks` | NOT_IMPLEMENTED |

### Summary Table

| Workflow | Total APIs | Implemented | Not Implemented | Status |
|----------|-----------|-------------|-----------------|--------|
| WF04 | 4 | 3 | 1 (Communication API) | PARTIALLY_IMPLEMENTED |
| WF06 | 6 | 2 | 4 | PARTIALLY_IMPLEMENTED |
| WF07 | 6 | 5 | 1 (Save Workflow Summary) | PARTIALLY_IMPLEMENTED |
| WF13 | 5 | 0 | 5 | NOT_IMPLEMENTED |
| WF15 | 8 | 1 | 7 | NOT_IMPLEMENTED |

## 8. Responsibility Boundary — n8n vs NestJS

### Principle

**n8n only orchestrates workflows and calls NestJS APIs.**

### n8n MUST NOT:

| # | Prohibited Action | Reason |
|---|-------------------|--------|
| 1 | Write directly to CRM database (SQL/TypeORM) | Backend owns all persisted state |
| 2 | Calculate or decide business policy | Backend is authoritative for business rules |
| 3 | Create/update/delete CRM records outside approved APIs | Backend owns mutations |
| 4 | Send SMTP/email directly (unless explicitly approved) | Communication API is backend-only |
| 5 | Bypass authentication, authorization, or validation | Backend enforces security |
| 6 | Fake success when API fails | Must report actual status |
| 7 | Store or log secrets/credentials | Security violation |

### Responsibility Matrix

| Task | n8n | NestJS | Other Service | Notes |
|------|-----|--------|---------------|-------|
| Trigger workflow | ✅ Orchestrate | ✅ Publish event / schedule | — | n8n receives trigger, NestJS publishes events |
| Validate payload | ✅ Basic validation | ✅ Authoritative validation | — | n8n pre-checks; NestJS enforces |
| Business decisions | — | ✅ Authoritative | — | Policy, scoring, segmentation rules |
| Read CRM data | ✅ Via API calls | ✅ Owns data access | — | n8n calls NestJS APIs only |
| Persist mutations | — | ✅ Owns all writes | — | n8n never writes to DB |
| Send email/messages | ✅ Calls backend API | ✅ Communication API | SMTP provider | n8n requests; NestJS delivers |
| AI calls | ✅ Orchestrates | — | AI provider (Gemini) | n8n calls AI; validates output |
| Idempotency | — | ✅ Enforces | — | Backend owns idempotency |
| Logging/audit | ✅ Structured logs | ✅ AuditLog entity | — | Both log; backend persists audit |
| Error handling | ✅ Branch/retry | ✅ Error responses | — | n8n routes; backend returns status |
| Credential management | ✅ n8n Credentials | ✅ Env vars/secrets | Secret manager | Never in workflow JSON |

### Communication API (WF04, WF13)

- **Status:** NOT_IMPLEMENTED (no `/api/v1/internal/communication/send` controller found)
- **Owner:** Backend team
- **Action:** Implement or confirm alternative email delivery mechanism
- **n8n must NOT send SMTP directly** until backend approves

## 9. Credential Management Rules

### Rules

1. **No hardcoded credentials** in workflow JSON, source code, or documentation.
2. **No `.env` files with secrets** committed to git.
3. **n8n Credentials** or secret management for sensitive values.
4. **Environment variables** for environment-specific configuration.
5. **`.env.example`** contains only non-sensitive sample values.
6. **`.gitignore`** must include `.env`, `*.sqlite`, credential files.
7. **Never log secrets** in application logs or workflow execution logs.
8. **Rotate credentials** outside workflow JSON.

### Required Configuration

| Config | Local | Test | Production | Source |
|--------|-------|------|------------|--------|
| `N8N_WEBHOOK_BASE_URL` | `http://localhost:5678/webhook` | mock/test URL | production URL | env var |
| `N8N_WEBHOOK_TIMEOUT_MS` | 15000 | 5000 | 30000 | env var |
| `RABBITMQ_URL` | `amqp://localhost:5672` | test broker | production broker | env var |
| `JWT_SECRET` | dev secret | test secret | production secret (rotated) | env var / secret manager |
| `N8N_API_KEY` | dev key | test key | production key | env var / secret manager |
| SMTP credentials | n8n Credentials | mock | production SMTP | n8n Credentials (not in JSON) |

### Verification

- [ ] `.env` is in `.gitignore`
- [ ] No secrets in workflow JSON exports
- [ ] No secrets in documentation
- [ ] n8n Credentials configured separately
- [ ] Environment variables documented in `.env.example`

## 10. workflowRunId / correlationId / Idempotency Key Convention

### 10.1 workflowRunId

- **Purpose:** Identifies a single workflow execution run.
- **Format:** UUID v4
- **Created by:** NestJS (when creating a WorkflowRun record)
- **Passed to n8n:** Via RabbitMQ event payload or HTTP request body
- **Used for:** Tracking execution status, logging, result storage
- **NOT used as:** Idempotency key (different runs can represent the same business event)

### 10.2 correlationId

- **Purpose:** Links all requests and logs in the same business flow.
- **Format:** UUID v4
- **Created by:** NestJS (on initial request) or n8n (if not provided)
- **Propagation:** Passed in HTTP headers (`X-Correlation-ID`) and RabbitMQ event payload
- **Rule:** Never change mid-flow. If not present, generate new. Always propagate.

### 10.3 idempotencyKey

- **Purpose:** Prevents duplicate processing on retry or duplicate event delivery.
- **Format:** Composite key based on business event identity

| Workflow | Idempotency Key Components | Scope | Storage |
|----------|---------------------------|-------|---------|
| WF04 | `executionId` (FollowUpExecution.id) | Per execution | Backend DB (execution status) |
| WF06 | `customerId` + `asOfDate` | Per customer per day | Backend DB (churn assessment) |
| WF07 | `segmentId` + `asOfDate` | Per segment per run | Backend DB (segment membership) |
| WF13 | `contractId` + `renewalWindow` | Per contract per renewal cycle | Backend DB (renewal attempt) |
| WF15 | `customerId` + `weekNumber` | Per customer per week | Backend DB (health assessment) |

- **Behavior on duplicate:** Return existing result (200/201), do not reprocess.
- **Lost response + retry:** Backend must return the same result for the same idempotency key.
- **n8n responsibility:** Pass the idempotency key in all API calls. Do not implement fake idempotency in n8n if backend doesn't support it.

### 10.4 Header Convention

```
X-Correlation-ID: <uuid>
X-Workflow-Run-ID: <uuid>
X-Idempotency-Key: <composite-key>
```

### 10.5 Status: PROPOSED

All conventions above are PROPOSED. Need backend team confirmation before implementation.
