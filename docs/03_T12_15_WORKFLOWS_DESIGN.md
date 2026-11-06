# Topic 12 — CRM & Customer Relationship: 15 Workflow Specifications

## Blueprint rule: 15 workflows × 12 functional nodes each

Each workflow graph contains **exactly 12 functional nodes total**, including one actual trigger. IF/Switch control nodes count. Sticky Notes do not. A branch may skip nodes on another branch because the number is the total graph count, not the number traversed by every execution. The shared Error Trigger handler is a separate workflow and is excluded from each business workflow's count.

These are the required completed workflow designs. The exported n8n JSON and runtime tests must conform to this specification.

## 1. Workflow catalogue

1. AI CRM Lead Qualification Agent
2. AI Lead Enrichment Agent
3. AI Lead Scoring Agent
4. AI CRM Follow-up Agent
5. AI Customer 360 Agent
6. AI Churn Monitoring Agent
7. AI Customer Segmentation Agent
8. AI CRM Data Cleaning Agent
9. AI CRM Conversation Summarizer
10. AI Next Best Action Agent
11. AI Sales Meeting Agent
12. AI Quote & Proposal Agent
13. AI Renewal Management Agent
14. AI Customer Feedback Agent
15. AI Account Management Agent

Application use cases use IDs `UC01`–`UC12`; Topic 12 workflows use IDs `T12-WF01`–`T12-WF15`. These are separate namespaces. UC10 = Data Cleaning, UC11 = View Dashboard, UC12 = Manage Users.

## 2. Team assignment — five workflows each

The owner split is the agreed implementation and acceptance responsibility.

| Owner | Workflow IDs | Topic 12 agents |
|---|---|---|
| Tuấn Anh | T12-WF01, WF08, WF10, WF11, WF12 | Qualification; Data Cleaning; Next Best Action; Sales Meeting; Quote & Proposal |
| Trường Linh | T12-WF02, WF03, WF05, WF09, WF14 | Enrichment; Lead Scoring; Customer 360; Conversation Summarizer; Customer Feedback |
| Trọng | T12-WF04, WF06, WF07, WF13, WF15 | Follow-up; Churn Monitoring; Customer Segmentation; Renewal Management; Account Management |

Each owner is accountable for five workflow deliverables. Each workflow is specified below with **exactly 12 functional n8n nodes**, including its trigger. Sticky Notes are not functional nodes and must not be used to inflate the count.

## 3. Shared architecture rules

1. **Do not make every workflow start with RabbitMQ.** Use the trigger appropriate to the event: RabbitMQ Trigger for genuinely asynchronous domain events, Webhook Trigger for explicit API/UI requests, and Schedule Trigger for periodic scans. RabbitMQ Trigger is technically a trigger; the goal is to avoid using RabbitMQ as the default for unrelated flows.
2. **Email delivery belongs in NestJS.** n8n may prepare/validate a message and call the project's backend Communication API. It must not send email directly through an SMTP node. Use the canonical Communication API in `07_API_CONTRACT.md`; its contract and tests are part of the completed system.
3. NestJS remains the source of truth for business validation, authorization, transactional mutations, persistence, and Audit Logs. n8n orchestrates APIs, AI providers, scheduling and decisions.
4. Use `WorkflowRun`, `AuditLog`, `Lead`, `Customer`, `Interaction`, `ReviewTask`, `FollowUpExecution`, `Segment` and `CustomerSegment` only where their semantics fit. `ReviewTask` is for explicit review/approval, not a generic operational follow-up task. `CustomerTask` is an operational-task capability for WF06/WF14/WF15; implement the agreed `CustomerTask` domain/API contract as part of the completed product.
5. External systems that are not configured for the completed deployment (email inboxes, chats, orders, tickets, call recordings, product catalogs, contracts) use a clearly marked adapter/mock until a real integration is configured and tested. Never label mock data as live external data.
6. Use secret-managed credentials / environment variables; never put API keys, passwords or tokens in exported workflow JSON.
7. Each workflow must have a real trigger, 12 functional nodes, input validation, structured outputs, a backend callback/persistence step where relevant, idempotency, and error handling. Configure retry/continue-on-fail on appropriate nodes while keeping the total node count at 12. Do not add empty Code nodes merely to reach the count.
8. Use the canonical endpoint paths, payloads and routing keys documented in `07_API_CONTRACT.md` and `08_RABBITMQ_CONTRACT.md`; implement and test every required contract.
9. Each workflow should be manually imported and runtime-tested in n8n. A JSON parse test alone does not prove it works.
10. **User-originated Webhook workflows must enter through NestJS.** UI/forms call an authenticated/authorized backend API first; NestJS creates/correlates a `WorkflowRun` and invokes a protected internal n8n webhook or emits the workflow event. Do not expose production n8n webhooks directly to browsers. Backend APIs called by n8n must authenticate the service identity and enforce the scoped requester/resource context.

