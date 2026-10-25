# 07 — Canonical API Contract

## 1. API conventions

- Root prefix: `/api/v1`.
- JSON request/response bodies; ISO-8601 UTC timestamps; UUID resource identities unless the entity contract explicitly says otherwise.
- Use DTO validation, consistent error responses, pagination/filtering for collections, and explicit status-transition validation.
- User-facing endpoints require authenticated user context and RBAC. n8n callbacks/internal APIs require machine-to-machine authentication, scoped resource authorization and schema validation.
- Asynchronous requests return `202 Accepted` with a stable `workflowRunId`/resource identity; callers poll or subscribe to results rather than assuming immediate completion.
- Mutations that may be retried accept an `Idempotency-Key` or use a documented stable domain identity.
- The path list below is canonical for the completed product. OpenAPI is the normative schema for DTO fields, errors and enum values.

## 2. Authentication and users

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/auth/register` | Self-registration with server-assigned least-privileged role. |
| POST | `/api/v1/auth/login` | Authenticate and issue session/token. |
| GET | `/api/v1/auth/me` | Return sanitized current-user profile and permissions. |
| GET | `/api/v1/users` | Admin-only user list/filter. |
| GET | `/api/v1/users/:userId` | Admin-only sanitized user detail. |
| POST | `/api/v1/users` | Admin-only user creation/role assignment. |
| PATCH | `/api/v1/users/:userId` | Admin-only permitted account/role/status update, audited. |
| POST | `/api/v1/users/:userId/disable` | Disable account with audit and state validation. |

Passwords, hashes, tokens and secrets are never returned in resource JSON. Public registration cannot grant Admin.

## 3. Leads and intelligence

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/api/v1/leads` | List/filter and create Leads. |
| GET/PATCH/DELETE | `/api/v1/leads/:leadId` | Read/update/delete Lead under ownership/RBAC policy. |
| POST | `/api/v1/leads/:leadId/convert` | Transactional Lead-to-Customer conversion. |
| GET/POST | `/api/v1/lead-sources` | List/create Lead Sources. |
| GET/PATCH/DELETE | `/api/v1/lead-sources/:sourceId` | Read/update/delete or deactivate a source. |
| POST | `/api/v1/lead-intelligence/qualify/:leadId` | Request qualification; returns run identity. |
| GET | `/api/v1/leads/:leadId/qualifications` | List qualification history. |
| POST | `/api/v1/leads/:leadId/enrichments` | Request enrichment; canonical route. |
| GET | `/api/v1/leads/:leadId/enrichments` | List enrichment history. |
| GET | `/api/v1/leads/:leadId/enrichments/latest` | Read latest enrichment. |
| POST | `/api/v1/lead-intelligence/score/:leadId` | Request canonical score calculation. |
| GET | `/api/v1/leads/:leadId/scores` | List score history and policy version. |

Canonical internal callbacks: `POST /api/v1/internal/n8n/lead-qualification/callback`, `POST /api/v1/internal/n8n/lead-enrichment/callback`, and `POST /api/v1/internal/n8n/lead-scoring/callback`. Each callback requires service authentication, DTO validation, valid run/resource identity, idempotency and audit/structured logging.

## 4. Follow-up sequences, enrollments and executions

