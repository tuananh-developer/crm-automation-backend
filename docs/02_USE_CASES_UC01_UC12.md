# 02 — Application Use Cases UC01–UC12

## Canonical identifiers

`UC10` is AI CRM Data Cleaning, `UC11` is View Dashboard, and `UC12` is Manage Users. `UC` identifiers describe application use cases; `T12-WF01`–`T12-WF15` identify the separate Topic 12 n8n workflows.

## UC01 — Create and Manage Lead
- **Actor:** Sales User.
- **Goal:** Create, view, update and delete Leads, select a Lead Source, and assign an owner within the user's permissions.
- **Main flow:** validate form and source → call authenticated NestJS API → validate DTO/business rules → persist Lead → publish `lead.created` → return the record.
- **Alternative paths:** invalid fields/source, missing record, permission failure, duplicate conflict, or event-publish failure are returned as explicit errors and logged.
- **Boundary:** Lead CRUD owns Lead records. Qualification, enrichment and scoring use the Lead ID and do not create duplicate Leads.

## UC02 — AI Lead Qualification
- **Actor:** Sales User or an authorized automation request.
- **Goal:** assess fit/intent and persist confidence, reason, recommended next step and run status.
- **Main flow:** authorize request → create correlated WorkflowRun → publish `lead.qualification.requested` → n8n fetches Lead/context → AI returns structured result → validate result → authenticated idempotent callback → persist qualification and workflow status → create/reuse one `ReviewTask` when policy requires review.
- **Business rule:** confidence `<= 0.80` is review-required, including exactly `0.80`. Higher confidence passes only the confidence gate.
- **Boundary:** qualification does not produce the `HOT`/`WARM`/`COLD` score label; UC04 owns that rule.

## UC03 — AI Lead Enrichment
- **Actor:** Sales User or authorized automation request.
- **Goal:** collect company/contact attributes and retain source/provenance and result status.
- **Canonical API:** `POST /api/v1/leads/:leadId/enrichments`; history and latest result use the matching collection routes in `07_API_CONTRACT.md`.
- **Main flow:** create run → publish `lead.enrichment.requested` → obtain Lead/domain → call configured provider adapter → normalize and validate fields → callback → persist `SUCCESS`, `PARTIAL`, or `FAILED` with provenance.
- **Boundary:** enrichment does not calculate scores or invent unavailable facts. Mock-provider results carry provider mode `MOCK`.

## UC04 — AI Lead Scoring
- **Actor:** Sales User or authorized automation request.
- **Goal:** store an authoritative score from 0–100, label, rationale, features and policy version.
- **Main flow:** collect Lead/qualification/enrichment/interaction context → create correlated run → publish `lead.scoring.requested` → prepare structured features → invoke the backend scoring policy → validate canonical response → persist score history and run result.
- **Labels:** `HOT >= 75`; `WARM >= 40 and < 75`; `COLD < 40`.
- **Boundary:** the backend owns the scoring calculation. n8n/AI may explain but must not silently create a competing canonical score.

## UC05 — Enroll Lead in Follow-up Cadence
- **Actor:** Sales User.
- **Goal:** configure sequences and steps and enroll eligible Leads.
- **Canonical route family:** `/api/v1/follow-ups/...`.
- **Main flow:** create/select sequence → configure order, delay, channel, template and conditions → choose Lead → backend validates eligibility and duplicate enrollment → persist enrollment and scheduled executions → emit the execution event when an execution is due.
- **Boundary:** UC05 owns sequence/enrollment. It schedules execution; it does not deliver messages.

## UC06 — Execute Follow-up
- **Actor:** Automation system; Sales User observes status.
- **Goal:** execute one persisted `FollowUpExecution` and record delivery/retry outcome.
- **Main flow:** backend creates/marks the execution → publish `lead.follow_up.triggered` containing required `data.executionId` → WF04 checks eligibility and prepares message → NestJS Communication API sends idempotently → callback records delivery status → backend advances only after confirmed success or records retry/terminal failure.
- **Boundary:** execution does not create a sequence/enrollment. There is one primary automated trigger path (RabbitMQ), not parallel webhook and queue execution for the same ID.

