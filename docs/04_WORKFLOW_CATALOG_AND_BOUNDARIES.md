# 04 — Workflow Catalog, Ownership Boundaries and Data Handoffs

## 1. Shared execution contract

Every workflow uses a validated trigger, a stable workflow/run correlation ID, authoritative backend reads, structured inputs/outputs, idempotent backend mutations, explicit status/error reporting and the shared failure-handling policy. n8n orchestrates; NestJS owns authorization, business policies, transactions, persisted state and communication delivery.

## 2. The 15 workflows

| ID | Workflow | Trigger | Primary inputs | Persisted output/result | Owner |
|---|---|---|---|---|---|
| T12-WF01 | AI CRM Lead Qualification Agent | RabbitMQ `lead.qualification.requested` | Lead ID, run/event ID, Lead profile and interaction context | Qualification result, workflow status, optional deduplicated ReviewTask | Tuấn Anh |
| T12-WF02 | AI Lead Enrichment Agent | RabbitMQ `lead.enrichment.requested` | Lead ID, run/event ID, normalized domain/contact fields | Enrichment history with provider provenance and `SUCCESS/PARTIAL/FAILED` | Trường Linh |
| T12-WF03 | AI Lead Scoring Agent | RabbitMQ `lead.scoring.requested` | Lead ID, qualification/enrichment/interaction signals | Canonical backend score, label, features and policy version | Trường Linh |
| T12-WF04 | AI CRM Follow-up Agent | RabbitMQ `lead.follow_up.triggered` | Required persisted `executionId`, enrollment/step/Lead context | Communication delivery result and updated FollowUpExecution/enrollment state | Trọng |
| T12-WF05 | AI Customer 360 Agent | Authenticated NestJS request | Customer ID and authorized request context | Aggregated CRM 360 result/snapshot, source coverage | Trường Linh |
| T12-WF06 | AI Churn Monitoring Agent | Schedule Trigger | Eligible customers and persisted CRM signals | CustomerChurnAssessment, optional CustomerTask/notification | Trọng |
| T12-WF07 | AI Customer Segmentation Agent | Schedule Trigger or authorized request | Segment rules and eligible cohort | Backend-evaluated membership, run summary and stats | Trọng |
| T12-WF08 | AI CRM Data Cleaning Agent | RabbitMQ `data.cleaning.requested` after NestJS scan request | WorkflowRun ID, scope/filter, scoped Lead batch | Findings/report and audited safe corrections selected by user | Tuấn Anh |
| T12-WF09 | AI CRM Conversation Summarizer | Authenticated NestJS transcript request | Transcript/meeting/customer/Lead references, redacted text | ConversationTranscript, ConversationSummary, ConversationActionItem | Trường Linh |
| T12-WF10 | AI Next Best Action Agent | Authenticated NestJS request | Customer/Lead context, history and allowed-action policy | Evidence-linked recommendations and review request when required | Tuấn Anh |
| T12-WF11 | AI Sales Meeting Agent | Authenticated meeting/transcript request | Meeting metadata, transcript, permitted attendee/customer context | SalesMeeting, transcript, summary and action items | Tuấn Anh |
| T12-WF12 | AI Quote & Proposal Agent | Authenticated Sales request | Customer/Lead, catalog item IDs, quantity and pricing context | Draft Quote/QuoteItems with backend-calculated totals and approval state | Tuấn Anh |
| T12-WF13 | AI Renewal Management Agent | Scheduled due-renewal scan | CustomerContract, renewal date, consent/policy/template | RenewalAttempt and task; message through Communication API when allowed | Trọng |
| T12-WF14 | AI Customer Feedback Agent | Feedback received through backend ingress | Customer reference, channel, rating/text and source metadata | CustomerFeedback, sentiment/category/urgency and optional CustomerTask | Trường Linh |
| T12-WF15 | AI Account Management Agent | Weekly Schedule Trigger | Strategic customer profile, interaction/feedback/issue/follow-up evidence | CustomerHealthAssessment, account summary, optional CustomerTask/notification | Trọng |

Node-by-node specifications are in `03_T12_15_WORKFLOWS_DESIGN.md` and the matching activity diagrams.

## 3. Data and side-effect ownership

| Capability | Authoritative owner | Workflow responsibility |
|---|---|---|
| Lead/Customer records and conversion | NestJS Leads/Customers services | Read context and request an allowed operation; never insert CRM records directly. |
| Qualification result and ReviewTask lifecycle | NestJS Lead Intelligence/Review services | Produce validated analysis; backend decides whether to create/reuse a ReviewTask. |
| Enrichment data/provenance | NestJS Enrichment service | Normalize provider result and callback; preserve result state. |
| Lead score/label | NestJS scoring policy | Build structured features and explain the result; never introduce a competing score calculation. |
| Follow-up enrollment/execution | NestJS Follow-up service | WF04 executes one persisted execution identified by `executionId`. |
| Actual message delivery | NestJS Communication API | WF04/WF13 request sending and consume delivery status. |
| Segmentation criteria/membership | NestJS segmentation Rule Engine | WF07 requests evaluation and summarizes outcome. |
| Data Cleaning apply | NestJS Data Cleaning service | WF08 proposes findings; backend revalidates and writes selected corrections. |
| ReviewTask | NestJS Review service | Owns approval/review lifecycle and decisions. |
| CustomerTask | NestJS CustomerTask service | Owns retention, feedback escalation and account follow-up lifecycle. |
| Quote/pricing | NestJS Catalog/Pricing/Quote services | AI drafts text; backend performs price arithmetic and state transitions. |
| Transcript privacy and feedback | NestJS ingress/domain services | Redaction, access, persistence, retention and deletion are enforced outside the model. |

## 4. Boundaries that prevent duplicate logic

- WF01 classifies qualification; WF03 owns Lead score and `HOT/WARM/COLD` labels.
- WF02 enriches fields and records provenance; it does not convert a Lead or set a canonical score.
- WF05 aggregates persisted CRM data; it does not invent external-source data.
- WF06 assesses churn and may create a `CustomerTask`; WF15 assesses account health and may also create a `CustomerTask`. The same logical task must be deduplicated.
- WF07 delegates membership to the backend Rule Engine.
- WF08 never applies corrections itself.
- WF09/WF11 redact transcript data before AI; only the backend persists transcript, summary and action item records.
- WF10 recommendations are constrained by an allowlist and backend approval/policy.
- WF12 never treats AI-generated price text as authoritative pricing.
- WF13 creates a renewal task/attempt by default; communication is policy/consent/approval gated.
- WF14 operational escalation is a `CustomerTask`, not a `ReviewTask`, unless a genuine approval decision is required.

## 5. Data-source rules

- CRM profile and activity context come from PostgreSQL through backend APIs.
- Real enrichment, inbox/chat/order/ticket/calendar/recording/catalog/contract providers require configured, tested adapters. Otherwise use explicit `MOCK`/`SEED` mode and disclose provenance in the UI and stored result.
- Unknown fields remain unknown; no AI-generated facts are stored as verified external facts without provenance.
- Transcript and feedback data is redacted before AI transmission; raw transcript storage is not the default.

## 6. Workflow readiness/acceptance contract

For a workflow to be accepted, its trigger, all 12 nodes, input/output schema, branch connections, backend endpoint/event references, data ownership, idempotency key, status mapping, failure/retry behavior and test fixtures must be documented and match the exported JSON. Its owner must provide n8n import/runtime evidence and backend integration test evidence.
