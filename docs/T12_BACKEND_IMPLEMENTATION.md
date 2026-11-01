# T12 Backend Implementation — WF01/WF08/WF10/WF11/WF12

This patch implements backend API and persistence support for the five workflows owned by Tuấn Anh. It deliberately does not modify WF02, WF03, or WF04 source/workflow files.

## Existing prerequisites

- WF01 Lead Intelligence internal routes/controller/service were delivered in the earlier `wf01-backend-patch`. Keep that code; this patch does not overwrite it. The user previously reported 56/56 passing tests for the two WF01 target suites.
- Existing Data Cleaning routes remain authoritative: `GET /api/v1/data-cleaning/scans/:workflowRunId/leads` and `POST /api/v1/data-cleaning/callback` are already guarded by `N8nAuthGuard`.
- Root API prefix is `/api/v1`.

## WF08 — Data Cleaning

New internal routes:

- `GET /api/v1/internal/n8n/data-cleaning/scans/:workflowRunId`
- `POST /api/v1/internal/n8n/data-cleaning/notify-reviewer`

Both use `N8nAuthGuard`. The existing callback stays at `/api/v1/data-cleaning/callback`; the workflow export in this bundle is corrected to that actual route. Scan notification is idempotent and targets the requesting user only when persisted findings include human-review items. It does not apply data changes or create ReviewTask. Actual data changes still occur only through existing user-authenticated `applyCleaning()` after backend freshness/allowlist/transaction checks.

The patch mutates the existing `DataCleaningService` and DTO barrel through an idempotent Python mutator to preserve local uncommitted changes; it does not replace the entire service file.

## WF10 — Next Best Action

User routes:

- `POST /api/v1/next-best-actions/requests` (JWT + `Idempotency-Key`)
- `GET /api/v1/next-best-actions/:recommendationId` (owner/Admin scoped)

Internal n8n routes (`N8nAuthGuard`):

- `GET /api/v1/internal/n8n/next-best-actions/entity-context`
- `GET /api/v1/internal/n8n/next-best-actions/intelligence-context`
- `GET /api/v1/internal/n8n/next-best-actions/interactions`
- `GET /api/v1/internal/n8n/next-best-actions/follow-up-segment-context`
- `POST /api/v1/internal/n8n/next-best-actions/callback`
- `POST /api/v1/internal/n8n/next-best-actions/review`

Backend allowlist is authoritative. The backend overwrites `requiresApproval` based on the allowlist and confidence; the model cannot downgrade an action's approval requirement. Evidence IDs are verified against the authorized entity. Existing ReviewTask schema requires a Lead; Lead recommendations requiring review create/reuse a ReviewTask, while Customer recommendations create an owner notification and remain pending approval. No action is executed automatically.

## WF11 — Sales Meeting

User routes:

- `POST /api/v1/sales-meetings/requests` (JWT + `Idempotency-Key`)
- `GET /api/v1/sales-meetings/:meetingId` (owner/attendee/Admin scoped)
- `PATCH /api/v1/sales-meetings/action-items/:actionItemId/confirmation` (owner/attendee/Admin scoped)

Internal n8n routes (`N8nAuthGuard`):

- `POST /api/v1/internal/n8n/conversation-transcripts`
- `GET /api/v1/internal/n8n/sales-meetings/:meetingId/context`
- `POST /api/v1/internal/n8n/sales-meetings/:meetingId/summary`
- `POST /api/v1/internal/n8n/conversation-summaries/:summaryId/action-items`
- `POST /api/v1/internal/n8n/sales-meetings/notify`

Transcript is redacted once by NestJS before dispatch and again by the n8n minimization node. Redaction is conservative pattern-based minimization (email/phone/common ID patterns), not certified DLP. Do not send regulated/highly sensitive recordings until a vetted DLP/retention policy is approved. This patch receives transcript text from an authorized API caller; it does not implement calendar/recording provider connectors.

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

- `GET /api/v1/internal/n8n/quotes/entity-context`
- `GET /api/v1/internal/n8n/catalog/items`
- `POST /api/v1/internal/n8n/quotes/price-preview`
- `POST /api/v1/internal/n8n/quotes`
- `POST /api/v1/internal/n8n/quotes/:quoteId/submit-for-approval`

NestJS recomputes all prices/taxes from the active catalog and the original WorkflowRun request. Model-provided prices/discounts are ignored. V1 does not support discounts. `QUOTE_APPROVAL_THRESHOLD` defaults to `0`, which intentionally requires approval for every quote until a business threshold is formally agreed. Quote approvals are stored in a dedicated `quote_approvals` table because existing ReviewTask requires a Lead. Admin approval/rejection finalizes the quote WorkflowRun.

## Shared persistence and migration

- `WorkflowRun.idempotencyKey` and `Notification.idempotencyKey` are nullable with unique partial indexes.
- New domain tables: next_best_action_recommendations, sales_meetings, conversation_transcripts, conversation_summaries, conversation_action_items, product_catalog_items, quotes, quote_items, quote_approvals.
- Migration: `1793476800000-AddT12WorkflowDomains`.
- The migration is registered in `src/data-source.ts`. `AppModule` registers `T12WorkflowsModule`.

Before running `pnpm migration:run`, back up the target database and confirm the correct environment/database URL. The shell installer does not run migrations or touch the database.

## Environment variables

- `BACKEND_INTERNAL_URL` — n8n URL used by HTTP Request nodes, e.g. `http://host.docker.internal:3000` when n8n runs in Docker and backend runs on host; choose a reachable URL for your deployment.
- `N8N_API_KEY` (or `N8N_WEBHOOK_SECRET`) — shared secret. Internal HTTP Request nodes send `X-N8N-API-KEY`; dispatch sends same header to protected n8n webhook.
- `N8N_BASE_URL` or per-flow `N8N_WF10_WEBHOOK_URL`, `N8N_WF11_WEBHOOK_URL`, `N8N_WF12_WEBHOOK_URL` — n8n webhook dispatch destination.
- `GEMINI_API_KEY`, optional `GEMINI_MODEL` — configured in n8n for Gemini nodes.
- `QUOTE_APPROVAL_THRESHOLD` — monetary approval threshold; `0`/unset means all quotes require approval.

## Workflow exports included

- WF08 `uc10-ai-crm-data-cleaning.json` — callback corrected to the existing `/api/v1/data-cleaning/callback` route.
- WF11 `t12-wf11-sales-meeting.json` and WF12 `t12-wf12-quote-proposal.json` — updated to match internal routes in this patch.
- WF01 is intentionally not overwritten; retain the already-installed WF01 backend patch.
- WF10 workflow JSON already matches internal route names in the current five-workflow bundle.
- WF02/WF03/WF04 workflows are untouched.
