# 10 — Implementation Roadmap (Workflow-First OOAD)

## Governing rule

Follow the dependency chain: **requirements/use cases → workflow/activity design → data ownership and sequence → domain model/ERD → API/event contracts → backend/frontend implementation → n8n runtime integration → acceptance evidence**. When a contract changes, update all affected consumers and tests in the same coordinated change.

## Phase 1 — Freeze shared contracts

1. Confirm `01_SRS_REQUIREMENTS_BASELINE.md`, UC01–UC12 and all 15 node-level workflow specifications as the implementation baseline.
2. Translate the ERD into TypeORM entities/migrations with constraints, indexes, nullability and FK behaviors.
3. Publish DTO/OpenAPI definitions for `07_API_CONTRACT.md`.
4. Implement RBAC, machine-to-machine callback authentication, `WorkflowRun`, `AuditLog`, idempotency utilities and consistent status/error handling.
5. Implement shared `ReviewTask` and `CustomerTask` state machines with different responsibilities.
6. Configure RabbitMQ exchange/queues/routing, acknowledgements, retries and DLQ according to `08_RABBITMQ_CONTRACT.md`.

## Phase 2 — Implement backend domain services

1. Lead, source and Customer CRUD plus transactional conversion.
2. Qualification/enrichment/scoring APIs and callbacks; enforce policies in backend.
3. Follow-up sequence/enrollment/execution services and Communication API; ensure failed delivery never advances an execution.
4. Segmentation Rule Engine and Data Cleaning scan/callback/apply with safety/approval/freshness checks.
5. Customer 360, CustomerIssue, CustomerChurnAssessment, CustomerTask and CustomerHealthAssessment.
6. ConversationTranscript/Summary/ActionItem, SalesMeeting, feedback ingress and CustomerFeedback privacy/lifecycle.
7. ProductCatalogItem, Quote/QuoteItem pricing and approval flow; CustomerContract/RenewalAttempt and renewal policy.
8. Dashboard read models, notification APIs and admin user management.

At each step, add migrations, DTO tests, service tests, authorization tests and API contract tests before workflow integration.

## Phase 3 — Build all 15 n8n workflows

Implement in the P14 ownership allocation. For each workflow:
1. implement the exact trigger and 12-node graph;
2. use schema-validated inputs/outputs and the canonical endpoint/routing key;
3. keep all business mutations in NestJS;
4. implement branch, timeout, retry, terminal-failure and callback behavior;
5. use deterministic fixtures or explicitly configured providers and label mock data;
6. import in n8n, execute success/failure scenarios and commit the JSON with tests/evidence.

## Phase 4 — Frontend integration

Deliver pages and working forms for auth/admin, Leads/sources, qualification/enrichment/scoring, follow-up sequences/enrollments/executions, review tasks, customers/360/issues/feedback, segments, Data Cleaning, meetings/transcripts/summaries/action items, next-best-action, catalog/quotes/approvals, contracts/renewals, customer tasks, dashboard and workflow-run details. Each page supports loading/error/empty states and applies role-based visibility while relying on backend authorization.

## Phase 5 — End-to-end integration

- Connect frontend requests to NestJS; NestJS creates run/resource identity and publishes events or invokes protected internal n8n requests.
- Verify RabbitMQ event envelope, exact queue binding, correlation and idempotency.
- Verify n8n callbacks authenticate and persist the result to PostgreSQL.
- Verify Communication API sends exactly once per idempotency identity and returns delivery state.
- Run integration flows with deterministic mock fixtures, then optional sandbox provider credentials if configured.

## Phase 6 — Release gate

1. Run migrations in a disposable environment and validate FK/index/status constraints.
2. Run unit, API/contract, integration, security, n8n and end-to-end tests.
3. Confirm 15 exported workflow JSONs, each exactly 12 functional nodes, with successful n8n imports.
4. Exercise DLQ and authorized replay; confirm retries and duplicate messages behave as specified.
5. Test dashboards and role boundaries; inspect logs for secret/PII leakage.
6. Complete `12_ACCEPTANCE_CHECKLIST.md` with evidence links, known environment configuration and explicit external integrations not connected.
7. Tag/release only after the checklist is signed off by the team.

## Team practices

Implement one coherent slice at a time. Do not merge unfinished API/entity/queue changes without the consuming workflow/tests. Keep migrations reversible where practical, never overwrite teammates' uncommitted work, and do not report a workflow as finished from JSON parsing alone.
