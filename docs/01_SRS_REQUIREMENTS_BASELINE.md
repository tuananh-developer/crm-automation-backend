# 01 — Software Requirements Specification (SRS)

## 1. Purpose

AI CRM Automation is a CRM system that manages leads and customers and uses AI-assisted, event-driven n8n workflows to support qualification, enrichment, scoring, customer care, follow-ups, meeting summaries, quotes, renewals, and account health. This SRS describes the required completed product.

## 2. Product components

| Component | Required responsibility |
|---|---|
| Next.js frontend | Authenticated CRM workspace, forms, record lists/details, workflow results, review queues, dashboard, customer insights, quotes, renewals, and administration. |
| NestJS backend | REST APIs, DTO validation, authentication/RBAC, business policy, transactions, persistence, idempotency, communication delivery, notifications, callbacks, and audit logging. |
| PostgreSQL + TypeORM | Authoritative persistence for CRM records, workflow histories, customer insights, quotes/contracts, task lifecycles, and audit records. |
| RabbitMQ | Durable asynchronous event delivery using dedicated queues per independent consumer. |
| n8n | Fifteen executable automation workflows, each with exactly 12 functional nodes, plus a shared error-handler workflow. |
| AI/provider adapters | Structured AI responses for supported analysis. Provider mode and provenance are recorded; mock providers are clearly labelled. |
| Communication API | Backend-owned sending of email/message notifications, with authorization, idempotency, delivery state, and secret-managed provider credentials. |

## 3. Users and permissions

- **Sales User:** manage assigned/permitted Leads and Customers; run intelligence workflows; configure follow-up sequences; review assigned tasks; view segments, feedback, meetings, quotes, renewals, account health, and permitted dashboard metrics.
- **Admin:** manage users/roles, access policies, configuration and authorized CRM administration.
- **Reviewer/Task Assignee:** view and resolve assigned `ReviewTask` or `CustomerTask` items according to their distinct permissions.
- **Automation service identity:** n8n-to-backend machine calls; narrowly scoped and separate from human user credentials.
- **Feedback submitter/source:** submit feedback through validated backend ingress; cannot access other customer data.

Every protected operation is authorized by the backend. A UI-hidden button is not an authorization control. Public self-registration cannot assign privileged roles.

## 4. Functional requirements

| ID | Required completed capability | Acceptance outcome |
|---|---|---|
| FR-01 | Authentication and user administration | Register/login/profile flows work; sessions/tokens are validated; only authorized administrators can assign privileged roles or manage users. |
| FR-02 | Lead and Lead Source management | Authorized users can create/read/update/delete Leads and manage valid sources; field validation, ownership, audit, and duplicate handling follow backend policy. |
| FR-03 | AI Lead Qualification | An authorized request creates a correlated workflow run; the result, confidence and rationale are stored; confidence `<= 0.80` produces or reuses exactly one `ReviewTask`. |
| FR-04 | AI Lead Enrichment | Enrichment data includes source/provenance and distinct `SUCCESS`, `PARTIAL`, and `FAILED` states; unknown facts are not fabricated. |
| FR-05 | AI Lead Scoring | The backend owns the canonical 0–100 score and label; `HOT >= 75`, `WARM >= 40 and < 75`, `COLD < 40`; policy version and evidence are retained. |
| FR-06 | Follow-up cadence and execution | Users configure sequences/steps and enroll Leads; each due execution has a persisted `FollowUpExecution`; RabbitMQ triggers WF04 once; backend Communication API sends; a failed/unknown delivery never advances the cadence as success. |
| FR-07 | Human review and approval | `ReviewTask` can be created/deduplicated, assigned, started, approved/rejected, commented, and resolved with authorization and audit history. |
| FR-08 | Lead-to-Customer conversion | Conversion is transactional, preserves the Lead-to-Customer reference and conversion metadata, prevents repeated conversion, and emits an audit record. |
| FR-09 | Customer segmentation | Users manage segment criteria; the backend rule engine computes membership and stats; n8n never writes memberships directly. |
| FR-10 | AI CRM Data Cleaning | Users request scans, view findings, select corrections, and apply only validated safe/approved findings. Backend rechecks allowlisted fields, freshness, permission, approval, idempotency, transaction and audit. |
| FR-11 | Customer 360 | One customer view aggregates linked Leads, interactions, qualification/enrichment/score history, follow-up, segments, issues, feedback, churn and health records when available; absent sources show an explicit no-data/not-connected state. |
| FR-12 | Churn monitoring | Each assessment stores score, risk band, contributing evidence, policy version and assessed time. Bands are 0–39 LOW, 40–69 MEDIUM, and 70–100 HIGH; insufficient evidence is `INSUFFICIENT_DATA`. |
| FR-13 | Conversation summarization | Transcripts enter through the backend, are redacted before AI processing, and produce persisted summaries and action items with access controls and configurable retention/deletion. |
| FR-14 | Next Best Action | The system recommends only allowlisted actions, cites evidence, and routes consequential actions through backend policy and required review; model free text cannot execute side effects. |
| FR-15 | Sales meeting assistance | Meeting metadata/transcript, summary, participants/context, and follow-up action items are stored in dedicated linked records; unsupported calendar/recording connections are not represented as live. |
| FR-16 | Quote and proposal | Backend calculates authoritative line/subtotal/discount/tax/total/currency using catalog and pricing policy. AI may draft narrative text only. Quotes remain drafts until authorized approval. |
| FR-17 | Renewal management | Contracts and renewal dates are tracked; renewal attempts are idempotent and auditable; outbound communication obeys policy/consent and approval gates, with draft/task as default. |
| FR-18 | Customer feedback | Feedback is persisted with source/channel, rating, redacted text, derived labels and processing status. Serious feedback can create a deduplicated `CustomerTask`; do not use `ReviewTask` for ordinary operational follow-up. |
| FR-19 | Account management | Authorized Sales/Admin users explicitly mark strategic accounts in v1. Versioned deterministic health assessments use approved weights and preserve history; critical cases create/reuse `CustomerTask` and notify owners. |
| FR-20 | Dashboard and notifications | Users see role-filtered KPIs, workflow status/results, task counts and CRM summaries sourced from persisted backend data. Dashboard reads do not mutate business records. |
| FR-21 | Workflow traceability | Requests, events, n8n runs, callbacks and persisted results are correlated through stable run/event/execution identifiers; failure and replay actions are auditable. |

