# 09 — Security, Privacy, Reliability and Operational Acceptance

## 1. Authentication and authorization

- Authentication is required for all non-public CRM reads/writes.
- Public registration cannot accept a caller-selected Admin or other privileged role. The backend assigns an allowed default role.
- User management, role changes, customer-data access, task assignment/resolution, quote approval and Data Cleaning apply are protected by backend RBAC.
- Every internal n8n callback is authenticated by a service identity/guard and validates DTO, correlation, run/resource relationship and allowed status transition.
- Service identities are scoped to the minimum routes/resources required; do not reuse a human JWT as a workflow credential.
- Never rely on a hidden UI action or an unguessable URL as authorization.

## 2. Data Cleaning safety

Before applying any finding, the backend must reload the record and confirm: (1) target type/ID is allowed; (2) actor is authorized; (3) field is in the explicit field allowlist; (4) current value matches the scanned source value/version; (5) `safeToApply` is true under backend policy; (6) any required human approval is resolved; and (7) the finding has not already been applied. Apply selected corrections in a transaction and write AuditLog old/new values. A stale or unsafe finding is rejected with a clear result and cannot partially bypass policy.

## 3. Privacy and AI safety

- Redact PII/secrets before transcript/feedback text leaves NestJS for an AI provider.
- Default persistence is a redacted transcript. Raw data requires a documented need, access restriction, protection and configured retention/deletion.
- Roles control access to transcript content, feedback, customer records and exported summaries.
- Apply data minimization to provider prompts; never include credentials or unrelated customer records.
- Validate structured AI output against schemas/enums/ranges, preserve provenance/model/policy version, and treat model text as untrusted input.
- AI cannot directly change CRM rows, set prices, approve quotes, assign privileged roles or deliver messages.

## 4. Idempotency and state transitions

- Define idempotency for events, callbacks, Lead qualification, ReviewTask, CustomerTask, quote actions, follow-up sends and renewal attempts.
- Enforce allowed status transitions in NestJS. Duplicate or out-of-order callbacks cannot roll back a terminal state or create duplicate side effects.
- Follow-up may advance only after confirmed successful delivery. Ambiguous timeout is not automatically success; use provider idempotency/status lookup or a manual recovery state.
- CustomerTask validates exactly one supported source relationship where the task type requires it, and prevents duplicate active tasks for the same source/business key.
- ReviewTask target association validates `lead_id` and polymorphic target semantics, including both target fields together and allowlisted target type.

## 5. Failure/retry policy

- Recoverable error retries occur at 1, 5 and 15 minutes after the initial attempt; maximum four total attempts.
- Permanent validation/authorization/schema failures terminate without blind retries.
- After exhaustion, persist terminal failure, route to DLQ/recovery, surface an actionable status, and retain safe diagnostics/correlation IDs.
- Manual replay is permissioned, audited, state-checked and idempotent.
- AI provider timeout/rate limits, callback failures, RabbitMQ unavailability, database errors, and communication provider ambiguity have explicit failure paths.

## 6. Environment and secret management

- Separate development/test/production settings and provider credentials.
- Validate required environment variables at service startup; fail closed when a required secret is missing. Never use a hardcoded fallback token/password in production.
- Exclude `.env`, tokens, passwords and private payloads from Git, logs, screenshots and n8n JSON exports.
- Mock-provider, seed-catalog and demo-contract records must carry clear `MOCK`/`SEED` provenance and be visually identified.
- Development-only mock endpoints are disabled or protected in production.

## 7. Observability and operations

- WorkflowRun tracks status, correlation, start/end time, safe input/output summary and error category.
- AuditLog records administrative changes, approvals, applied cleaning changes, task state transitions and manual replay.
- Use structured logs across API, RabbitMQ, n8n and callbacks; do not log secrets/raw sensitive transcripts.
- Dashboard exposes failed/partial runs, pending reviews/tasks, retries, DLQ/terminal failure counters and source-coverage status to permitted users.
- Document migration/rollback and recovery for database changes, event schema updates and workflow imports.

## 8. Required verification evidence

The completed project must include automated evidence for:
- DTO/schema validation and all critical business thresholds.
- RBAC and public-registration role-escalation rejection.
- Qualification confidence boundary at 0.80 and exactly-one ReviewTask under duplicate callbacks.
- Lead score label thresholds; churn and health score boundaries; `INSUFFICIENT_DATA` behavior.
- CustomerTask source/idempotency and separation from ReviewTask.
- Data Cleaning stale-value, unsafe-field, missing-approval, unauthorized-user and rollback cases.
- Quote price/tax/discount calculation and approval state transitions.
- Redaction-before-AI behavior and access/retention controls.
- Duplicate RabbitMQ messages, three retries, DLQ, manual replay authorization and correlation.
- Follow-up duplicate event, successful delivery, retryable failure, permanent failure and ambiguous delivery.
- n8n import/runtime for all 15 workflows with exactly 12 functional nodes.
- Frontend-to-backend-to-workflow-to-database end-to-end flows.