## 4. The 15 workflows — exact 12-node blueprint each

### T12-WF01 — AI CRM Lead Qualification Agent
**Owner:** Tuấn Anh. **Related UC:** UC02.

1. **RabbitMQ Trigger** — consume `lead.qualification.requested` from the dedicated `n8n.lead-qualification.q` queue. The queue is bound to the exact routing key and receives only qualification requests.
2. **Code: Validate Event** — verify event type, lead ID, event ID and schema; ignore duplicates safely.
3. **HTTP Request: Get Lead** — fetch the authoritative lead from NestJS.
4. **HTTP Request: Get Interaction Context** — fetch the latest available interactions and profile signals through the canonical NestJS API.
5. **Code: Normalize Qualification Input** — normalize fields and construct compact structured input.
6. **HTTP Request: Gemini Qualification** — classify intent and assess qualification using the configured model.
7. **Code: Parse Structured Output** — parse and validate required fields and numeric confidence.
8. **Code: Apply Confidence Policy** — classify output, but treat `confidence <= 0.80` as review-required. The backend re-applies this policy authoritatively; n8n cannot approve an action by itself.
9. **HTTP Request: Qualification Callback** — send the validated result to the authenticated NestJS callback; backend owns final policy and persistence.
10. **IF: Review Required** — route cases that require human review for notification/summary only; it does not authorize record mutation.
11. **HTTP Request: Notify Reviewer** — request an idempotent backend notification. `ReviewTask` creation/lifecycle remains backend-owned and must not be duplicated in n8n.
12. **Code: Build Final Result** — produce a concise execution summary with status and correlation IDs.

### T12-WF02 — AI Lead Enrichment Agent
**Owner:** Trường Linh. **Related UC:** UC03.

1. **RabbitMQ Trigger** — consume `lead.enrichment.requested` from `n8n.lead-enrichment.q`.
2. **Code: Normalize Event** — parse payload and validate lead/request IDs.
3. **HTTP Request: Get Lead** — obtain authoritative lead fields.
4. **Code: Extract Domain** — normalize email and website; identify free-email domains.
5. **HTTP Request: Mock Enrichment Adapter** — Use deterministic fixture/mock responses unless a real provider is configured and tested; label every result with provider mode `MOCK` when mock data is used.
6. **Code: Normalize Provider Result** — map provider fields into the agreed schema.
7. **Code: Validate Completeness** — distinguish `SUCCESS`, `PARTIAL` and `FAILED`; never manufacture unknown data.
8. **HTTP Request: Enrichment Callback** — return structured findings to NestJS.
9. **IF: Partial/Failed** — identify incomplete or failed enrichments.
10. **HTTP Request: Backend Notification** — notify the owner through NestJS if configured.
11. **Code: Build Run Summary** — include provider mode (real/mock), status and correlation IDs.
12. **Code: Finalize Execution Output** — return a final structured output for n8n execution/logging.

