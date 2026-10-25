# 06 — Completed Domain Model and Database Design

## 1. Database design goal

The final database is one PostgreSQL/TypeORM domain model for identity/governance, Leads, Customers, intelligence, follow-up automation, segmentation, workflow execution, customer insights, conversation/meeting analysis, quotes, contracts and operational tasks. It is not split into a separate database for the Topic 12 features.

The canonical relationship-level schema is [`diagrams/erd/erd.puml`](diagrams/erd/erd.puml). The canonical conceptual model is [`diagrams/domain/domain-model.puml`](diagrams/domain/domain-model.puml). Keep both in sync with entity definitions, migrations, DTOs and tests.

## 2. Core CRM and workflow entities

| Domain | Entities | Required role in the completed product |
|---|---|---|
| Identity and governance | `User`, `AuditLog`, `Notification`, `ReviewTask`, `WorkflowRun` | Accounts/roles, audit trail, notifications, explicit human decisions, workflow correlation/status/output/error. |
| Lead and intelligence | `LeadSource`, `Lead`, `Interaction`, `LeadQualification`, `LeadEnrichment`, `LeadScore` | Prospect lifecycle, interaction context, qualification history, enrichment provenance and canonical score history. |
| Follow-up automation | `FollowUpSequence`, `FollowUpStep`, `LeadFollowUpEnrollment`, `FollowUpExecution` | Cadence configuration, enrollment state, scheduled execution, delivery result/retry state. |
| Customer and segmentation | `Customer`, `Segment`, `CustomerSegment` | Unified customer record, criteria and authoritative membership assignments. `Customer` includes strategic-account flag and marker identity. |
| Customer insights | `CustomerIssue`, `CustomerChurnAssessment`, `CustomerFeedback`, `CustomerHealthAssessment`, `CustomerTask` | Customer issues, historical churn/health assessments, feedback lifecycle and operational follow-up/escalation. |
| Conversation and meetings | `SalesMeeting`, `ConversationTranscript`, `ConversationSummary`, `ConversationActionItem` | Meeting metadata, redacted transcript, structured summary and assigned/due follow-up actions. |
| Quote and renewal | `ProductCatalogItem`, `Quote`, `QuoteItem`, `CustomerContract`, `RenewalAttempt` | Catalog snapshots, draft/approved commercial offers, contracts, renewal scheduling and attempt history. |

There are 32 named entities in the canonical model: 18 core CRM/workflow entities and 14 Topic 12 extension entities.

## 3. Required relationship and integrity rules

- One `LeadSource` can be associated with many Leads. A Lead has a source and may have an owner.
- A Lead can reference zero or one converted Customer; one Customer may be referenced by multiple Leads. Do not introduce uniqueness on `converted_customer_id`.
- Qualification, enrichment, score and follow-up history are related to their Lead/run/execution identities; retain histories rather than overwriting all evidence into a single current field.
- `WorkflowRun` provides correlation and lifecycle for asynchronous work. Each callback must refer to the correct run and resource.
- `ReviewTask.lead_id` is nullable. `target_entity_type` and `target_entity_id` identify an allowed non-Lead review target. As the pair is polymorphic and has no native FK, the backend must validate both fields together, target allowlist, target existence, authorization, policy, idempotency and audit.
- `CustomerTask` is distinct from `ReviewTask`. Store task type, status, priority, assignee, due date, source references, WorkflowRun, idempotency key, completion and audit context. Validate allowed task/source combinations.
- `CustomerChurnAssessment` and `CustomerHealthAssessment` are history records. Do not overwrite history as if only the latest score mattered.
- Every `ConversationSummary` belongs to a transcript; action items belong to a summary and may link to a Lead/Customer and owner.
- `QuoteItem` stores a catalog/price snapshot; `Quote` records currency/totals/approval. Backend calculations are authoritative.
- `RenewalAttempt` belongs to a contract and has a stable unique idempotency key.
- Foreign-key delete behavior, nullability, uniqueness, indexes and status constraints are defined by migrations and tested against the relational ERD.

## 4. Required fields and business-policy data

The ERD gives the target fields for all 32 entities. In addition, retain policy version and evidence/reason codes wherever a derived score or AI result can affect a decision. Preserve provider mode/source provenance for enrichment, catalog and contract data. Preserve event/run/execution identity for asynchronous work.

## 5. Data and privacy rules

- Customer 360 aggregates CRM-owned data. Unconnected external sources are not fabricated.
- Transcript and feedback text is redacted before AI processing; redacted content is stored by default.
- Raw sensitive content, when there is an explicitly approved need, has restricted access and configured retention/deletion.
- Customer feedback retains source/channel/rating and a redacted source text; AI-derived sentiment/category/urgency are separately represented and reviewable.
- Data Cleaning findings can use WorkflowRun result payloads plus AuditLog in v1; any persisted finding model must remain traceable to scan/run and applied changes.

## 6. Scoring rules represented by data

- Lead score: 0–100, `HOT >= 75`, `WARM >= 40 and < 75`, `COLD < 40`.
- Churn score: 0–100, LOW 0–39, MEDIUM 40–69, HIGH 70–100, or `INSUFFICIENT_DATA`.
- Account health score: 0–100, higher is healthier; recency 30%, feedback 25%, issue severity/status 25%, follow-up completion 20%. Normalize available components only if at least two meaningful components exist.
- Store policy version and assessed time so each result is explainable and reproducible.

## 7. Model change governance

When the domain changes, update the entity, migration, constraints, relation mappings, DTO/OpenAPI, API/event contract, diagrams, fixtures and tests in one coordinated change. The ERD and domain model are the single authoritative schema specification for the completed product.
