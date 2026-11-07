# T12 Backend Implementation — WF01/WF08/WF10/WF11/WF12

This patch implements backend API and persistence support for the five workflows owned by Tuấn Anh. It deliberately does not modify WF02, WF03, or WF04 source/workflow files.

## Existing prerequisites

- WF01 Lead Intelligence internal routes/controller/service were delivered in the earlier `wf01-backend-patch`. Keep that code; this patch does not overwrite it. The user previously reported 56/56 passing tests for the two WF01 target suites. The current WF01 internal context APIs return only company/profile attributes and interaction metadata (IDs, type, channel and time); contact names, email, phone, notes, interaction subjects and message bodies are not copied into n8n execution data.
- Existing Data Cleaning routes remain authoritative: `GET /api/v1/data-cleaning/scans/:workflowRunId/leads` and `POST /api/v1/data-cleaning/callback` are already guarded by `N8nAuthGuard`.
- Root API prefix is `/api/v1`.

## WF08 — Data Cleaning

New internal routes:

- `GET /api/v1/internal/n8n/data-cleaning/scans/:workflowRunId`
- `POST /api/v1/internal/n8n/data-cleaning/notify-reviewer`

Both use `N8nAuthGuard`. The existing callback stays at `/api/v1/data-cleaning/callback`; the workflow export in this bundle is corrected to that actual route. Scan notification is idempotent and targets the requesting user only when persisted findings include human-review items. It does not apply data changes or create ReviewTask. Actual data changes still occur only through existing user-authenticated `applyCleaning()` after backend freshness/allowlist/transaction checks.

The patch mutates the existing `DataCleaningService` and DTO barrel through an idempotent Python mutator to preserve local uncommitted changes; it does not replace the entire service file.

WF08's Gemini prompt receives only company/profile fields and duplicate-candidate IDs/match metadata. Deterministic findings retain the source values in the backend report for authorized human review; those values are not included in the AI prompt.

## WF10 — Next Best Action

User routes:

- `POST /api/v1/next-best-actions/requests` (JWT + `Idempotency-Key`)
- `GET /api/v1/next-best-actions/:recommendationId` (owner/Admin scoped)

Internal n8n routes (`N8nAuthGuard`):

- `POST /api/v1/internal/n8n/next-best-actions/claim-and-entity-context` — validates entity/run scope and claims the active WorkflowRun before returning context; competing executions receive HTTP 409.
- `GET /api/v1/internal/n8n/next-best-actions/entity-context`
- `GET /api/v1/internal/n8n/next-best-actions/intelligence-context`
- `GET /api/v1/internal/n8n/next-best-actions/interactions`
- `GET /api/v1/internal/n8n/next-best-actions/follow-up-segment-context`
- `POST /api/v1/internal/n8n/next-best-actions/callback`
- `POST /api/v1/internal/n8n/next-best-actions/review`

The WF10 profile endpoint returns only company/profile attributes; interaction context contains IDs, type, channel and timestamps, not message subjects/bodies or contact identifiers. Backend allowlist is authoritative. The backend overwrites `requiresApproval` based on the allowlist and confidence; the model cannot downgrade an action's approval requirement. The recommendation callback keeps the execution claim active when approval is needed; the IF node reads the backend `requiresHumanApproval` field, and the review callback records the `n8nExecutionId`, creates/reuses the review or notification, then releases the claim. The non-approval path finalizes the run in the recommendation callback. Evidence IDs are verified against the authorized entity. Existing ReviewTask schema requires a Lead; Lead recommendations requiring review create/reuse a ReviewTask, while Customer recommendations create an owner notification and remain pending approval. No action is executed automatically.

## WF11 — Sales Meeting

User routes:

- `POST /api/v1/sales-meetings/requests` (JWT + `Idempotency-Key`)
- `GET /api/v1/sales-meetings/:meetingId` (owner/attendee/Admin scoped)
- `PATCH /api/v1/sales-meetings/action-items/:actionItemId/confirmation` (owner/attendee/Admin scoped)

Internal n8n routes (`N8nAuthGuard`):

- `POST /api/v1/internal/n8n/conversation-transcripts` — requires the current `n8nExecutionId`; atomically claims the WorkflowRun and persists the redacted transcript in one locked transaction.
- `GET /api/v1/internal/n8n/sales-meetings/:meetingId/context`
- `POST /api/v1/internal/n8n/sales-meetings/:meetingId/summary`
- `POST /api/v1/internal/n8n/conversation-summaries/:summaryId/action-items`
- `POST /api/v1/internal/n8n/sales-meetings/notify`

Transcript and meeting-purpose text are redacted by NestJS before dispatch and again minimized in n8n. Internal attendee context exposes only attendee IDs/roles and non-identifying company attributes; attendee names/emails are not included. Transcript is redacted by NestJS before dispatch and again by the n8n minimization node. The backend redactor covers email, phone/identifier, credential key/value, account-number, address and names exposed by common honorific/label patterns. This remains heuristic pattern-based minimization, not certified DLP: names without identifying context and arbitrary sensitive prose may remain. In production, WF11 transcript processing is blocked unless `TRANSCRIPT_EXTERNAL_PROCESSING_ENABLED=true` is explicitly set after data classification, provider terms and retention policy are approved; the default is false. Do not send regulated/highly sensitive recordings without a vetted DLP/retention policy. This patch receives transcript text from an authorized API caller; it does not implement calendar/recording provider connectors.

AI-proposed action items are always saved as `PENDING_CONFIRMATION`; an authorized user must confirm/reject them. Summary notifications are in-app and idempotent.

WF09 and WF11 share the conversation transcript/summary/action-item domain. Coordinate schema ownership with the WF09 owner before merging concurrent changes.