### T12-WF03 — AI Lead Scoring Agent
**Owner:** Trường Linh. **Related UC:** UC04.

1. **RabbitMQ Trigger** — consume `lead.scoring.requested` from `n8n.lead-scoring.q`.
2. **Code: Validate Event** — validate lead ID and idempotency/correlation fields.
3. **HTTP Request: Get Lead** — fetch lead profile.
4. **HTTP Request: Get Latest Qualification** — fetch the latest qualification result.
5. **HTTP Request: Get Latest Enrichment** — fetch latest enrichment or a documented empty state.
6. **HTTP Request: Get Interactions** — fetch activity/engagement signals.
7. **Code: Aggregate Features** — build deterministic scoring features with documented weights.
8. **HTTP Request: Evaluate Backend Scoring Policy** — submit feature data to the single authoritative backend policy and receive canonical score/label.
9. **Code: Validate Canonical Score** — validate response shape, score boundaries, label and policy version; do not recalculate scoring business rules in n8n.
10. **HTTP Request: Scoring Callback** — persist the validated canonical score/history through the canonical NestJS scoring callback.
11. **IF: Hot Lead** — identify leads over the agreed high-priority threshold.
12. **HTTP Request: Backend Next-Action/Notification** — notify or create a recommendation through the canonical backend API; do not send email directly from n8n.

### T12-WF04 — AI CRM Follow-up Agent
**Owner:** Trọng. **Related UCs:** UC05 and UC06.

1. **RabbitMQ Trigger** — consume the single primary `lead.follow_up.triggered` event for one due execution. NestJS publishes after validating/scheduling the job; do not also start the same execution through a parallel webhook path.
2. **Code: Validate Execution Request** — validate execution, enrollment, step, channel and correlation IDs.
3. **HTTP Request: Get Follow-up Context** — fetch the authoritative enrollment, Lead and step from NestJS.
4. **Code: Check Eligibility** — verify active enrollment, due time, current step and duplicate-execution safeguards.
5. **Code: Render Message Payload** — prepare recipient, subject and content from approved templates.
6. **HTTP Request: Backend Send Message** — call the NestJS Communication API; actual email/SMTP delivery stays in backend.
7. **Code: Normalize Delivery Result** — map success, retryable failure and permanent failure.
8. **HTTP Request: Execution Callback** — send the result to the follow-up callback API.
9. **Code: Prepare Execution Outcome** — retain canonical delivery status, correlation ID and idempotency key for the next decision.
10. **IF: Delivery Succeeded?** — branch only on the authoritative delivery outcome returned by the Communication API/backend.
11. **HTTP Request: Backend Advance/Complete (success branch)** — advance the step or complete the enrollment transactionally only after confirmed delivery.
12. **HTTP Request: Backend Handle Delivery Failure (failure branch)** — backend applies bounded retry to retryable failures or records terminal failure; never advance a failed/unknown delivery.

### T12-WF05 — AI Customer 360 Agent
**Owner:** Trường Linh. **Workflow export:** `t12-wf05-customer-360.json`.

1. **Webhook Trigger** — receive a protected internal dispatch from NestJS after the caller is authenticated, authorized for the Customer, and correlated to a `WorkflowRun`; browsers never call n8n directly.
2. **Code: Validate Customer Request** — validate customer ID and requester context.
3. **HTTP Request: CRM Profile** — fetch the customer and linked Lead data from NestJS.
4. **HTTP Request: Get Interactions** — fetch interactions associated with the Customer and its converted Leads through CRM APIs.
5. **HTTP Request: Get Lead Intelligence History** — fetch qualification, enrichment, and scoring records that exist.
6. **HTTP Request: Get Follow-up History** — fetch follow-up enrollments and executions.
7. **HTTP Request: Get Segment Memberships** — fetch CustomerSegment assignments.
8. **HTTP Request: Get Issue/Feedback History** — read `CustomerIssue`/`CustomerFeedback`; when no records/source are available, return an explicit `NOT_CONNECTED`/empty-source marker, never fabricated live data.
9. **Code: Merge Customer Timeline** — normalize and combine source records with source provenance.
10. **HTTP Request: Gemini Customer 360 Summary** — summarize profile, recent activities, risks and opportunities.
11. **Code: Validate Customer 360 Output** — require structured fields and disclose unavailable sources.
12. **HTTP Request: Save Snapshot** — save the summary via the NestJS workflow/result API; use `WorkflowRun.output_payload` if appropriate.