## 5. Use cases and automation inventory

Application use cases: `UC01` Lead Management; `UC02` AI Lead Qualification; `UC03` AI Lead Enrichment; `UC04` AI Lead Scoring; `UC05` Follow-up Enrollment; `UC06` Follow-up Execution; `UC07` Human Review; `UC08` Lead-to-Customer Conversion; `UC09` Customer Segmentation; `UC10` AI CRM Data Cleaning; `UC11` Dashboard; `UC12` User Management.

Topic 12 workflow IDs and their complete node sequences are specified in `03_T12_15_WORKFLOWS_DESIGN.md`.

## 6. Approved business rules

1. Qualification confidence `<= 0.80` requires a backend-owned `ReviewTask`; `0.80` is included. Confidence above the threshold passes only this one gate, not all other policy checks.
2. One backend-owned scoring policy determines the final Lead score and `HOT`/`WARM`/`COLD` label.
3. Churn bands: 0–39 LOW, 40–69 MEDIUM, 70–100 HIGH. Insufficient evidence returns `INSUFFICIENT_DATA`, never a fabricated zero-risk result.
4. Health score: 0–100, higher means healthier. Weights: interaction recency 30%, feedback 25%, open issue severity/status 25%, follow-up completion 20%. Normalize across available meaningful components only when at least two components are meaningful; otherwise return `INSUFFICIENT_DATA`.
5. Strategic-account status is explicitly set by authorized Sales/Admin in v1. Store who marked it.
6. `ReviewTask` is for decisions/approvals. `CustomerTask` is for operational retention, escalation, and account follow-up. They are separate lifecycles.
7. Lead and Customer are distinct: one Customer may be referenced by multiple converted Leads. Conversion must preserve source relationships and be transactional.
8. Data Cleaning applies only allowlisted safe corrections and required approvals after checking that the source value has not changed.
9. For recoverable errors, retry at 1, 5 and 15 minutes after the initial attempt; four total failed attempts lead to terminal failure/DLQ. Manual replay requires permission, audit and idempotency.
10. Transcript and feedback content is redacted before being sent to AI. Store only redacted transcript text by default; restrict access and support configured retention/deletion.

## 7. External and demonstration data policy

Customer 360 v1 uses CRM data persisted in PostgreSQL. Email inboxes, chat systems, orders, ticketing, call recording, calendars, catalog and contract data sources are not assumed to be connected automatically. Where a real integration is not configured, use a clearly labelled mock/seed adapter and show its provenance in results/UI. Never present mock data as live provider data.

## 8. Non-functional requirements

- **Security:** password hashing, safe role assignment, RBAC at backend endpoints, authenticated internal callbacks, scoped service identities, secret-managed credentials, input validation and safe error messages.
- **Integrity:** database constraints, transactions for multi-record mutations, explicit status transitions, idempotent events/callbacks, and no duplicate sends/tasks on retry.
- **Reliability:** bounded retries, terminal failure/DLQ, observable failed executions, authorized audited replay, timeout behavior, and recovery instructions.
- **Privacy:** minimum necessary personal data; redaction before AI; restricted transcript/feedback access; retention/deletion configuration; no secrets in events or workflow JSON.
- **Observability:** correlation IDs, structured logs, WorkflowRun status/output/error, provider mode, policy version and audit records for consequential changes.
- **Maintainability:** DTO/OpenAPI contracts, migrations, unit/integration tests, typed schemas, versioned business policies and documented environment variables.
- **Usability:** clear loading/error/empty states, status labels, explanation/reason codes, pagination/filtering for long lists, and confirmation for consequential actions.

## 9. System-level acceptance criteria

The system is accepted when every item in `12_ACCEPTANCE_CHECKLIST.md` passes, all 15 n8n exports have exactly 12 functional nodes and import successfully, the application operates end-to-end using local services and clearly labelled fixtures where necessary, and the owner records test evidence for the happy path plus critical failure/security paths. Documentation alone, a valid JSON file, or a diagram with 12 labels is not runtime acceptance evidence.