All routes use the canonical `/api/v1/follow-ups` family.

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/api/v1/follow-ups/sequences` | List/create sequence definitions. |
| GET/PATCH/DELETE | `/api/v1/follow-ups/sequences/:sequenceId` | Read/update/delete sequence. |
| GET/POST | `/api/v1/follow-ups/sequences/:sequenceId/steps` | List/create steps. |
| PATCH/DELETE | `/api/v1/follow-ups/sequences/:sequenceId/steps/:stepId` | Update/delete step. |
| POST | `/api/v1/follow-ups/sequences/:sequenceId/enrollments` | Enroll a Lead after eligibility/deduplication checks. |
| GET | `/api/v1/follow-ups/enrollments` | Filter/list enrollments. |
| GET | `/api/v1/follow-ups/enrollments/:enrollmentId` | Enrollment detail. |
| POST | `/api/v1/follow-ups/enrollments/:enrollmentId/pause` | Pause enrollment. |
| POST | `/api/v1/follow-ups/enrollments/:enrollmentId/resume` | Resume enrollment. |
| POST | `/api/v1/follow-ups/enrollments/:enrollmentId/cancel` | Cancel enrollment. |
| GET/POST | `/api/v1/follow-ups/executions` | List/filter or request a valid execution according to the operation DTO. |
| GET | `/api/v1/follow-ups/executions/:executionId` | Read one execution. |
| POST | `/api/v1/follow-ups/executions/:executionId/retry` | Authorized audited retry after state/eligibility validation. |
| POST | `/api/v1/internal/n8n/follow-ups/delivery-callback` | Record delivery result with service auth and idempotency. |

`lead.follow_up.triggered` must include required `data.executionId` referencing a persisted `FollowUpExecution`. Automated execution uses RabbitMQ as one trigger path. Email/message sending goes through NestJS Communication API.

## 5. Review and operational task APIs

### ReviewTask

- `GET/POST /api/v1/review-tasks`
- `GET /api/v1/review-tasks/:taskId`
- `POST /api/v1/review-tasks/:taskId/assign`
- `POST /api/v1/review-tasks/:taskId/start`
- `POST /api/v1/review-tasks/:taskId/resolve`

Review payload contains the decision/comment and target reference. Backend validates allowed target type, resource existence, actor role, task state and idempotency. `leadId` may be null when the task targets another approved entity.

### CustomerTask

- `POST /api/v1/customer-tasks` — create/ensure task with a stable idempotency key.
- `GET /api/v1/customer-tasks` — filter by customer, type, status, assignee and due date.
- `GET /api/v1/customer-tasks/:taskId` — task detail.
- `PATCH /api/v1/customer-tasks/:taskId` — permitted status/assignee/due-date/priority update, audited.
- `POST /api/v1/customer-tasks/:taskId/complete` — validated completion transition.

CustomerTask supports retention tasks from WF06, feedback escalation from WF14 and account follow-up from WF15. Validate customer/source references and allowed type/source combinations; do not replace ReviewTask with CustomerTask or vice versa.

## 6. Customer, insights and segmentation APIs

| Method/path | Purpose |
|---|---|
| `GET/POST /api/v1/customers` | List/create Customers. |
| `GET/PATCH /api/v1/customers/:customerId` | Customer detail/update. |
| `GET /api/v1/customers/:customerId/360` | Aggregated CRM 360 and source-coverage response. |
| `GET /api/v1/customers/:customerId/issues`; `POST /api/v1/customers/:customerId/issues` | List/create customer issues. |
| `GET /api/v1/customers/:customerId/churn-assessments` | Churn assessment history. |
| `POST /api/v1/customers/:customerId/churn-assessments` | Request/run an assessment through the supported policy. |
| `GET /api/v1/customers/:customerId/health-assessments` | Health history. |
| `POST /api/v1/customers/:customerId/health-assessments` | Request/run health assessment. |
| `PATCH /api/v1/customers/:customerId/strategic-status` | Admin/Sales-authorized explicit v1 strategic flag; persist marker identity. |
| `GET/POST /api/v1/segments` | List/create segments. |
| `GET/PATCH/DELETE /api/v1/segments/:segmentId` | Read/update/delete segment. |
| `POST /api/v1/segments/:segmentId/evaluate` | Evaluate one segment via backend Rule Engine. |
| `POST /api/v1/segments/evaluate-all` | Evaluate all eligible active segments. |
| `GET /api/v1/segments/:segmentId/customers` | List membership and summary. |

## 7. Data Cleaning APIs

- `POST /api/v1/data-cleaning/scans` — create scan and publish the event.
- `GET /api/v1/data-cleaning/scans/:workflowRunId` — scan/report summary.
- `GET /api/v1/data-cleaning/scans/:workflowRunId/leads` — scoped Lead batch for the authenticated n8n service identity.
- `POST /api/v1/internal/n8n/data-cleaning/callback` — persist validated findings/report.
- `POST /api/v1/data-cleaning/scans/:workflowRunId/apply` — apply selected finding IDs only after backend revalidation and required approval.

Apply DTO cannot force safety/approval; the backend reloads each target and enforces allowlist, freshness, permission, transaction, idempotency and AuditLog.

## 8. Conversation, meetings and feedback APIs

- `POST/GET /api/v1/sales-meetings`; `GET/PATCH /api/v1/sales-meetings/:meetingId`.
- `POST /api/v1/conversation-transcripts` — validated ingest through NestJS; redact before AI dispatch.
- `GET /api/v1/conversation-transcripts/:transcriptId` — role-scoped redacted content/metadata.
- `GET /api/v1/conversation-transcripts/:transcriptId/summary` — summary and processing status.
- `GET/POST /api/v1/conversation-summaries/:summaryId/action-items`; `PATCH /api/v1/conversation-action-items/:itemId`.
- `POST /api/v1/feedback` — rate-limited feedback ingress and customer/source validation.
- `GET /api/v1/customers/:customerId/feedback`; `GET/PATCH /api/v1/feedback/:feedbackId`.

## 9. Catalog, quote and renewal APIs

- `GET/POST /api/v1/catalog/items`; `GET/PATCH /api/v1/catalog/items/:itemId`.
- `POST /api/v1/quotes` — creates a draft and computes all amounts in backend.
- `GET /api/v1/quotes`; `GET /api/v1/quotes/:quoteId`; `PATCH /api/v1/quotes/:quoteId` — permitted draft updates only.
- `POST /api/v1/quotes/:quoteId/submit-for-approval`; `POST /api/v1/quotes/:quoteId/approve`; `POST /api/v1/quotes/:quoteId/reject`.
- `GET/POST /api/v1/customer-contracts`; `GET/PATCH /api/v1/customer-contracts/:contractId`.
- `GET /api/v1/customer-contracts/due-for-renewal`.
- `GET/POST /api/v1/customer-contracts/:contractId/renewal-attempts`; `GET /api/v1/renewal-attempts/:attemptId`.

## 10. Dashboard, workflow runs, notification and Communication APIs

- `GET /api/v1/dashboard/overview`, `GET /api/v1/dashboard/workflows`, `GET /api/v1/dashboard/customer-health` — role-filtered read models.
- `GET /api/v1/workflow-runs`; `GET /api/v1/workflow-runs/:runId` — run status, correlation, result summary and safe error detail.
- `GET /api/v1/notifications`; `POST /api/v1/notifications/:notificationId/read`.
- `POST /api/v1/internal/communication/send` — service-authenticated request to deliver an approved message; supports idempotency and returns delivery identity/state. This endpoint is for trusted backend/workflow calls, not browser-direct access.

## 11. Development-only integration

Any mock-provider endpoint is confined to development/test environments and must not be exposed as a live integration in production. API contract tests validate authorization, error behavior, idempotency, DTO fields and state transitions.