### T12-WF06 — AI Churn Monitoring Agent
**Owner:** Trọng. **Workflow export:** `t12-wf06-churn-monitoring.json`.

1. **Schedule Trigger** — run on a configurable daily schedule.
2. **HTTP Request: Get Customer Cohort** — fetch active customers through NestJS.
3. **Split Out: Customer Items** — process customers individually or in bounded batches.
4. **HTTP Request: Get Customer Profile** — retrieve relevant customer/account details.
5. **HTTP Request: Get Engagement History** — obtain last interaction and engagement trend.
6. **HTTP Request: Get Follow-up/Feedback History** — fetch available follow-up failures and feedback signals.
7. **Code: Normalize Feature Snapshot** — normalize evidence/data coverage only; do not calculate the canonical risk score in n8n.
8. **HTTP Request: Evaluate Backend Churn Policy** — NestJS applies the deterministic versioned policy and persists `CustomerChurnAssessment` history in the same PostgreSQL database; return score/level or `INSUFFICIENT_DATA`.
9. **HTTP Request: AI Risk Explanation** — explain the backend score/evidence; AI does not set the official risk level.
10. **HTTP Request: Save Validated Explanation** — send the structured explanation to NestJS for validation and association with the assessment.
11. **IF: High Risk and Sufficient Evidence** — route only canonical high-risk customers with sufficient evidence to retention action.
12. **HTTP Request: Ensure CustomerTask** — call the NestJS operational-task API to create/reuse one retention task for the canonical assessment. This is a `CustomerTask`, not a `ReviewTask`; the backend creates or reuses it idempotently and records the Customer/assessment source reference.

### T12-WF07 — AI Customer Segmentation Agent
**Owner:** Trọng. **Related UC:** UC09. **Workflow export:** `t12-wf07-customer-segmentation.json`.

1. **Schedule Trigger** — periodically refresh active segments. If an on-demand refresh is later required, NestJS should publish a separate command/trigger path only after the team explicitly changes this workflow's trigger design and node-count acceptance criteria.
2. **HTTP Request: Get Active Segments** — retrieve segment definitions from NestJS.
3. **Split Out: Segment Items** — process each segment in a controlled batch.
4. **HTTP Request: Get Customer Cohort** — get eligible customers and features.
5. **Code: Prepare Rule Engine Request** — shape and validate the request payload only; do not implement segmentation criteria in n8n.
6. **HTTP Request: Evaluate Segment via Backend Rule Engine** — n8n only orchestrates; NestJS owns all segmentation criteria, evaluation logic, and CustomerSegment assignment mutations. Do not implement segment business rules in n8n Code nodes.
7. **HTTP Request: Get Assignment Statistics** — retrieve assignment counts/results.
8. **Code: Normalize Backend Results** — normalize returned assignment statistics for reporting; do not calculate segment membership/business rules in n8n.
9. **HTTP Request: AI Segment Insights** — generate a concise explanation/trend summary for the results.
10. **Code: Validate Insights** — validate response and avoid claims unsupported by the supplied data.
11. **HTTP Request: Save Workflow Summary** — record run/result in NestJS.
12. **HTTP Request: Notify on Anomaly** — report unexpected changes through backend notifications if thresholds are exceeded.

### T12-WF08 — AI CRM Data Cleaning Agent
**Owner:** Tuấn Anh. **Related UC:** UC10.

