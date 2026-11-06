# 05 — Business Rules and Shared Architecture

## 1. Architectural layers

1. **Next.js UI:** user interaction, forms, navigation, permitted read models and task/review actions. The UI does not enforce security on its own.
2. **NestJS API/domain services:** authentication, authorization, validation, business policies, transactions, persistence, idempotency, AuditLog, callbacks and communication delivery.
3. **PostgreSQL/TypeORM:** authoritative record storage and relationships.
4. **RabbitMQ:** domain event/command transport with a durable queue for every independent consumer.
5. **n8n:** orchestration, provider/AI calls, normalization and control flow. It only changes business state by calling authenticated NestJS APIs.
6. **AI/provider adapters:** structured output with validation, bounded input context, privacy redaction and explicit provenance.

## 2. Canonical identifiers and completed scope

Use Cases are `UC01`–`UC12`; Topic 12 workflows are `T12-WF01`–`T12-WF15`. Canonical IDs: UC10 = AI CRM Data Cleaning, UC11 = View Dashboard, UC12 = Manage Users. Each Topic 12 workflow contains exactly 12 functional n8n nodes including the trigger. Error handling is implemented in a separate shared Error Handler workflow.

## 3. Approved business policies

### Lead qualification and review

- If `confidence <= 0.80`, backend creates or reuses exactly one pending `ReviewTask`.
- If `confidence > 0.80`, the confidence threshold alone passes; all required data, authorization, eligibility and policy gates still apply.
- Repeated events/callbacks do not create duplicate review tasks. Use a stable business idempotency identity such as `(lead_id, workflow_run_id, task_type)` or a unique equivalent.

### Lead scoring

- Score is numeric 0–100 and canonical policy is implemented in NestJS.
- `HOT`: score >= 75; `WARM`: score >= 40 and < 75; `COLD`: score < 40.
- Store rationale/evidence and policy version. A score and label inconsistent with the thresholds are rejected.

### Churn assessment

- Score range: 0–100; 0–39 `LOW`, 40–69 `MEDIUM`, 70–100 `HIGH`.
- Evidence insufficiency returns `INSUFFICIENT_DATA`, not a fabricated low risk or score of zero.
- Store each assessment as a history record, including reason codes/evidence, policy version and assessment time.

### Account health

- Health score range: 0–100; higher means healthier.
- Approved v1 weights: recency 30%, customer feedback 25%, open issue severity/status 25%, follow-up completion 20%.
- Normalize over the available meaningful components only when at least two components are meaningful; with fewer than two, return `INSUFFICIENT_DATA`.
- Strategic-account status is manually marked by authorized Sales/Admin in v1. Persist who marked it.

### Task semantics

- `ReviewTask`: explicit human decision/approval, e.g. uncertain qualification or quote approval.
- `CustomerTask`: operational work such as retention, feedback escalation and strategic-account follow-up.
- Each task has stable identity, allowed statuses/transitions, assignee permissions, audit history and deduplication. A task source link must point to a valid allowed source record.

### Lead/customer identity

- A Lead is a prospect/source capture; a Customer is the unified account/person record. One Customer may be referenced by multiple Leads through conversion.
- Conversion is a backend transaction, preserves conversion metadata and cannot run twice for the same Lead without an explicit recovery rule.
- Name alone is not sufficient identity evidence. Matching/merging uses documented normalized fields and review where ambiguous.

### Data Cleaning

- Only allowlisted fields and correction types may be applied.
- Before apply, the backend re-reads the record and confirms the proposed old/current value still matches the scanned value.
- Enforce `safeToApply`, approval policy, actor permission, transaction, audit and idempotency in backend code. Never trust an n8n/client boolean alone.
- Preserve `PARTIAL` distinctly from `SUCCESS`.

### Follow-up and renewal communication

- Automated due follow-up uses one primary trigger path: RabbitMQ.
- `data.executionId` is required in `lead.follow_up.triggered` and references a persisted `FollowUpExecution`.
- NestJS Communication API owns delivery credentials, provider calls, status and idempotency. Failed/unknown delivery never advances a cadence as success.
- Renewal sends are draft/task-first; sending is permitted only when policy, consent, template and required approval allow it.

### Quote/pricing

- Backend owns authoritative catalog, currency, price, discount, tax, subtotal and total arithmetic.
- Quote lines store item/price snapshots so the generated quote remains reproducible if catalog values change.
- AI can write proposal language, never authoritative amounts.
- Unapproved quotes remain drafts and cannot be sent as final offers.

### Privacy and provenance

- Redact PII/sensitive content before sending transcript or feedback text to AI.
- Persist redacted transcript by default; any raw-content storage must be justified, access-restricted, protected and subject to configured retention/deletion.
- Mock/seed provider mode is explicit in stored result and UI. No invented integration is shown as real.

## 4. Reliability conventions

- Event envelope: `eventId`, `eventType`, `version`, `occurredAt`, `data`.
- Validate API DTOs, event schemas, callback identities and state transitions.
- Process events/callbacks idempotently. No double-send from duplicate deliveries.
- Retry recoverable errors after 1, 5 and 15 minutes; maximum four total attempts. Exhausted failures enter terminal failure/DLQ and are observable.
- Manual replay requires authorized actor, AuditLog and reuse of the original business idempotency identity.
- Keep secrets out of source files, n8n JSON and event payloads; use environment/secrets configuration.

## 5. API and event governance

The canonical route families and event names are in `07_API_CONTRACT.md` and `08_RABBITMQ_CONTRACT.md`. A contract change updates the DTO/schema, backend, every producer/consumer, n8n JSON, OpenAPI, fixtures, tests and documentation together. Avoid parallel aliases with identical business effects.