## UC07 — Human-in-the-Loop Review
- **Actor:** Reviewer or assigned user.
- **Goal:** inspect, assign, approve/reject, comment on and resolve a decision requiring human judgment.
- **Main flow:** backend creates/deduplicates `ReviewTask` → notify reviewer → authorized user opens task and context → claim/start → submit decision/comment → validate state/permission → persist resolution and AuditLog.
- **Boundary:** `ReviewTask` is for review/approval. Routine retention, feedback escalation and account follow-up use `CustomerTask`.

## UC08 — Convert Lead to Customer
- **Actor:** Sales User.
- **Goal:** convert an eligible Lead while preserving traceability.
- **Main flow:** authorize and validate Lead → check it is not already converted → create/find the intended Customer under explicit matching policy → transactionally set conversion reference/by/at/status → write AuditLog → return Customer.
- **Boundary:** only the backend conversion service performs conversion. Workflows never insert Customers directly.

## UC09 — Customer Segmentation
- **Actor:** Sales User or authorized scheduled/automation request.
- **Goal:** manage segment criteria and evaluate customer membership.
- **Main flow:** configure active segment and criteria → backend validates criteria → rule engine evaluates the eligible Customer cohort → persist `CustomerSegment` assignments → return summary/statistics and notify on relevant anomalies.
- **Boundary:** NestJS is the single source of truth for segmentation rules and membership; WF07 only orchestrates.

## UC10 — AI CRM Data Cleaning
- **Actor:** Sales User/Admin.
- **Goal:** identify malformed/duplicate Lead data and apply selected corrections safely.
- **Main flow:** create scan with scope/filter → create WorkflowRun and publish `data.cleaning.requested` → WF08 reads scoped batch → detect issues and propose corrections → callback persists findings → UI displays risk/safety and proposed changes → user selects findings → backend rechecks allowlisted field, current value/freshness, actor permission, safety and approval → transaction updates records and AuditLog.
- **Boundary:** n8n proposes; NestJS validates and writes. A client-supplied `safeToApply` flag is not sufficient authorization.

## UC11 — View Dashboard
- **Actor:** Sales User/Admin.
- **Goal:** review role-permitted CRM KPIs, workflow runs, task queues, follow-up delivery and customer insights.
- **Main flow:** authenticate → request dashboard read models → backend calculates metrics from authoritative persisted sources → UI renders values, loading/error/empty states and drill-down links.
- **Boundary:** dashboard reads do not mutate CRM business records or independently calculate authoritative business policies.

## UC12 — Manage Users
- **Actor:** Admin.
- **Goal:** manage user accounts, roles, status and access within a controlled admin boundary.
- **Main flow:** authenticate as Admin → list/view/create/update/disable account → backend validates roles and state transition → write audit → return sanitized user details.
- **Security:** public registration assigns only the least-privileged permitted role server-side. Privileged roles can only be granted through a protected admin flow. Password hashes and secrets never appear in responses.

## Cross-use-case rules

- Qualification, enrichment and scoring each own their result history and share run correlation rather than duplicate one another's mutations.
- The Review module owns `ReviewTask` creation/lifecycle; business workflows may request review, but do not duplicate tasks independently.
- Follow-up enrollment and execution are separate lifecycles; delivery results come from the Communication API.
- Lead-to-Customer conversion is transactional and owned by UC08.
- Segmentation rules/membership are owned by the backend.
- Data Cleaning applies changes only through the backend revalidation/apply endpoint.
- All protected mutations are validated and audited at the backend, not by frontend or n8n alone.

## Canonical use-case diagram

See [`diagrams/usecase/usecase-recommended.puml`](diagrams/usecase/usecase-recommended.puml).