1. **RabbitMQ Trigger** — consume `data.cleaning.requested` from `n8n.data-cleaning.q`, which is bound to that routing key. The user starts scans through NestJS, which creates the run and publishes the event; users do not call n8n directly.
2. **Code: Validate Event** — validate `workflowRunId`, scope/filter, `eventId` and requester context.
3. **HTTP Request: Load Scan Context** — read the `WorkflowRun` and authorized scope already created by NestJS; do not create a duplicate run.
4. **HTTP Request: Fetch Lead Batch** — fetch a bounded batch of leads through the backend API.
5. **Code: Normalize Values** — trim whitespace and normalize permitted formats without mutating data.
6. **Code: Detect Deterministic Issues** — find missing/invalid fields using deterministic rules.
7. **Code: Build Duplicate/AI Context** — identify duplicate candidates and prepare only ambiguous cases for AI.
8. **HTTP Request: Gemini Cleaning Suggestions** — request suggestions, not autonomous writes.
9. **Code: Validate Findings and Safety Flags** — enforce schema, type/field allowlist, scanned values and `safeToApply`; duplicate descriptions must never be written into email/phone.
10. **HTTP Request: Cleaning Callback** — send findings to NestJS for storage.
11. **IF: Manual Review Needed** — route unsafe or ambiguous findings to human review.
12. **HTTP Request: Backend Notify Reviewer** — request an idempotent notification if supported; actual record mutation occurs only after backend revalidation and approval.

### T12-WF09 — AI CRM Conversation Summarizer
**Owner:** Trường Linh. **Workflow export:** `t12-wf09-conversation-summarizer.json`.

1. **Webhook Trigger** — receive a protected internal dispatch from NestJS after transcript source/access validation, scope authorization, and `WorkflowRun` correlation; browsers/ingestion sources never call n8n directly.
2. **Code: Validate Transcript** — validate source ID, type and maximum input length.
3. **Code: Normalize/Redact** — normalize text and remove unnecessary sensitive information before any AI request.
4. **HTTP Request: Save Redacted Transcript** — persist the redacted transcript to a dedicated `ConversationTranscript` entity via NestJS.
5. **HTTP Request: Get CRM Context** — fetch linked Lead/Customer and recent interactions.
6. **Code: Build Summary Context** — prepare concise context and source provenance.
7. **HTTP Request: Gemini Summarizer** — produce structured summary, intent, sentiment and proposed action items.
8. **Code: Parse and Validate Summary/Actions** — reject malformed/unsupported claims and mark low-confidence items.
9. **HTTP Request: Save Conversation Summary** — save to a dedicated `ConversationSummary` entity linked to `ConversationTranscript`; do not use generic `Interaction` as the only transcript/summary store.
10. **HTTP Request: Save Pending Action Items** — save action items to a dedicated `ConversationActionItem` entity through NestJS, with pending/review state where appropriate.
11. **HTTP Request: Notify Owner** — request in-app notification through NestJS.
12. **Code: Build Final Summary** — return result IDs and final status.

### T12-WF10 — AI Next Best Action Agent
**Owner:** Tuấn Anh. **Workflow export:** `t12-wf10-next-best-action.json`.

1. **Webhook Trigger** — receive a protected internal dispatch from NestJS after requester identity and Lead/Customer access authorization; browsers never call n8n directly.
2. **Code: Validate Entity Reference** — validate entity type and ID.
3. **HTTP Request: Get Entity Profile** — fetch customer/lead profile.
4. **HTTP Request: Get Qualification/Score** — retrieve latest eligible qualification and score, if applicable.
5. **HTTP Request: Get Interaction History** — retrieve recent engagement.
6. **HTTP Request: Get Follow-up/Segment Context** — obtain the authoritative sequence and segment membership.
7. **Code: Generate Candidate Actions** — create a bounded candidate set using explicit business rules.
8. **HTTP Request: AI Rank/Explain Actions** — rank only the allowed candidates and explain why.
9. **Code: Validate Action** — enforce action allowlist, evidence references and confidence thresholds.
10. **HTTP Request: Save Recommendation** — persist recommendation in a backend workflow/result record.
11. **IF: Human Approval Required** — route actions with risk or low confidence to review.
12. **HTTP Request: Create Review/Notification** — ask backend to create an approval task; do not execute high-impact actions automatically.