## WF12 — Quote & Proposal

User routes:

- `GET /api/v1/catalog/items` (JWT)
- `POST /api/v1/catalog/items` and `PATCH /api/v1/catalog/items/:id` (Admin enforced in service)
- `POST /api/v1/quotes/requests` (JWT + `Idempotency-Key`)
- `GET /api/v1/quotes`, `GET /api/v1/quotes/:quoteId`
- `POST /api/v1/quotes/:quoteId/approve` and `/reject` (Admin enforced in service)

Internal n8n routes (`N8nAuthGuard`):

- `POST /api/v1/internal/n8n/quotes/claim-and-entity-context` — validates quote entity/run scope and claims the active WorkflowRun before returning context; competing executions receive HTTP 409.
- `GET /api/v1/internal/n8n/quotes/entity-context`
- `GET /api/v1/internal/n8n/catalog/items`
- `POST /api/v1/internal/n8n/quotes/price-preview`
- `POST /api/v1/internal/n8n/quotes`
- `POST /api/v1/internal/n8n/quotes/:quoteId/submit-for-approval`

The quote entity-context endpoint returns only company/profile attributes (no contact name, email or phone), and free-form requirements are pattern-redacted before Gemini. NestJS recomputes all prices/taxes from the active catalog and the original WorkflowRun request. Model-provided prices/discounts are ignored. V1 does not support discounts. `QUOTE_APPROVAL_THRESHOLD` defaults to `0`, which intentionally requires approval for every quote until a business threshold is formally agreed. Quote approvals are stored in a dedicated `quote_approvals` table because existing ReviewTask requires a Lead. Admin approval/rejection finalizes the quote WorkflowRun.

## Shared execution recovery

WF10/WF12 use an atomic execution claim with a 20-minute default lease. WF10 renews while fetching final context before AI; WF12 renews when loading the catalog. WF11 claims and sets the lease in the same locked transaction that persists the backend-redacted transcript, then renews when fetching meeting context. The lease is configurable with `N8N_WORKFLOW_CLAIM_LEASE_SECONDS` (60–3600 seconds). An expired claim can be recovered by a new n8n execution under a row lock. The shared Error Trigger export is `integrations/n8n/workflows/t12-error-handler.json`; transactional outbox dispatch uses the common 1/5/15-minute retry delays and four total attempts before terminal failure. after import, select it as the Error Workflow in each WF10/WF11/WF12 workflow. It records only an allowlisted error category and failed-node label; it never sends raw provider errors or stack traces to NestJS. A failure before the first claim can terminally fail an unclaimed active run when the Error Handler recovers its `workflowRunId`; a stale failure from an execution that has been replaced is rejected. The error handler must not be assigned to itself.

## Shared persistence and migration

- `WorkflowRun.idempotencyKey` and `Notification.idempotencyKey` are nullable with unique partial indexes.
- New domain tables: next_best_action_recommendations, sales_meetings, conversation_transcripts, conversation_summaries, conversation_action_items, product_catalog_items, quotes, quote_items, quote_approvals.
- Migrations: `1793476800000-AddT12WorkflowDomains` and `1793477100000-AddWorkflowExecutionClaimLease`.
- The migration is registered in `src/data-source.ts`. `AppModule` registers `T12WorkflowsModule`.

Before running `pnpm migration:run`, back up the target database and confirm the correct environment/database URL. The shell installer does not run migrations or touch the database.

## Environment variables

- `BACKEND_INTERNAL_URL` — n8n URL used by HTTP Request nodes, e.g. `http://host.docker.internal:3000` when n8n runs in Docker and backend runs on host; choose a reachable URL for your deployment.
- `N8N_API_KEY` (or `N8N_WEBHOOK_SECRET`) — shared secret. Internal HTTP Request nodes send `X-N8N-API-KEY`; dispatch sends same header to protected n8n webhook.
- `N8N_BASE_URL` or per-flow `N8N_WF10_WEBHOOK_URL`, `N8N_WF11_WEBHOOK_URL`, `N8N_WF12_WEBHOOK_URL` — n8n webhook dispatch destination. Production requires HTTPS for these URLs and `N8N_WEBHOOK_BASE_URL`.
- `TRANSCRIPT_EXTERNAL_PROCESSING_ENABLED` — defaults to `false`; set to `true` only after the WF11 transcript-to-AI data-processing policy is approved. Production requests are rejected with HTTP 503 while disabled, and transcript-bearing outbox deliveries are blocked.
- Production requires `DATABASE_URL` with `USE_LOCAL_DB=false` and `RABBITMQ_URL` using `amqps://`; startup fails closed instead of falling back to local DB/broker defaults.
- `GEMINI_API_KEY`, optional `GEMINI_MODEL` — configured in n8n for Gemini nodes.
- `QUOTE_APPROVAL_THRESHOLD` — monetary approval threshold; `0`/unset means all quotes require approval.
- `N8N_WORKFLOW_CLAIM_LEASE_SECONDS` — execution claim lease duration, default `1200`, minimum `60`, maximum `3600`.

## Workflow exports included

- WF08 `uc10-ai-crm-data-cleaning.json` — callback corrected to the existing `/api/v1/data-cleaning/callback` route.
- WF11 `t12-wf11-sales-meeting.json` and WF12 `t12-wf12-quote-proposal.json` — updated to match internal routes in this patch.
- WF01 is intentionally not overwritten; retain the already-installed WF01 backend patch.
- WF10 workflow JSON matches internal route names and sends its n8n execution ID for claim-lease renewal.
- `t12-error-handler.json` is the shared failure callback workflow; it must be imported and selected manually as each business workflow's Error Workflow after import.
- WF02/WF03/WF04 workflows are untouched.
