# 12 — Project Acceptance Checklist

Use this checklist to judge whether the implementation meets the completed-system specification. Mark an item complete only when test or runtime evidence is linked; a code stub, diagram, JSON parse, or claim without evidence does not pass.

## A. Product and architecture

- [ ] Frontend supports every scope area in the SRS with useful loading, empty, error and success states.
- [ ] All business rules are enforced in NestJS; n8n has no direct CRM database writes.
- [ ] PostgreSQL migrations create the full domain model and all expected relations, constraints, indexes and nullability.
- [ ] OpenAPI documents canonical routes, DTOs, auth, errors, enums and idempotency behavior.
- [ ] UC10/UC11/UC12 IDs are consistently Data Cleaning/Dashboard/Manage Users.

## B. Authentication/security/privacy

- [ ] Public registration cannot set a privileged role.
- [ ] User management, review/task actions, quote approval and data apply enforce backend RBAC.
- [ ] Every internal callback checks service identity, payload schema, correlation, target resource and allowed state transition.
- [ ] No production fallback secrets or credentials in repository/n8n export/logs.
- [ ] Transcript/feedback is redacted before AI; access and configurable retention/deletion are tested.
- [ ] Mock/seed data is explicitly labelled in stored results and UI.

## C. Data and business rules

- [ ] Qualification confidence `0.80` routes to exactly one ReviewTask; repeat callbacks do not duplicate it.
- [ ] Lead score is 0–100 and labels follow `HOT >=75`, `WARM >=40 and <75`, `COLD <40`.
- [ ] Churn boundary tests cover 39/40 and 69/70; insufficient evidence returns `INSUFFICIENT_DATA`.
- [ ] Health weights are 30/25/25/20; normalization requires at least two meaningful components.
- [ ] Strategic status can be set only by authorized Sales/Admin and records who marked it.
- [ ] ReviewTask and CustomerTask have separate semantics/lifecycle and source/idempotency validation.
- [ ] Lead-to-Customer conversion is transactional, preserves relationships and prevents duplicate conversion.
- [ ] Data Cleaning rejects unsafe, non-allowlisted, stale, unauthorized or unapproved corrections; all applied changes are audited.
- [ ] Quote line/pricing/tax/discount/totals are calculated by backend and require configured approval before final offer.
- [ ] Renewal sends obey consent/policy/approval; renewal attempts are idempotent and auditable.

## D. APIs and event contracts

- [ ] Enrichment routes use `/api/v1/leads/:leadId/enrichments` and history/latest semantics are tested.
- [ ] Follow-up endpoints use the `/api/v1/follow-ups/...` family.
- [ ] `lead.follow_up.triggered` contains required `data.executionId` referencing a persisted FollowUpExecution.
- [ ] Each independent RabbitMQ consumer has a dedicated durable queue/exact binding.
- [ ] Retry intervals are 1/5/15 minutes after initial attempt; max four total attempts; exhausted failures reach DLQ.
- [ ] Manual replay is authorized, audited and idempotent.
- [ ] Producer publish failures cannot silently lose work (transactional outbox or equivalent recovery behavior).

## E. The 15 n8n workflows

For each row, verify the named JSON, exact trigger, all 12 nodes, branch connections, API/event contracts, fixture coverage and runtime evidence.

| ID | Workflow | Owner | 12 nodes | Import/runtime | Integration tests |
|---|---|---|---|---|---|
| WF01 | Lead Qualification | Tuấn Anh | [ ] | [ ] | [ ] |
| WF02 | Lead Enrichment | Trường Linh | [ ] | [ ] | [ ] |
| WF03 | Lead Scoring | Trường Linh | [ ] | [ ] | [ ] |
| WF04 | Follow-up | Trọng | [ ] | [ ] | [ ] |
| WF05 | Customer 360 | Trường Linh | [ ] | [ ] | [ ] |
| WF06 | Churn Monitoring | Trọng | [ ] | [ ] | [ ] |
| WF07 | Customer Segmentation | Trọng | [ ] | [ ] | [ ] |
| WF08 | Data Cleaning | Tuấn Anh | [ ] | [ ] | [ ] |
| WF09 | Conversation Summarizer | Trường Linh | [ ] | [ ] | [ ] |
| WF10 | Next Best Action | Tuấn Anh | [ ] | [ ] | [ ] |
| WF11 | Sales Meeting | Tuấn Anh | [ ] | [ ] | [ ] |
| WF12 | Quote & Proposal | Tuấn Anh | [ ] | [ ] | [ ] |
| WF13 | Renewal Management | Trọng | [ ] | [ ] | [ ] |
| WF14 | Customer Feedback | Trường Linh | [ ] | [ ] | [ ] |
| WF15 | Account Management | Trọng | [ ] | [ ] | [ ] |

Each JSON contains exactly 12 functional nodes including one trigger. IF/Switch counts; Sticky Notes do not; the shared Error Handler is separate. A workflow passes only when the exported JSON node graph and runtime behavior conform, not merely when its Activity Diagram has 12 numbered steps.

## F. Frontend end-to-end scope

- [ ] Auth/register/login/profile and Admin user management.
- [ ] Leads and sources; qualification, enrichment, scoring history/details.
- [ ] Follow-up sequence/step editor, enrollment, pause/resume/cancel and execution history.
- [ ] ReviewTask queue and resolution; separate CustomerTask queue and completion.
- [ ] Customer list/detail/360, issues, feedback, churn and health history.
- [ ] Segment management and membership/statistics.
- [ ] Data Cleaning scan/findings/apply with safe/approval state.
- [ ] Meetings, redacted transcript, summary and action items.
- [ ] Next Best Action recommendations and policy/review handling.
- [ ] Catalog, quote draft/items/pricing/approval; contracts/renewal attempts.
- [ ] Dashboard KPIs, workflow status/failures, notifications and permitted drill-downs.

## G. Observability and release

- [ ] Correlation IDs connect request → WorkflowRun → event → n8n execution → callback → persisted result.
- [ ] Logs avoid secrets/raw sensitive text but retain safe error category and resource identities.
- [ ] Pending reviews/tasks, partial/failure state, retry, DLQ and mock-source provenance are visible to permitted roles.
- [ ] Unit, API/contract, integration, authorization, privacy and end-to-end test suites pass.
- [ ] Migrations/recovery procedures are documented and exercised in a disposable environment.
- [ ] All 15 workflow owners provide runtime evidence and the team reviews all cross-workflow contracts.
- [ ] PlantUML sources render successfully in the team's tooling and match the written contracts.

## Final sign-off

- [ ] SRS complete.
- [ ] All 12 use cases accepted.
- [ ] All 15 workflows accepted.
- [ ] ERD/domain model, migrations and API/event contracts aligned.
- [ ] Security/privacy checks passed.
- [ ] End-to-end tests passed.
- [ ] Unconnected external integrations and environment configuration clearly disclosed.
- [ ] Team sign-off recorded.