### T12-WF11 — AI Sales Meeting Agent
**Owner:** Tuấn Anh. **Workflow export:** `t12-wf11-sales-meeting.json`.

1. **Webhook Trigger** — receive a protected internal dispatch from NestJS after meeting-source/attendee authorization and `WorkflowRun` correlation; UI/source connectors do not call n8n directly.
2. **Code: Validate Meeting Input** — validate meeting ID, transcript and attendee references.
3. **Code: Normalize/Redact Transcript** — normalize the transcript and minimize personal data before any AI request.
4. **HTTP Request: Save Redacted Meeting Transcript** — persist transcript in a dedicated transcript entity through NestJS.
5. **HTTP Request: Get CRM Attendee Context** — retrieve related leads/customers and account context.
6. **Code: Build Meeting Prompt** — prepare meeting purpose and CRM context.
7. **HTTP Request: Gemini Meeting Analysis** — return structured summary, decisions, risks and action items.
8. **Code: Parse and Validate Meeting Output** — validate summary/action-item schema and mark unsupported fields as uncertain.
9. **HTTP Request: Save Meeting Summary** — persist summary in a dedicated summary entity linked to the transcript, not only generic `Interaction`.
10. **HTTP Request: Save Meeting Action Items** — save action items in a dedicated entity for confirmation rather than silently assigning unsupported commitments.
11. **HTTP Request: Notify Owner/Attendees** — use backend notification/communication APIs.
12. **Code: Finalize Meeting Report** — return summary and created record references.

### T12-WF12 — AI Quote & Proposal Agent
**Owner:** Tuấn Anh. **Workflow export:** `t12-wf12-quote-proposal.json`.

1. **Webhook Trigger** — receive a protected internal dispatch from NestJS after Sales authorization and customer/lead scope validation; browsers never call n8n directly.
2. **Code: Validate Requirements** — validate customer ID, requirements and requested items.
3. **HTTP Request: Get Customer Context** — retrieve customer details from NestJS.
4. **HTTP Request: Get Product/Pricing Catalog** — retrieve the real configured catalog; if absent, use an explicitly labelled demo catalog, never invent prices.
5. **Code: Normalize Requirements** — map requested items to known catalog identifiers.
6. **HTTP Request: Gemini Proposal Draft** — draft explanatory text and proposal structure, not authoritative monetary calculations.
7. **Code: Parse Line Items** — validate item IDs, quantities and required fields.
8. **HTTP Request: Backend Pricing Validation** — have NestJS calculate totals/taxes/discount constraints deterministically.
9. **Code: Determine Approval Requirement** — apply documented discount/amount/business approval thresholds.
10. **HTTP Request: Save Draft** — persist proposal draft in a dedicated backend record or `WorkflowRun.output_payload`.
11. **IF: Approval Required** — route drafts that require approval.
12. **HTTP Request: Create Approval Task** — ask NestJS to create the task; do not send an unapproved quote to a customer.

### T12-WF13 — AI Renewal Management Agent
**Owner:** Trọng. **Workflow export:** `t12-wf13-renewal-management.json`.

1. **Schedule Trigger** — daily renewal scan.
2. **HTTP Request: Get Contracts Due** — retrieve eligible `CustomerContract` records whose renewal dates fall inside the configured renewal window through NestJS.
3. **Split Out: Contract Items** — process each contract separately.
4. **HTTP Request: Get Contract/Customer Details** — verify contract status and customer context.
5. **Code: Calculate Renewal Urgency** — calculate days to renewal from actual dates.
6. **HTTP Request: AI Renewal Recommendation** — prepare a recommendation and a draft message.
7. **Code: Validate Draft** — ensure contract/customer/date details are grounded in source data.
8. **HTTP Request: Save Renewal Draft** — persist the draft and provenance through NestJS; do not send at this step.
9. **IF: Auto-send Explicitly Allowed?** — require explicit policy permission, approved template, valid consent, and any required human approval before sending.
10. **HTTP Request: Backend Send Message (yes branch)** — call NestJS Communication API only when every sending gate passes; never send directly from n8n.
11. **HTTP Request: Create/Ensure Renewal Approval Task (no branch)** — create/reuse one owner task and keep the draft pending; do not send.
12. **HTTP Request: Record Renewal Attempt** — persist `SENT`, `FAILED`, or `PENDING_APPROVAL`/not-sent status idempotently for audit; do not call a no-send path successful delivery.

### T12-WF14 — AI Customer Feedback Agent
**Owner:** Trường Linh. **Workflow export:** `t12-wf14-customer-feedback.json`.

1. **Webhook Trigger** — receive a protected internal dispatch from NestJS after the feedback source is validated, rate-limited, authorized/scoped, and correlated to a `WorkflowRun`; the form/API calls NestJS, never n8n directly.
2. **Code: Validate Feedback Input** — validate customer reference, channel and text.
3. **Code: Validate Redaction/Normalize Feedback** — validate redaction metadata supplied by NestJS, normalize safe text, and reject unredacted payloads before the AI call.
4. **HTTP Request: Get Customer Context** — fetch customer and recent interaction history.
5. **HTTP Request: Gemini Feedback Classification** — classify sentiment, category and urgency.
6. **Code: Validate Classification** — enforce schema and confidence constraints.
7. **Code: Determine Priority/SLA** — map categories/severity to documented handling policy.
8. **HTTP Request: Save Feedback** — persist through the backend feedback API backed by the dedicated `CustomerFeedback` table/entity.
9. **IF: Escalation Required** — route serious complaints/risks.
10. **HTTP Request: Ensure CustomerTask** — request the NestJS operational task linked to `customer_feedback_id`; keep it distinct from `ReviewTask`, which is for explicit approval/review. The backend validates the feedback source and creates or reuses the task idempotently.
11. **HTTP Request: Backend Acknowledge/Notify** — ask NestJS to send an acknowledgment or owner notification.
12. **HTTP Request: Feedback Callback/Log** — record completion status through an idempotent backend API.

### T12-WF15 — AI Account Management Agent
**Owner:** Trọng. **Workflow export:** `t12-wf15-account-management.json`.

1. **Schedule Trigger** — weekly strategic-account review.
2. **HTTP Request: Get Strategic Accounts** — fetch Customers explicitly marked `STRATEGIC` by an authorized Sales/Admin user for v1. Do not infer strategic status from unavailable revenue/contract data.
3. **Split Out: Account Items** — process accounts individually.
4. **HTTP Request: Get Account Profile** — fetch customer/account attributes.
5. **HTTP Request: Get Interaction Metrics** — retrieve engagement and recent contact history.
6. **HTTP Request: Get Open Follow-ups/Feedback/Renewals** — retrieve current issues and pending commitments.
7. **HTTP Request: Calculate Account Health** — backend applies the versioned deterministic policy (engagement 30%, feedback 25%, open issues 25%, follow-up completion 20%) and returns `INSUFFICIENT_DATA` if evidence is inadequate. These weights are the approved v1 baseline; any later evidence-based calibration must be recorded as a new policy version.
8. **HTTP Request: AI Account Review** — explain risks/opportunities from the supplied evidence and official score; AI does not calculate the official health score.
9. **Code: Validate Recommendations** — require evidence references, allowed action categories and explicit handling of `INSUFFICIENT_DATA`.
10. **HTTP Request: Save Account Snapshot** — persist the health result and AI explanation through NestJS.
11. **IF: Critical Risk/Opportunity** — identify accounts requiring prompt human action.
12. **HTTP Request: Ensure CustomerTask/Notify Owner** — request an idempotent operational `CustomerTask` for a critical account and notify its owner through NestJS. Use the CustomerTask API and do not create a `ReviewTask` unless a genuine approval decision is required.

## 5. Shared services required by the workflow set

- **Communication API:** NestJS is the only service that delivers email/messages. Workflows prepare/validate requests and call the protected backend API; provider credentials stay in secret-managed configuration.
- **Customer 360:** version 1 aggregates CRM records stored in PostgreSQL. Unconnected inbox/chat/order/ticket/call data is shown as unavailable or labelled demo data.
- **Catalog and contracts:** quotes require a catalog and backend price calculator; renewals require customer contracts and renewal dates. Seed/mock data is labelled until a verified authoritative source is connected.
- **Dedicated business history:** churn uses `CustomerChurnAssessment`; transcript/summary/action items use dedicated entities; feedback uses `CustomerFeedback`; operational follow-up uses `CustomerTask`. WorkflowRun may hold transient run output but does not replace those records where business history is required.
- **Data Cleaning:** scan findings are persisted with run/audit context; only the backend apply operation can mutate business records.
- **Next Best Action:** use a backend allowlist and deterministic policy; do not execute model-generated free text.

## 6. Shared success and failure contract

Every workflow accepts a validated request/event with a stable correlation identity; validates required input; reads authoritative records through NestJS; uses structured AI/provider schemas; validates all model output; calls the designated backend operation for persisted mutations; records result status and correlation IDs; and handles timeout, malformed output, retryable error and terminal failure. Duplicate delivery cannot create duplicate tasks, workflow results or messages. Never include credentials in events or exported workflow JSON.

## 7. Global acceptance criteria

For every one of the 15 workflows:
- [ ] Exactly 12 functional n8n nodes in the exported workflow JSON, including one actual trigger node.
- [ ] No Sticky Notes counted as functional steps.
- [ ] One-to-one mapping from the 12 specified steps to the 12 executable nodes.
- [ ] Node connections and branch paths are valid; no dangling references.
- [ ] Trigger and queue/event contracts match `07_API_CONTRACT.md` and `08_RABBITMQ_CONTRACT.md`.
- [ ] API endpoints exist and payloads match real backend DTOs.
- [ ] Every external/mock source is clearly labelled.
- [ ] AI output is structured and validated before any business action.
- [ ] Emails are sent through NestJS backend only.
- [ ] Error/timeout handling and retry policies are configured without duplicate mutations.
- [ ] Workflow results can be traced by correlation/event ID and `WorkflowRun` when applicable.
- [ ] Import test succeeds in n8n and runtime test evidence is recorded.
- [ ] No credentials are embedded in JSON.

## 8. Build order

1. Establish the database model, DTO/OpenAPI contracts, RBAC, callback authentication, idempotency and event policies used by all workflows.
2. Implement shared services: task lifecycles, Communication API, scoring policy, data cleaning apply policy, catalog/pricing, transcript privacy and workflow status handling.
3. Implement workflow JSONs in the P14 ownership split; run each against deterministic fixtures.
4. Import all 15 into n8n and test each independently, including failure branches and duplicate-event behavior.
5. Run complete frontend → NestJS → RabbitMQ/n8n → callback → PostgreSQL → frontend flows and record evidence.

## 9. Definition of a completed workflow

A workflow is complete only when its exported JSON has exactly 12 functional nodes; the node names and connections conform to the blueprint; its API/event schemas are contract-tested; its backend mutations are authenticated, authorized and idempotent; success and failure states are persisted correctly; retries/DLQ and privacy rules are implemented; deterministic fixture tests pass; n8n import and runtime execution are demonstrated; and its owner has linked test evidence in the project review.
